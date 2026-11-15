import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAuthHttpHandler } from "../src/security/auth-http-handler.mjs";
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  readSessionTokenFromCookieHeader,
  readCsrfTokenFromCookieHeader
} from "../src/security/session-cookies.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";

const ORIGIN = "https://cornhill.local";
const secrets = createOpaqueSessionSecrets();
const STAFF = { id: "11111111-1111-4111-8111-111111111111", principalType: "staff" };

function makeService(overrides = {}) {
  const calls = { staff: [], guardian: [], authenticate: [], logout: [] };
  const service = {
    async loginStaff(input) {
      calls.staff.push(input);
      return { principal: STAFF, sessionToken: secrets.sessionToken, csrfToken: secrets.csrfToken,
        cookieMaxAgeSeconds: 3600, expiresAt: new Date("2026-11-15T20:00:00Z") };
    },
    async loginGuardian(input) {
      calls.guardian.push(input);
      return { principal: { id: "22222222-2222-4222-8222-222222222222", principalType: "guardian" },
        sessionToken: secrets.sessionToken, csrfToken: secrets.csrfToken,
        cookieMaxAgeSeconds: 1800, expiresAt: new Date("2026-11-15T20:00:00Z") };
    },
    async authenticate(input) { calls.authenticate.push(input); return STAFF; },
    async logout(input) { calls.logout.push(input); return true; },
    ...overrides
  };
  return { service, calls };
}

function response() {
  return {
    statusCode: null, headers: {}, body: "",
    writeHead(code, headers = {}) { this.statusCode = code; this.headers = headers; },
    end(body = "") { this.body = String(body); },
    get(name) {
      const key = Object.keys(this.headers).find(item => item.toLowerCase() === name.toLowerCase());
      return key ? this.headers[key] : undefined;
    }
  };
}

async function call(handler, { path = "/api/v1/auth/session", method = "GET", headers = {},
  body, encrypted = true } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  req.url = path;
  req.method = method;
  req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  req.socket = { encrypted, remoteAddress: "127.0.0.1" };
  const res = response();
  const handled = await handler(req, res);
  return { ...res, handled, json: () => JSON.parse(res.body) };
}

function harness(overrides = {}) {
  const { service, calls } = makeService(overrides);
  return { handler: createAuthHttpHandler({ authService: service, expectedOrigin: ORIGIN }), calls };
}

const host = { Host: "cornhill.local" };
const post = { ...host, Origin: ORIGIN, "Content-Type": "application/json" };

test("origin validator rejects credentials embedded in an HTTPS origin", () => {
  const { service } = makeService();
  assert.throws(() => createAuthHttpHandler({ authService: service, expectedOrigin: "https://user:pass@cornhill.local" }), TypeError);
});

test("origin validator rejects query strings, fragments, and non-root paths", () => {
  const { service } = makeService();
  for (const value of ["https://cornhill.local/?x=1", "https://cornhill.local/#x", "https://cornhill.local/api"]) {
    assert.throws(() => createAuthHttpHandler({ authService: service, expectedOrigin: value }), TypeError);
  }
});

test("origin validator rejects trailing slash because origin must be exact", () => {
  const { service } = makeService();
  assert.throws(() => createAuthHttpHandler({ authService: service, expectedOrigin: "https://cornhill.local/" }), TypeError);
});

test("authentication requests reject missing Host before service invocation", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/staff/login", method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.statusCode, 421);
  assert.equal(calls.staff.length, 0);
});

test("authentication writes reject a missing Origin header", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...host, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.statusCode, 403);
  assert.equal(calls.staff.length, 0);
});

test("authentication writes reject null Origin", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/guardian/login", method: "POST",
    headers: { ...post, Origin: "null" }, body: "{}" });
  assert.equal(r.statusCode, 403);
  assert.equal(calls.guardian.length, 0);
});

test("authentication writes reject same-site but different-port origins", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...post, Origin: "https://cornhill.local:444" }, body: "{}" });
  assert.equal(r.statusCode, 403);
  assert.equal(calls.staff.length, 0);
});

test("authentication writes reject HTTP downgrade origins", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...post, Origin: "http://cornhill.local" }, body: "{}" });
  assert.equal(r.statusCode, 403);
  assert.equal(calls.staff.length, 0);
});

test("session endpoint rejects unencrypted transport", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { headers: host, encrypted: false });
  assert.equal(r.statusCode, 426);
  assert.equal(calls.authenticate.length, 0);
});

test("session endpoint rejects a mismatched Host", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { headers: { Host: "attacker.example" } });
  assert.equal(r.statusCode, 421);
  assert.equal(calls.authenticate.length, 0);
});

test("session route ignores a CSRF cookie and forwards no CSRF token for GET", async () => {
  const { handler, calls } = harness();
  await call(handler, { headers: { ...host, Cookie: CSRF_COOKIE_NAME + "=" + secrets.csrfToken } });
  assert.equal(calls.authenticate[0].csrfToken, undefined);
  assert.equal(calls.authenticate[0].sessionToken, null);
});

test("session route forwards a session cookie alongside unrelated cookies", async () => {
  const { handler, calls } = harness();
  await call(handler, { headers: { ...host, Cookie: "theme=dark; " +
    SESSION_COOKIE_NAME + "=" + secrets.sessionToken + "; locale=en" } });
  assert.equal(calls.authenticate[0].sessionToken, secrets.sessionToken);
});

test("session route rejects duplicate session cookies at parser boundary", async () => {
  const { handler, calls } = harness();
  await call(handler, { headers: { ...host, Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken +
    "; " + SESSION_COOKIE_NAME + "=" + secrets.sessionToken } });
  assert.equal(calls.authenticate[0].sessionToken, null);
});

test("session route returns no-store and nosniff headers", async () => {
  const { handler } = harness();
  const r = await call(handler, { headers: host });
  assert.equal(r.get("cache-control"), "no-store");
  assert.equal(r.get("x-content-type-options"), "nosniff");
});

test("session route returns a generic JSON principal envelope", async () => {
  const { handler } = harness();
  const r = await call(handler, { headers: host });
  assert.deepEqual(r.json(), { principal: STAFF });
  assert.match(r.get("content-type"), /^application\/json/);
});

test("logout rejects unencrypted transport before calling service", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/logout", method: "POST",
    headers: { ...post, Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
      "X-Cornhill-CSRF": secrets.csrfToken }, encrypted: false });
  assert.equal(r.statusCode, 426);
  assert.equal(calls.logout.length, 0);
});

test("logout rejects missing Origin before calling service", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/logout", method: "POST",
    headers: { ...host, Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
      "X-Cornhill-CSRF": secrets.csrfToken } });
  assert.equal(r.statusCode, 403);
  assert.equal(calls.logout.length, 0);
});

test("logout rejects duplicate session cookie values", async () => {
  const { handler, calls } = harness();
  await call(handler, { path: "/api/v1/auth/logout", method: "POST",
    headers: { ...post, Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken + "; " +
      SESSION_COOKIE_NAME + "=" + secrets.sessionToken, "X-Cornhill-CSRF": secrets.csrfToken } });
  assert.equal(calls.logout[0].sessionToken, null);
});

test("logout rejects duplicate CSRF cookie values at cookie parser boundary", () => {
  const header = CSRF_COOKIE_NAME + "=" + secrets.csrfToken + "; " +
    CSRF_COOKIE_NAME + "=" + secrets.csrfToken;
  assert.equal(readCsrfTokenFromCookieHeader(header), null);
});

test("session cookie parser rejects invalid base64url lengths", () => {
  for (const value of ["A".repeat(42), "A".repeat(44), "A".repeat(43) + "="]) {
    assert.equal(readSessionTokenFromCookieHeader(SESSION_COOKIE_NAME + "=" + value), null);
  }
});

test("CSRF cookie parser rejects invalid base64url lengths", () => {
  for (const value of ["A".repeat(42), "A".repeat(44), "A".repeat(43) + "="]) {
    assert.equal(readCsrfTokenFromCookieHeader(CSRF_COOKIE_NAME + "=" + value), null);
  }
});

test("cookie parsers reject headers over the documented limit", () => {
  assert.equal(readSessionTokenFromCookieHeader("x".repeat(8193)), null);
  assert.equal(readCsrfTokenFromCookieHeader("x".repeat(8193)), null);
});

test("cookie parsers do not accept whitespace inside opaque token values", () => {
  assert.equal(readSessionTokenFromCookieHeader(SESSION_COOKIE_NAME + "= " +
    secrets.sessionToken.slice(0, 20) + " " + secrets.sessionToken.slice(20)), null);
});

test("staff login accepts JSON charset parameter", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...post, "Content-Type": "Application/JSON; charset=utf-8" },
    body: JSON.stringify({ username: "teacher.one", password: "example" }) });
  assert.equal(r.statusCode, 200);
  assert.equal(calls.staff.length, 1);
});

test("guardian login keeps the guardian principal isolated from staff login", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/guardian/login", method: "POST",
    headers: post, body: JSON.stringify({ phone: "+256700000001", pin: "0000" }) });
  assert.equal(r.statusCode, 200);
  assert.equal(calls.guardian.length, 1);
  assert.equal(calls.staff.length, 0);
});

test("wrong method on staff login returns 405 without parsing request body", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/staff/login", method: "GET",
    headers: host, body: "not-json" });
  assert.equal(r.statusCode, 405);
  assert.equal(r.get("allow"), "POST");
  assert.equal(calls.staff.length, 0);
});

test("wrong method on guardian login returns 405", async () => {
  const { handler } = harness();
  const r = await call(handler, { path: "/api/v1/auth/guardian/login", method: "GET", headers: host });
  assert.equal(r.statusCode, 405);
});

test("wrong method on logout returns 405", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/logout", method: "GET", headers: host });
  assert.equal(r.statusCode, 405);
  assert.equal(calls.logout.length, 0);
});

test("unknown auth route does not call any authentication service method", async () => {
  const { handler, calls } = harness();
  const r = await call(handler, { path: "/api/v1/auth/unrecognised", headers: host });
  assert.equal(r.statusCode, 404);
  assert.equal(calls.staff.length + calls.guardian.length + calls.authenticate.length + calls.logout.length, 0);
});

test("paths outside auth namespace are left to the next router", async () => {
  const { handler } = harness();
  const r = await call(handler, { path: "/api/v1/health", headers: host });
  assert.equal(r.handled, false);
  assert.equal(r.statusCode, null);
});
