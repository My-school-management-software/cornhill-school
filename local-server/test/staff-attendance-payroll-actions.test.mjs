import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresStaffOperationsRepository } from "../src/db/staff-operations-repositories.mjs";
import { createStaffOperationsHttpHandler } from "../src/security/staff-operations-http-handler.mjs";

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const ATTENDANCE_ID = "22222222-2222-4222-8222-222222222222";
const DISBURSEMENT_ID = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://localhost:4174";

function response() {
  return { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body?.toString() ?? ""; } };
}
function request(path, body, { permission = "staff.attendance_review", method = "POST" } = {}) {
  return {
    method, url: path,
    headers: { host: "localhost:4174", origin: ORIGIN, "content-type": "application/json", "x-cornhill-csrf": "test-token", cookie: "" },
    socket: { encrypted: true },
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); }
  };
}
function makeHandler(permission, calls) {
  const principal = {
    principalType: "staff", id: STAFF_ID, accountStatus: "active", roles: ["director"],
    rolePermissions: { director: [permission] },
    session: { revokedAt: null, expiresAt: Date.now() + 60_000 }
  };
  const repository = {
    async getWorkspace(input) { calls.workspace = input; return { capabilities: {} }; },
    async submitLeaveRequest(input) { calls.leave = input; return input; },
    async recordAttendanceReview(input) { calls.attendance = input; return input; },
    async recordPayrollDisbursement(input) { calls.payroll = input; return input; },
    async verifyPayrollDisbursement(input) { calls.verify = input; return input; }
  };
  return createStaffOperationsHttpHandler({
    authService: { async authenticate() { return principal; } },
    repository, expectedOrigin: ORIGIN
  });
}

test("attendance day review writes append-only evidence using source day identity", async () => {
  const calls = [];
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ status: "Verified" }], rowCount: 1 }; }, async connect() { throw new Error("not used"); } };
  const repo = createPostgresStaffOperationsRepository(pool);
  const result = await repo.recordAttendanceReview({ attendanceDayId: ATTENDANCE_ID, reviewerStaffId: STAFF_ID, reviewStatus: "Verified", reviewNote: "Clock records checked" });
  assert.equal(result.status, "Verified");
  assert.match(calls[0].sql, /SELECT id,staff_account_id,work_date/);
  assert.deepEqual(calls[0].params, [ATTENDANCE_ID, STAFF_ID, "Verified", "Clock records checked"]);
});

test("payroll evidence recording validates UGX and binds the authenticated recorder", async () => {
  const calls = [];
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ status: "Pending Verification" }], rowCount: 1 }; }, async connect() { throw new Error("not used"); } };
  const repo = createPostgresStaffOperationsRepository(pool);
  const result = await repo.recordPayrollDisbursement({ payrollLineId: ATTENDANCE_ID, recorderStaffId: STAFF_ID, amountUgx: 125000, paymentMethod: "Bank Transfer", externalReference: "BANK-123", paidAt: "2026-11-15T10:00:00+03:00" });
  assert.equal(result.status, "Pending Verification");
  assert.match(calls[0].sql, /INSERT INTO cornhill_school.payroll_disbursements/);
  assert.equal(calls[0].params[5], STAFF_ID);
  await assert.rejects(repo.recordPayrollDisbursement({ payrollLineId: ATTENDANCE_ID, recorderStaffId: STAFF_ID, amountUgx: -1, paymentMethod: "Cash", paidAt: "2026-11-15T10:00:00Z" }));
  await assert.rejects(repo.recordPayrollDisbursement({ payrollLineId: ATTENDANCE_ID, recorderStaffId: STAFF_ID, amountUgx: 10, paymentMethod: "Bank Transfer", externalReference: "", paidAt: "2026-11-15T10:00:00" }));
});

test("payroll verification only changes a pending item and uses the authenticated reviewer", async () => {
  const calls = [];
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ status: "Verified" }], rowCount: 1 }; }, async connect() { throw new Error("not used"); } };
  const repo = createPostgresStaffOperationsRepository(pool);
  const result = await repo.verifyPayrollDisbursement({ disbursementId: DISBURSEMENT_ID, verifierStaffId: STAFF_ID, decision: "Verified" });
  assert.equal(result.status, "Verified");
  assert.match(calls[0].sql, /WHERE id=\$1::uuid AND disbursement_status='Pending Verification'/);
  assert.deepEqual(calls[0].params, [DISBURSEMENT_ID, "Verified", STAFF_ID, null]);
});

test("attendance review endpoint requires permission and takes reviewer identity from the session", async () => {
  const calls = {};
  const handler = makeHandler("staff.attendance_review", calls);
  const res = response();
  await handler(request("/api/v1/staff/attendance/days/" + ATTENDANCE_ID + "/review", { reviewStatus: "Verified", reviewNote: "Checked against source records", reviewerStaffId: "99999999-9999-4999-8999-999999999999" }), res);
  assert.equal(res.status, 201);
  assert.equal(calls.attendance.reviewerStaffId, STAFF_ID);
  assert.equal(calls.attendance.reviewStatus, "Verified");
});

test("payroll record and verification endpoints require separate permissions and bind the session actor", async () => {
  const recordCalls = {};
  const recordHandler = makeHandler("staff.payroll_disbursements_manage", recordCalls);
  const recordResponse = response();
  await recordHandler(request("/api/v1/staff/payroll/disbursements", { payrollLineId: ATTENDANCE_ID, amountUgx: 150000, paymentMethod: "Bank Transfer", externalReference: "BANK-REF-123", paidAt: "2026-11-15T10:00:00+03:00", recordedByStaffId: "99999999-9999-4999-8999-999999999999" }, { permission: "staff.payroll_disbursements_manage" }), recordResponse);
  assert.equal(recordResponse.status, 201);
  assert.equal(recordCalls.payroll.recorderStaffId, STAFF_ID);

  const verifyCalls = {};
  const verifyHandler = makeHandler("staff.payroll_disbursements_verify", verifyCalls);
  const verifyResponse = response();
  await verifyHandler(request("/api/v1/staff/payroll/disbursements/" + DISBURSEMENT_ID + "/verify", { decision: "Rejected", verificationNote: "Reference did not match", verifierStaffId: "99999999-9999-4999-8999-999999999999" }, { permission: "staff.payroll_disbursements_verify" }), verifyResponse);
  assert.equal(verifyResponse.status, 200);
  assert.equal(verifyCalls.verify.verifierStaffId, STAFF_ID);
});

test("attendance or payroll action cannot be submitted using a different permission", async () => {
  const calls = {};
  const handler = makeHandler("staff.payroll_read", calls);
  const res = response();
  await handler(request("/api/v1/staff/payroll/disbursements", {}, { permission: "staff.payroll_read" }), res);
  assert.equal(res.status, 403);
  assert.equal(calls.payroll, undefined);
});
