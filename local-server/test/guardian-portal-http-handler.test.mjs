import test from "node:test";
import assert from "node:assert/strict";
import { createGuardianPortalHttpHandler } from "../src/security/guardian-portal-http-handler.mjs";

const ORIGIN = "https://localhost:4174";
const GUARDIAN_ID = "11111111-2222-4333-8444-555555555555";

function responseRecorder() {
  return {
    status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = "") { this.body = body; }
  };
}
function request({ path = "/api/v1/guardian/learners", method = "GET", encrypted = true, host = "localhost:4174", cookie = "__Host-cornhill_session=" + "A".repeat(43) } = {}) {
  return { url: path, method, headers: { host, cookie }, socket: { encrypted } };
}
function dependencies({ principal = { id: GUARDIAN_ID, principalType: "guardian", accountStatus: "active" }, learners = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    authService: { async authenticate(input) { calls.push({ type: "auth", input }); if (error) throw error; return principal; } },
    repository: { async listApprovedLearners(id) { calls.push({ type: "list", id }); if (error) throw error; return learners; } }
  };
}

test("guardian endpoint returns only repository-approved learner profiles", async () => {
  const learner = { learnerId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", pupilCode: "CH-2026-000001", firstName: "A", lastName: "Learner" };
  const deps = dependencies({ learners: [learner] });
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  assert.equal(await handler(request(), res), true);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { learners: [learner] });
  assert.equal(deps.calls.find(x => x.type === "list").id, GUARDIAN_ID);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("guardian endpoint authenticates using the secure session cookie", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request(), res);
  assert.equal(deps.calls[0].input.method, "GET");
  assert.match(deps.calls[0].input.sessionToken, /^A{43}$/);
});

test("staff principals cannot use guardian portal", async () => {
  const deps = dependencies({ principal: { id: GUARDIAN_ID, principalType: "staff", accountStatus: "active" } });
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request(), res);
  assert.equal(res.status, 403);
  assert.equal(deps.calls.some(x => x.type === "list"), false);
});

test("inactive guardian principals are denied", async () => {
  const deps = dependencies({ principal: { id: GUARDIAN_ID, principalType: "guardian", accountStatus: "suspended" } });
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request(), res);
  assert.equal(res.status, 403);
  assert.equal(deps.calls.some(x => x.type === "list"), false);
});

test("missing or invalid session returns 401", async () => {
  const deps = dependencies({ error: new (await import("../src/security/auth-service.mjs")).AuthenticationError() });
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request({ cookie: "" }), res);
  assert.equal(res.status, 401);
});

test("unencrypted requests are rejected", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request({ encrypted: false }), res);
  assert.equal(res.status, 426);
  assert.equal(deps.calls.length, 0);
});

test("unexpected host is rejected before authentication", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request({ host: "attacker.example" }), res);
  assert.equal(res.status, 421);
  assert.equal(deps.calls.length, 0);
});

test("unsupported methods are rejected without loading learner data", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request({ method: "POST" }), res);
  assert.equal(res.status, 405);
  assert.equal(res.headers.Allow, "GET");
  assert.equal(deps.calls.length, 0);
});

test("unrelated routes are left for other handlers", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  assert.equal(await handler(request({ path: "/api/v1/school/learners" }), responseRecorder()), false);
  assert.equal(deps.calls.length, 0);
});

test("repository failures return a generic service error", async () => {
  const deps = dependencies({ error: new Error("private database detail") });
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request(), res);
  assert.equal(res.status, 503);
  assert.doesNotMatch(res.body, /private database detail/);
});

test("constructor rejects a non-HTTPS origin", () => {
  const deps = dependencies();
  assert.throws(() => createGuardianPortalHttpHandler({ ...deps, expectedOrigin: "http://localhost:4174" }), /HTTPS/);
});
