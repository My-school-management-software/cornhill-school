import test from "node:test";
import assert from "node:assert/strict";
import { createGuardianAccessHttpHandler } from "../src/security/guardian-access-http-handler.mjs";
import { AuthenticationError } from "../src/security/auth-service.mjs";

const ORIGIN = "https://localhost:4174";
const STAFF_ID = "11111111-2222-4333-8444-555555555555";
const CONTACT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SESSION = "A".repeat(43);
const CSRF = "B".repeat(43);

function principal(permission = true) {
  return {
    id: STAFF_ID, principalType: "staff", accountStatus: "active",
    roles: ["director"],
    rolePermissions: { director: permission ? ["guardians.access_approve"] : [] },
    session: { revokedAt: null, expiresAt: new Date(Date.now() + 60_000).toISOString() }
  };
}
function response() {
  return {
    status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body = "") { this.body = body; }
  };
}
function request({ path = "/api/v1/guardian/access/contacts", method = "GET", encrypted = true, host = "localhost:4174", origin = ORIGIN, body, cookie } = {}) {
  const req = { url: path, method, headers: { host, origin, cookie: cookie ?? "__Host-cornhill_session=" + SESSION + "; __Host-cornhill_csrf=" + CSRF }, socket: { encrypted } };
  if (body !== undefined) req[Symbol.asyncIterator] = async function* () { yield Buffer.from(JSON.stringify(body)); };
  return req;
}
function setup({ staff = principal(), authenticateError = null, repositoryError = null } = {}) {
  const calls = { auth: [], list: 0, issue: [] };
  const repository = {
    async listContacts() { calls.list += 1; if (repositoryError) throw repositoryError; return [{ contactId: CONTACT_ID, guardianName: "Guardian", phoneLastFour: "0001" }]; },
    async issuePin(input) { calls.issue.push(input); if (repositoryError) throw repositoryError; return { learner: { pupilCode: "CH-2026-000001" }, guardian: { guardianName: "Guardian", phoneLastFour: "0001" }, replacedExistingPin: false }; }
  };
  const authService = { async authenticate(input) { calls.auth.push(input); if (authenticateError) throw authenticateError; return staff; } };
  const passwordHasher = {
    async hash(value) { calls.pinInput = value; return "$argon2id$test-hash"; },
    isArgon2idHash(value) { return typeof value === "string" && value.startsWith("$argon2id$"); }
  };
  return { calls, handler: createGuardianAccessHttpHandler({ authService, repository, passwordHasher, expectedOrigin: ORIGIN }) };
}
async function invoke(handler, req = request()) { const res = response(); await handler(req, res); return res; }

test("guardian contact directory requires the explicit high-risk staff permission", async () => {
  const fixture = setup();
  const res = await invoke(fixture.handler);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(String(res.body)).contacts.length, 1);
  assert.equal(fixture.calls.list, 1);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("staff without guardian approval permission cannot list contacts or issue PINs", async () => {
  const fixture = setup({ staff: principal(false) });
  const list = await invoke(fixture.handler);
  assert.equal(list.status, 403);
  const issue = await invoke(fixture.handler, request({ path: "/api/v1/guardian/access/issue-pin", method: "POST", body: { contactId: CONTACT_ID } }));
  assert.equal(issue.status, 403);
  assert.equal(fixture.calls.list, 0);
  assert.equal(fixture.calls.issue.length, 0);
});

test("guardian principal cannot use the school guardian administration API", async () => {
  const fixture = setup({ staff: { ...principal(), principalType: "guardian" } });
  const res = await invoke(fixture.handler);
  assert.equal(res.status, 403);
  assert.equal(fixture.calls.list, 0);
});

test("issuing a PIN returns it once and stores only its Argon2id hash", async () => {
  const fixture = setup();
  const res = await invoke(fixture.handler, request({
    path: "/api/v1/guardian/access/issue-pin", method: "POST", body: { contactId: CONTACT_ID }
  }));
  assert.equal(res.status, 201);
  const payload = JSON.parse(String(res.body));
  assert.match(payload.pin, /^[0-9]{8}$/);
  assert.match(fixture.calls.pinInput, /^[0-9]{8}$/);
  assert.equal(fixture.calls.issue.length, 1);
  assert.equal(fixture.calls.issue[0].pinHash, "$argon2id$test-hash");
  assert.equal(fixture.calls.issue[0].contactId, CONTACT_ID);
  assert.equal(fixture.calls.issue[0].actorStaffId, STAFF_ID);
  assert.equal(fixture.calls.issue[0].replaceExisting, false);
});

test("PIN replacement requires an explicit boolean confirmation", async () => {
  const fixture = setup();
  const malformed = await invoke(fixture.handler, request({
    path: "/api/v1/guardian/access/issue-pin", method: "POST", body: { contactId: CONTACT_ID, replaceExisting: "yes" }
  }));
  assert.equal(malformed.status, 400);
  const confirmed = await invoke(fixture.handler, request({
    path: "/api/v1/guardian/access/issue-pin", method: "POST", body: { contactId: CONTACT_ID, replaceExisting: true }
  }));
  assert.equal(confirmed.status, 201);
  assert.equal(fixture.calls.issue[0].replaceExisting, true);
});

test("invalid contact identifiers are rejected before hashing or database writes", async () => {
  const fixture = setup();
  const res = await invoke(fixture.handler, request({
    path: "/api/v1/guardian/access/issue-pin", method: "POST", body: { contactId: "not-a-uuid" }
  }));
  assert.equal(res.status, 400);
  assert.equal(fixture.calls.issue.length, 0);
  assert.equal(fixture.calls.pinInput, undefined);
});

test("missing staff session is rejected", async () => {
  const fixture = setup({ authenticateError: new AuthenticationError() });
  const res = await invoke(fixture.handler);
  assert.equal(res.status, 401);
  assert.equal(fixture.calls.list, 0);
});

test("TLS, host and POST origin are checked before authentication", async () => {
  const fixture = setup();
  assert.equal((await invoke(fixture.handler, request({ encrypted: false }))).status, 426);
  assert.equal((await invoke(fixture.handler, request({ host: "attacker.example" }))).status, 421);
  assert.equal((await invoke(fixture.handler, request({ path: "/api/v1/guardian/access/issue-pin", method: "POST", origin: "https://attacker.example", body: { contactId: CONTACT_ID } }))).status, 403);
  assert.equal(fixture.calls.auth.length, 0);
});

test("unsupported methods are rejected and unrelated paths are not handled", async () => {
  const fixture = setup();
  const method = await invoke(fixture.handler, request({ method: "DELETE" }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.Allow, "GET");
  assert.equal(await fixture.handler(request({ path: "/api/v1/guardian/learners" }), response()), false);
});

test("active-account conflict and repository errors are safely mapped", async () => {
  const conflict = new Error("An active guardian account already exists. Confirm PIN replacement before continuing.");
  conflict.code = "CORNHILL_GUARDIAN_CONFLICT";
  const a = setup({ repositoryError: conflict });
  const res = await invoke(a.handler, request({ path: "/api/v1/guardian/access/issue-pin", method: "POST", body: { contactId: CONTACT_ID } }));
  assert.equal(res.status, 409);
  const b = setup({ repositoryError: new Error("private database detail") });
  const fail = await invoke(b.handler);
  assert.equal(fail.status, 503);
  assert.doesNotMatch(String(fail.body), /private database detail/);
});
