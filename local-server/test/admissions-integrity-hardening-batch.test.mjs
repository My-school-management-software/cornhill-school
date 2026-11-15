import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAdmissionsHttpHandler } from "../src/security/admissions-http-handler.mjs";

const ORIGIN = "https://cornhill.local";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";
const STAFF = {
  id: "11111111-1111-4111-8111-111111111111",
  principalType: "staff",
  roles: ["headteacher"],
  rolePermissions: { headteacher: [
    "admissions.register_learner", "learners.lin_manage", "learners.guardians_manage"
  ] }
};
const valid = {
  firstName: "Amina", lastName: "Nabirye", gender: "Female",
  classId: CLASS_ID, admissionDate: "2026-01-12",
  isBursary: true, bursaryFeeUgx: 50000
};

function setup({ principal = STAFF, registerError = null } = {}) {
  const calls = { auth: 0, registrations: [] };
  const handler = createAdmissionsHttpHandler({
    expectedOrigin: ORIGIN,
    authService: { async authenticate() { calls.auth++; return principal; } },
    admissionsRepository: { async registerLearner(input) {
      calls.registrations.push(input);
      if (registerError) throw registerError;
      return { id: "33333333-3333-4333-8333-333333333333",
        pupil_code: "CH-2026-000001", ...input };
    } }
  });
  return { handler, calls };
}

async function request(handler, body = valid, { raw = null, headers = {}, method = "POST",
  encrypted = true } = {}) {
  const bytes = raw ?? (body === undefined ? "" : JSON.stringify(body));
  const req = Readable.from(bytes === "" ? [] : [Buffer.from(bytes)]);
  req.url = "/api/v1/school/admissions";
  req.method = method;
  req.headers = {
    host: "cornhill.local", origin: ORIGIN, "content-type": "application/json", ...headers
  };
  req.socket = { encrypted };
  const res = {
    statusCode: 0, headers: {}, body: "",
    writeHead(code, value = {}) { this.statusCode = code; this.headers = value; },
    end(value = "") { this.body = String(value); },
    json() { return this.body ? JSON.parse(this.body) : null; }
  };
  await handler(req, res);
  return res;
}

test("valid admission preserves the permanent code returned by the database", async () => {
  const { handler, calls } = setup();
  const r = await request(handler);
  assert.equal(r.statusCode, 201);
  assert.equal(r.json().learner.pupil_code, "CH-2026-000001");
  assert.equal(calls.registrations.length, 1);
});

test("valid boarding admission is retained as Boarding", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, { ...valid, learnerType: "Boarding" })).statusCode, 201);
  assert.equal(calls.registrations[0].learnerType, "Boarding");
});

test("valid day admission defaults to Day", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler)).statusCode, 201);
  assert.equal(calls.registrations[0].learnerType, "Day");
});

test("valid leap-day date of birth is accepted", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, dateOfBirth: "2016-02-29" })).statusCode, 201);
});

test("impossible non-leap February date is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, { ...valid, dateOfBirth: "2015-02-29" })).statusCode, 400);
  assert.equal(calls.registrations.length, 0);
});

test("impossible month-day combination is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, admissionDate: "2026-04-31" })).statusCode, 400);
});

test("month zero is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, admissionDate: "2026-00-12" })).statusCode, 400);
});

test("day zero is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, admissionDate: "2026-01-00" })).statusCode, 400);
});

test("non-padded admission date is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, admissionDate: "2026-1-2" })).statusCode, 400);
});

test("date of birth after admission date is rejected", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, { ...valid, dateOfBirth: "2026-02-01" })).statusCode, 400);
  assert.equal(calls.registrations.length, 0);
});

test("date of birth equal to admission date is accepted", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, dateOfBirth: valid.admissionDate })).statusCode, 201);
});

test("unknown learner category is rejected instead of silently becoming Day", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, { ...valid, learnerType: "Remote" })).statusCode, 400);
  assert.equal(calls.registrations.length, 0);
});

test("empty learner category is rejected when explicitly supplied", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, learnerType: "" })).statusCode, 400);
});

test("string-valued bursary flag is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, isBursary: "true" })).statusCode, 400);
});

test("numeric bursary flag is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, isBursary: 1 })).statusCode, 400);
});

test("negative bursary amount is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, bursaryFeeUgx: -1 })).statusCode, 400);
});

test("fractional UGX bursary amount is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, bursaryFeeUgx: 2500.5 })).statusCode, 400);
});

test("unsafe integer bursary amount is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, bursaryFeeUgx: Number.MAX_SAFE_INTEGER + 1 })).statusCode, 400);
});

test("non-bursary learner cannot be assigned a bursary amount", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, isBursary: false, bursaryFeeUgx: 1000 })).statusCode, 400);
});

test("bursary learner may have a zero-UGX obligation", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, bursaryFeeUgx: 0 })).statusCode, 201);
});

test("invalid class identifier is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, classId: "P7" })).statusCode, 400);
});

test("blank first name is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, firstName: "  " })).statusCode, 400);
});

test("overlong surname is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, lastName: "N".repeat(81) })).statusCode, 400);
});

test("unsupported gender is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, { ...valid, gender: "Other" })).statusCode, 400);
});

test("LIN permission is checked before repository writes", async () => {
  const principal = { ...STAFF, rolePermissions: { headteacher: ["admissions.register_learner"] } };
  const { handler, calls } = setup({ principal });
  assert.equal((await request(handler, { ...valid, lin: "UG-LIN-001" })).statusCode, 403);
  assert.equal(calls.registrations.length, 0);
});

test("duplicate LIN database constraint is reported as conflict", async () => {
  const { handler } = setup({ registerError: Object.assign(new Error("duplicate"), { code: "23505" }) });
  assert.equal((await request(handler, { ...valid, lin: "UG-LIN-001" })).statusCode, 409);
});

test("database failure does not leak internal error details", async () => {
  const { handler } = setup({ registerError: new Error("private database host") });
  const r = await request(handler);
  assert.equal(r.statusCode, 503);
  assert.doesNotMatch(r.body, /private database host/);
});

test("array JSON body is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, undefined, { raw: "[]" })).statusCode, 400);
});

test("malformed JSON is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, undefined, { raw: "{broken" })).statusCode, 400);
});

test("wrong content type is rejected", async () => {
  const { handler } = setup();
  assert.equal((await request(handler, valid, { headers: { "content-type": "text/plain" } })).statusCode, 415);
});

test("oversized admission request is rejected", async () => {
  const { handler } = setup();
  const huge = JSON.stringify({ ...valid, reason: "x".repeat(17000) });
  assert.equal((await request(handler, undefined, { raw: huge })).statusCode, 413);
});

test("unauthorised staff cannot register learners", async () => {
  const principal = { ...STAFF, rolePermissions: { headteacher: [] } };
  const { handler, calls } = setup({ principal });
  assert.equal((await request(handler)).statusCode, 403);
  assert.equal(calls.registrations.length, 0);
});

test("guardian principal cannot use staff admission endpoint", async () => {
  const { handler, calls } = setup({ principal: { ...STAFF, principalType: "guardian" } });
  assert.equal((await request(handler)).statusCode, 403);
  assert.equal(calls.registrations.length, 0);
});

test("class teacher is restricted to assigned classes", async () => {
  const teacher = { ...STAFF, roles: ["class_teacher"], classIds: [],
    rolePermissions: { class_teacher: ["admissions.register_learner"] } };
  const { handler, calls } = setup({ principal: teacher });
  assert.equal((await request(handler)).statusCode, 403);
  assert.equal(calls.registrations.length, 0);
});

test("insecure transport is rejected before authentication", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, valid, { encrypted: false })).statusCode, 426);
  assert.equal(calls.auth, 0);
});

test("wrong origin is rejected before authentication", async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, valid, { headers: { origin: "https://evil.example" } })).statusCode, 421);
  assert.equal(calls.auth, 0);
});

test("unsupported method returns Allow POST without authentication", async () => {
  const { handler, calls } = setup();
  const r = await request(handler, undefined, { method: "GET" });
  assert.equal(r.statusCode, 405);
  assert.equal(r.headers.Allow, "POST");
  assert.equal(calls.auth, 0);
});
