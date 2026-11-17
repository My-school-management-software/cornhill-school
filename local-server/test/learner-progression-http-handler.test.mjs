import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAdmissionsHttpHandler } from "../src/security/admissions-http-handler.mjs";

const ORIGIN = "https://cornhill.local";
const LEARNER_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const CLASS_ID = "33333333-3333-4333-8333-333333333333";
const TERM_ID = "44444444-4444-4444-8444-444444444444";
const director = {
  id: STAFF_ID, principalType: "staff", accountStatus: "active", roles: ["headteacher"],
  rolePermissions: { headteacher: ["learners.manage"] },
  session: { revokedAt: null, expiresAt: new Date(Date.now() + 60000) }
};

function setup({ principal = director } = {}) {
  const calls = [];
  const handler = createAdmissionsHttpHandler({
    expectedOrigin: ORIGIN,
    authService: { async authenticate() { return principal; } },
    admissionsRepository: {
      async registerLearner() { throw new Error("Unexpected admission."); },
      async progressLearner(input) {
        calls.push(input);
        return { progressionEventId: "55555555-5555-4555-8555-555555555555" };
      }
    }
  });
  return { handler, calls };
}

async function invoke(handler, body, { encrypted = true } = {}) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.url = "/api/v1/school/learners/" + LEARNER_ID + "/progression";
  request.method = "POST";
  request.headers = { host: "cornhill.local", origin: ORIGIN, "content-type": "application/json" };
  request.socket = { encrypted };
  const response = {
    statusCode: 0, headers: {}, body: "",
    writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; },
    end(bodyText = "") { this.body = String(bodyText); },
    json() { return JSON.parse(this.body); }
  };
  await handler(request, response);
  return response;
}

test("authorised school leader can record a term-linked learner progression", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    classId: CLASS_ID, academicTermId: TERM_ID,
    effectiveDate: "2026-11-01", reason: "Approved class progression"
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().progression.progressionEventId, "55555555-5555-4555-8555-555555555555");
  assert.deepEqual(calls[0], {
    learnerId: LEARNER_ID, actorStaffId: STAFF_ID, toClassId: CLASS_ID,
    academicTermId: TERM_ID, effectiveDate: "2026-11-01", reason: "Approved class progression"
  });
});

test("only staff with learner-management permission can progress learners", async () => {
  const teacher = { ...director, rolePermissions: { class_teacher: [] }, roles: ["class_teacher"] };
  const { handler, calls } = setup({ principal: teacher });
  const response = await invoke(handler, {
    classId: CLASS_ID, academicTermId: TERM_ID,
    effectiveDate: "2026-11-01", reason: "Not authorised"
  });
  assert.equal(response.statusCode, 403);
  assert.equal(calls.length, 0);
});

test("P.7 completion requires explicit null destination and valid period details", async () => {
  const { handler, calls } = setup();
  const valid = { classId: null, academicTermId: TERM_ID,
    effectiveDate: "2026-11-01", reason: "P.7 completion" };
  assert.equal((await invoke(handler, valid)).statusCode, 201);
  assert.equal(calls.length, 1);
  for (const invalid of [
    { ...valid, classId: undefined },
    { ...valid, academicTermId: "bad" },
    { ...valid, effectiveDate: "2026-02-30" },
    { ...valid, reason: "x" }
  ]) assert.equal((await invoke(handler, invalid)).statusCode, 400);
  assert.equal(calls.length, 1);
});
