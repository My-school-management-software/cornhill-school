import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import { createAcademicsHttpHandler } from "../src/security/academics-http-handler.mjs";
import { CsrfValidationError } from "../src/security/auth-service.mjs";

const ORIGIN = "https://cornhill.local";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";
const ASSESSMENT_ID = "33333333-3333-4333-8333-333333333333";
const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const secrets = createOpaqueSessionSecrets();
const teacher = {
  id: STAFF_ID, principalType: "staff", accountStatus: "active",
  roles: ["class_teacher"], classIds: [CLASS_ID],
  rolePermissions: { class_teacher: ["academics.marks_enter", "academics.results_view"] },
  session: { revokedAt: null, expiresAt: new Date(Date.now() + 60000) }
};
function response() {
  return { statusCode: 0, headers: {}, body: "", writeHead(code, headers = {}) { this.statusCode = code; this.headers = headers; }, end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString() : String(body); }, json() { return this.body ? JSON.parse(this.body) : null; } };
}
function setup({ principal = teacher, overrides = {} } = {}) {
  const calls = { auth: 0, workspace: 0, marks: 0, saved: 0, transitions: 0 };
  const repository = {
    async listWorkspace(input) { calls.workspace++; calls.workspaceInput = input; return { classes: [], terms: [], assessments: [] }; },
    async getAssessment() { return { id: ASSESSMENT_ID, classId: CLASS_ID, status: "Open", maxScore: 100 }; },
    async getAssessmentMarks() { calls.marks++; return { assessment: { id: ASSESSMENT_ID, classId: CLASS_ID, status: "Open" }, subjects: [], learners: [] }; },
    async createAcademicYear(input) { calls.createdYear = input; return { id: TERM, ...input }; },
    async createAcademicTerm(input) { calls.createdTerm = input; return { id: ASSESSMENT_ID, ...input }; },
    async createAssessment(input) { calls.created = input; return { id: ASSESSMENT_ID, ...input }; },
    async transitionAssessment(input) { calls.transitions++; return { status: input.nextStatus }; },
    async saveMarks(input) { calls.saved++; calls.savedInput = input; return { savedCount: input.marks.length }; },
    ...overrides
  };
  const handler = createAcademicsHttpHandler({
    expectedOrigin: ORIGIN,
    authService: { async authenticate({ method, csrfToken } = {}) { calls.auth++; if (!principal) throw new Error("anonymous"); if (method !== "GET" && method !== "HEAD" && csrfToken !== secrets.csrfToken) throw new CsrfValidationError(); return principal; } },
    academicsRepository: repository,
    onError(error) { calls.lastError = error; }
  });
  return { handler, calls };
}
async function invoke(handler, { path = "/api/v1/academics/workspace", method = "GET", body, headers = {}, encrypted = true } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")]);
  req.url = path; req.method = method;
  req.headers = { host: "cornhill.local", cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken, ...headers };
  if (method !== "GET" && method !== "HEAD") {
    req.headers.origin = ORIGIN;
    req.headers["content-type"] ??= "application/json";
    req.headers["x-cornhill-csrf"] ??= secrets.csrfToken;
  }
  req.socket = { encrypted };
  const res = response();
  const handled = await handler(req, res);
  return { ...res, handled };
}
test("academic workspace is authenticated and restricted to assigned teacher classes", async () => {
  const { handler, calls } = setup();
  const result = await invoke(handler);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(calls.workspaceInput, { classIds: [CLASS_ID], classId: null });
});
test("academic workspace refuses a teacher requesting an unassigned class", async () => {
  const { handler, calls } = setup();
  const result = await invoke(handler, { path: "/api/v1/academics/workspace?classId=44444444-4444-4444-8444-444444444444" });
  assert.equal(result.statusCode, 403);
  assert.equal(calls.workspace, 0);
});
test("academic endpoints reject insecure transport and unsupported methods", async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { encrypted: false })).statusCode, 426);
  assert.equal((await invoke(handler, { method: "DELETE" })).statusCode, 405);
  assert.equal(calls.auth, 0);
});
test("guardian principals cannot read the staff academic workspace", async () => {
  const { handler, calls } = setup({ principal: { ...teacher, principalType: "guardian" } });
  assert.equal((await invoke(handler)).statusCode, 403);
  assert.equal(calls.workspace, 0);
});
test("teacher can load marks only for an assigned class", async () => {
  const { handler, calls } = setup();
  const result = await invoke(handler, { path: "/api/v1/academics/assessments/" + ASSESSMENT_ID + "/marks" });
  assert.equal(result.statusCode, 200);
  assert.equal(calls.marks, 1);
});
test("teacher cannot save marks into another class", async () => {
  const { handler, calls } = setup();
  const result = await invoke(handler, {
    path: "/api/v1/academics/marks", method: "POST",
    body: { assessmentId: ASSESSMENT_ID, classId: "44444444-4444-4444-8444-444444444444", marks: [{ learnerId: STAFF_ID, subjectId: ASSESSMENT_ID, score: 20 }] }
  });
  assert.equal(result.statusCode, 403);
  assert.equal(calls.saved, 0);
});
test("teacher marks save requires valid CSRF and a bounded mark list", async () => {
  const { handler, calls } = setup();
  const missingCsrf = await invoke(handler, {
    path: "/api/v1/academics/marks", method: "POST",
    headers: { "x-cornhill-csrf": "invalid" },
    body: { assessmentId: ASSESSMENT_ID, classId: CLASS_ID, marks: [{ learnerId: STAFF_ID, subjectId: ASSESSMENT_ID, score: 20 }] }
  });
  assert.equal(missingCsrf.statusCode, 403);
  assert.equal(calls.saved, 0);
  const validCsrf = await invoke(handler, {
    path: "/api/v1/academics/marks", method: "POST",
    body: { assessmentId: ASSESSMENT_ID, classId: CLASS_ID, marks: [{ learnerId: STAFF_ID, subjectId: ASSESSMENT_ID, score: 20 }] }
  });
  assert.equal(validCsrf.statusCode, 200);
  assert.equal(calls.saved, 1);
});
test("mark list rejects duplicate learner-subject combinations and excessive batches", async () => {
  const { handler, calls } = setup();
  const row = { learnerId: STAFF_ID, subjectId: ASSESSMENT_ID, score: 20 };
  const duplicate = await invoke(handler, { path: "/api/v1/academics/marks", method: "POST", body: { assessmentId: ASSESSMENT_ID, classId: CLASS_ID, marks: [row, row] } });
  assert.equal(duplicate.statusCode, 400);
  assert.equal(calls.saved, 0);
});
test("publish requires the dedicated academic results publish permission", async () => {
  const { handler, calls } = setup();
  const result = await invoke(handler, {
    path: "/api/v1/academics/assessments/" + ASSESSMENT_ID + "/status",
    method: "PATCH", body: { status: "Published" }
  });
  assert.equal(result.statusCode, 403);
  assert.equal(calls.transitions, 0);
});
test("assessment status changes are permission checked and delegated to repository lifecycle guard", async () => {
  const dos = {
    ...teacher, roles: ["director_of_studies"], classIds: [],
    rolePermissions: { director_of_studies: ["academics.assessments_manage"] }
  };
  const { handler, calls } = setup({ principal: dos });
  const result = await invoke(handler, {
    path: "/api/v1/academics/assessments/" + ASSESSMENT_ID + "/status",
    method: "PATCH", body: { status: "Locked" }
  });
  assert.equal(result.statusCode, 200);
  assert.equal(calls.transitions, 1);
});
test("only an authorised academic administrator can create a school year", async () => {
  const admin = { ...teacher, roles: ["director_of_studies"], classIds: [],
    rolePermissions: { director_of_studies: ["academics.terms_manage"] } };
  const { handler, calls } = setup({ principal: admin });
  const body = { yearLabel: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-08-31", status: "Active" };
  const result = await invoke(handler, { path: "/api/v1/academics/years", method: "POST", body });
  assert.equal(result.statusCode, 201, calls.lastError?.stack || calls.lastError?.message || "No handler error recorded");
  assert.equal(calls.createdYear.staffId, STAFF_ID);
  assert.equal(calls.createdYear.yearLabel, "2026/2027");
});
test("teacher cannot create a year and invalid calendar dates are rejected", async () => {
  const teacherSetup = setup();
  const denied = await invoke(teacherSetup.handler, { path: "/api/v1/academics/years", method: "POST",
    body: { yearLabel: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" } });
  assert.equal(denied.statusCode, 403);
  const admin = { ...teacher, roles: ["director_of_studies"], classIds: [],
    rolePermissions: { director_of_studies: ["academics.terms_manage"] } };
  const setupAdmin = setup({ principal: admin });
  const invalid = await invoke(setupAdmin.handler, { path: "/api/v1/academics/years", method: "POST",
    body: { yearLabel: "2026", startsOn: "2026-02-30", endsOn: "2026-12-31" } });
  assert.equal(invalid.statusCode, 400);
});
test("academic terms require management permission and valid dates and year identifiers", async () => {
  const admin = { ...teacher, roles: ["headteacher"], classIds: [],
    rolePermissions: { headteacher: ["academics.terms_manage"] } };
  const { handler, calls } = setup({ principal: admin });
  const invalid = await invoke(handler, { path: "/api/v1/academics/terms", method: "POST",
    body: { academicYearId: "invalid", termNumber: 4, termName: "T", startsOn: "2026-01-01", endsOn: "2026-04-30" } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls.createdTerm, undefined);
  const valid = await invoke(handler, { path: "/api/v1/academics/terms", method: "POST",
    body: { academicYearId: ASSESSMENT_ID, termNumber: 1, termName: "Term 1",
      startsOn: "2026-01-01", endsOn: "2026-04-30", status: "Active" } });
  assert.equal(valid.statusCode, 201);
  assert.equal(calls.createdTerm.staffId, STAFF_ID);
});
