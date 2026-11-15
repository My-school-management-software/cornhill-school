import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAdmissionsHttpHandler } from "../src/security/admissions-http-handler.mjs";

const ORIGIN = "https://cornhill.local";
const CLASS = "22222222-2222-4222-8222-222222222222";
const STAFF = {
  id: "11111111-1111-4111-8111-111111111111",
  principalType: "staff",
  accountStatus: "active",
  roles: ["headteacher"],
  rolePermissions: { headteacher: ["admissions.register_learner", "learners.lin_manage", "learners.guardians_manage"] },
  session: { revokedAt: null, expiresAt: new Date(Date.now() + 60000) }
};
const VALID = {
  firstName: "Amina", lastName: "Nabirye", gender: "Female", classId: CLASS,
  admissionDate: "2026-01-12", isBursary: false, bursaryFeeUgx: 0
};
function response() {
  return { statusCode: 0, headers: {}, body: "",
    writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; },
    end(body = "") { this.body = String(body); },
    json() { return JSON.parse(this.body); }
  };
}
function setup({ principal = STAFF, repositoryError = null } = {}) {
  const calls = [];
  const handler = createAdmissionsHttpHandler({
    expectedOrigin: ORIGIN,
    authService: { async authenticate() { return principal; } },
    admissionsRepository: { async registerLearner(input) {
      calls.push(input);
      if (repositoryError) throw repositoryError;
      return { id: "33333333-3333-4333-8333-333333333333", pupil_code: "CH-2026-000001", ...input };
    } }
  });
  return { handler, calls };
}
async function invoke(handler, body, { method = "POST", headers = {
  host: "cornhill.local", origin: ORIGIN, "content-type": "application/json"
}, encrypted = true } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.url = "/api/v1/school/admissions";
  req.method = method;
  req.headers = headers;
  req.socket = { encrypted };
  const res = response();
  await handler(req, res);
  return res;
}

test("authorised headteacher can register a provisional learner without classId", async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, { ...VALID, classId: undefined });
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0].classId, null);
});
test("authorised headteacher can register a provisional learner with classId null", async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, { ...VALID, classId: null });
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0].classId, null);
});
test("empty classId is normalised to null for provisional admission", async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, { ...VALID, classId: "" });
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0].classId, null);
});
test("valid active-class identifier is preserved in admission input", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, VALID)).statusCode, 201);
  assert.equal(calls[0].classId, CLASS);
});
test("malformed non-empty class identifier is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, classId: "P1" })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("class teacher cannot create an unassigned provisional learner", async () => {
  const teacher = { ...STAFF, roles: ["class_teacher"], rolePermissions: { class_teacher: ["admissions.register_learner"] }, classIds: [CLASS] };
  const { handler, calls } = setup({ principal: teacher });
  assert.equal((await invoke(handler, { ...VALID, classId: null })).statusCode, 403);
  assert.equal(calls.length, 0);
});
test("class teacher can register within an assigned class", async () => {
  const teacher = { ...STAFF, roles: ["class_teacher"], rolePermissions: { class_teacher: ["admissions.register_learner"] }, classIds: [CLASS] };
  const { handler, calls } = setup({ principal: teacher });
  assert.equal((await invoke(handler, VALID)).statusCode, 201);
  assert.equal(calls.length, 1);
});
test("bursary amount is retained for an authorised bursary admission", async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, { ...VALID, isBursary: true, bursaryFeeUgx: 75000 });
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0].bursaryFeeUgx, 75000);
});
test("negative bursary amount is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, isBursary: true, bursaryFeeUgx: -1 })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("fractional bursary amount is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, isBursary: true, bursaryFeeUgx: 1000.5 })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("unsafe integer bursary amount is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, isBursary: true, bursaryFeeUgx: Number.MAX_SAFE_INTEGER + 1 })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("bursary flag must be boolean when supplied", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, isBursary: "yes" })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("LIN is trimmed before repository write", async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, { ...VALID, lin: "  UG-LIN-001  " });
  assert.equal(res.statusCode, 201);
  assert.equal(calls[0].lin, "UG-LIN-001");
});
test("LIN requires its dedicated permission", async () => {
  const principal = { ...STAFF, rolePermissions: { headteacher: ["admissions.register_learner"] } };
  const { handler, calls } = setup({ principal });
  assert.equal((await invoke(handler, { ...VALID, lin: "UG-LIN-002" })).statusCode, 403);
  assert.equal(calls.length, 0);
});
test("invalid leap-day date of birth is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, dateOfBirth: "2025-02-29" })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("date of birth after admission date is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, dateOfBirth: "2026-01-13" })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("unsupported learner category is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { ...VALID, learnerType: "Remote" })).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("omitted learner category defaults to Day", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, VALID)).statusCode, 201);
  assert.equal(calls[0].learnerType, "Day");
});
test("guardian phone must use Uganda E.164 format", async () => {
  const { handler, calls } = setup();
  const body = { ...VALID, guardian: { name: "Parent One", phone: "0700000001" } };
  assert.equal((await invoke(handler, body)).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("guardian contact opt-in requires a matching phone number", async () => {
  const { handler, calls } = setup();
  const body = { ...VALID, guardian: { name: "Parent One", smsOptIn: true } };
  assert.equal((await invoke(handler, body)).statusCode, 400);
  assert.equal(calls.length, 0);
});
test("duplicate LIN conflict is returned as HTTP 409 without database detail", async () => {
  const { handler } = setup({ repositoryError: Object.assign(new Error("duplicate key secret detail"), { code: "23505" }) });
  const res = await invoke(handler, { ...VALID, lin: "UG-LIN-003" });
  assert.equal(res.statusCode, 409);
  assert.doesNotMatch(res.body, /secret detail/);
});
test("wrong request origin is rejected before repository write", async () => {
  const { handler, calls } = setup();
  const res = await invoke(handler, VALID, { headers: { host: "cornhill.local", origin: "https://outside.local", "content-type": "application/json" } });
  assert.equal(res.statusCode, 421);
  assert.equal(calls.length, 0);
});
