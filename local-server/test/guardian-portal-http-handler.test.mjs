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
function request({ path = "/api/v1/guardian/learners?pupilCode=CH-2026-000001", method = "GET",
  encrypted = true, host = "localhost:4174", origin = ORIGIN, body, address = "127.0.0.1",
  cookie = "__Host-cornhill_session=" + "A".repeat(43) } = {}) {
  const req = { url: path, method, headers: { host, cookie, origin },
    socket: { encrypted, remoteAddress: address } };
  if (body !== undefined) {
    req.headers["content-type"] = "application/json";
    req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body)); };
  }
  return req;
}
function dependencies({ principal = { id: GUARDIAN_ID, principalType: "guardian", accountStatus: "active" }, learners = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    authService: { async authenticate(input) { calls.push({ type: "auth", input }); if (error) throw error; return principal; } },
    repository: {
      async listApprovedLearners(id, pupilCode) {
        calls.push({ type: "list", id, pupilCode }); if (error) throw error; return learners;
      },
      async verifyRegisteredLearnerGuardian(pupilCode, phone) {
        calls.push({ type: "verify", pupilCode, phone });
        if (error) throw error;
        return pupilCode === "CH-2026-000001" && phone === "+256700000001";
      }
    }
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
  assert.equal(deps.calls.find(x => x.type === "list").pupilCode, "CH-2026-000001");
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
  assert.doesNotMatch(String(res.body), /private database detail/);
});

test("constructor rejects a non-HTTPS origin", () => {
  const deps = dependencies();
  assert.throws(() => createGuardianPortalHttpHandler({ ...deps, expectedOrigin: "http://localhost:4174" }), /HTTPS/);
});

test("parent enters learner code and registered phone before the school-issued PIN step", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const matched = responseRecorder();
  await handler(request({ path: "/api/v1/guardian/entry-check", method: "POST",
    body: { pupilCode: "CH-2026-000001", phone: "0700000001" } }), matched);
  assert.equal(matched.status, 200);
  assert.deepEqual(JSON.parse(matched.body), { verified: true });
  assert.equal(deps.calls.some(x => x.type === "auth"), false);
  assert.deepEqual(deps.calls.find(x => x.type === "verify"), {
    type: "verify", pupilCode: "CH-2026-000001", phone: "+256700000001"
  });
  assert.doesNotMatch(matched.body, /pin|guardianName|learnerName|phone/i);
});

test("unregistered phone/code is denied and never receives a PIN or learner profile", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const rejected = responseRecorder();
  await handler(request({ path: "/api/v1/guardian/entry-check", method: "POST",
    body: { pupilCode: "CH-2026-000001", phone: "+256700000099" } }), rejected);
  assert.equal(rejected.status, 400);
  assert.equal(deps.calls.some(x => x.type === "list"), false);
  assert.doesNotMatch(rejected.body, /pin|guardianName|learnerName/i);
});

test("guardian portal rejects a missing learner code even when guardian session exists", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const res = responseRecorder();
  await handler(request({ path: "/api/v1/guardian/learners" }), res);
  assert.equal(res.status, 400);
  assert.equal(deps.calls.some(x => x.type === "list"), false);
});

test("public guardian relation checks enforce TLS, origin and per-client rate limits", async () => {
  const deps = dependencies();
  const handler = createGuardianPortalHttpHandler({ ...deps, expectedOrigin: ORIGIN });
  const data = { pupilCode: "CH-2026-000001", phone: "+256700000001" };
  for (const invalid of [
    request({ path: "/api/v1/guardian/entry-check", method: "POST",
      body: data, encrypted: false, address: "10.2.2.1" }),
    request({ path: "/api/v1/guardian/entry-check", method: "POST",
      body: data, origin: "https://untrusted.test", address: "10.2.2.2" })
  ]) {
    const res = responseRecorder();
    await handler(invalid, res);
    assert.ok([403, 426].includes(res.status));
  }
  let last;
  for (let i = 0; i < 13; i++) {
    last = responseRecorder();
    await handler(request({ path: "/api/v1/guardian/entry-check", method: "POST",
      body: data, address: "10.2.2.3" }), last);
  }
  assert.equal(last.status, 429);
});
