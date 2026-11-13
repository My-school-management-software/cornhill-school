import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAuthHttpHandler } from "../src/security/auth-http-handler.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import {
  AuthenticationError,
  AuthenticationRateLimitError
} from "../src/security/auth-service.mjs";

const ORIGIN = "https://cornhill.local";
const secrets = createOpaqueSessionSecrets();

function createMockAuthService(overrides = {}) {
  const calls = {};
  const service = {
    async loginStaff(input) {
      calls.staffLogin = input;
      return {
        principal: { id: "11111111-1111-4111-8111-111111111111", principalType: "staff" },
        sessionToken: secrets.sessionToken,
        csrfToken: secrets.csrfToken,
        cookieMaxAgeSeconds: 3600,
        expiresAt: new Date("2026-11-13T21:00:00Z")
      };
    },
    async loginGuardian(input) {
      calls.guardianLogin = input;
      return {
        principal: { id: "22222222-2222-4222-8222-222222222222", principalType: "guardian" },
        sessionToken: secrets.sessionToken,
        csrfToken: secrets.csrfToken,
        cookieMaxAgeSeconds: 1800,
        expiresAt: new Date("2026-11-13T20:30:00Z")
      };
    },
    async authenticate(input) {
      calls.authenticate = input;
      return { id: "11111111-1111-4111-8111-111111111111", principalType: "staff" };
    },
    async logout(input) {
      calls.logout = input;
      return true;
    },
    ...overrides
  };
  return { service, calls };
}

function mockResponse() {
  return {
    statusCode: null,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(body = "") {
      this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    },
    getHeader(name) {
      const key = Object.keys(this.headers).find(k => k.toLowerCase() === name.toLowerCase());
      return key ? this.headers[key] : undefined;
    },
    getSetCookie() {
      const value = this.getHeader("set-cookie");
      return value ? (Array.isArray(value) ? value : [value]) : [];
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    }
  };
}

async function invoke(handler, {
  path,
  method = "GET",
  headers = {},
  body,
  encrypted = true,
  remoteAddress = "127.0.0.1"
}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  request.url = path;
  request.method = method;
  request.headers = normalizedHeaders;
  request.socket = { encrypted, remoteAddress };
  const response = mockResponse();
  const handled = await handler(request, response);
  return { ...response, handled };
}

function setup(overrides = {}) {
  const { service, calls } = createMockAuthService(overrides);
  const handler = createAuthHttpHandler({ authService: service, expectedOrigin: ORIGIN });
  return { handler, calls };
}

const postHeaders = {
  Host: "cornhill.local",
  Origin: ORIGIN,
  "Content-Type": "application/json"
};

test("handler refuses a missing authentication service", () => {
  assert.throws(() => createAuthHttpHandler({ expectedOrigin: ORIGIN }), /service is required/);
});
test("handler requires an exact HTTPS origin", () => {
  const { service } = createMockAuthService();
  assert.throws(() => createAuthHttpHandler({ authService: service, expectedOrigin: "http://cornhill.local" }), /HTTPS origin/);
  assert.throws(() => createAuthHttpHandler({ authService: service, expectedOrigin: "https://cornhill.local/app" }), /exact HTTPS origin/);
});
test("authentication endpoints require encrypted HTTPS transport before parsing credentials", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: postHeaders, body: JSON.stringify({ username: "teacher", password: "private" }),
    encrypted: false
  });
  assert.equal(response.statusCode, 426);
  assert.equal(calls.staffLogin, undefined);
  assert.match(response.getHeader("upgrade"), /TLS/);
  assert.equal(response.getHeader("cache-control"), "no-store");
});
test("staff login creates secure cookies and forwards socket source address", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: postHeaders, body: JSON.stringify({ username: "teacher.one", password: "not-logged" })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.staffLogin.username, "teacher.one");
  assert.equal(calls.staffLogin.password, "not-logged");
  assert.equal(calls.staffLogin.sourceAddress, "127.0.0.1");
  assert.equal(response.getHeader("cache-control"), "no-store");
  assert.equal(response.getHeader("strict-transport-security"), "max-age=86400");
  const cookies = response.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies[0].startsWith(SESSION_COOKIE_NAME + "="));
  assert.match(cookies[0], /HttpOnly/);
  assert.ok(cookies[1].startsWith(CSRF_COOKIE_NAME + "="));
  assert.doesNotMatch(cookies[1], /HttpOnly/);
});
test("guardian login uses a separate route", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/guardian/login", method: "POST",
    headers: postHeaders, body: JSON.stringify({ phone: "+256700000001", pin: "private-pin" })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.guardianLogin.phone, "+256700000001");
  assert.equal(calls.guardianLogin.pin, "private-pin");
  assert.equal(calls.staffLogin, undefined);
});
test("login rejects cross-origin POST before calling service", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...postHeaders, Origin: "https://attacker.example" },
    body: JSON.stringify({ username: "teacher.one", password: "private" })
  });
  assert.equal(response.statusCode, 403);
  assert.equal(calls.staffLogin, undefined);
});
test("login rejects a mismatched Host header", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...postHeaders, Host: "attacker.example" },
    body: JSON.stringify({ username: "teacher.one", password: "private" })
  });
  assert.equal(response.statusCode, 421);
  assert.equal(calls.staffLogin, undefined);
});
test("login requires JSON content type", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: { ...postHeaders, "Content-Type": "text/plain" }, body: "username=teacher"
  });
  assert.equal(response.statusCode, 415);
  assert.equal(calls.staffLogin, undefined);
});
test("login rejects malformed JSON", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST", headers: postHeaders, body: "{bad"
  });
  assert.equal(response.statusCode, 400);
  assert.equal(calls.staffLogin, undefined);
});
test("login rejects array JSON bodies", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST", headers: postHeaders, body: "[]"
  });
  assert.equal(response.statusCode, 400);
  assert.equal(calls.staffLogin, undefined);
});
test("login rejects oversized request bodies", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST", headers: postHeaders,
    body: JSON.stringify({ username: "x".repeat(20_000), password: "x" })
  });
  assert.equal(response.statusCode, 413);
  assert.equal(calls.staffLogin, undefined);
});
test("login maps failed credentials to a generic response", async () => {
  const { handler } = setup({ async loginStaff() { throw new AuthenticationError(); } });
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: postHeaders, body: JSON.stringify({ username: "unknown", password: "wrong" })
  });
  assert.equal(response.statusCode, 401);
  assert.match(response.json().error, /could not be verified/);
});
test("login maps throttling to 429", async () => {
  const { handler } = setup({ async loginGuardian() { throw new AuthenticationRateLimitError(); } });
  const response = await invoke(handler, {
    path: "/api/v1/auth/guardian/login", method: "POST",
    headers: postHeaders, body: JSON.stringify({ phone: "+256700000001", pin: "wrong" })
  });
  assert.equal(response.statusCode, 429);
});
test("login hides unexpected errors behind service-unavailable response", async () => {
  const { handler } = setup({ async loginStaff() { throw new Error("database secret"); } });
  const response = await invoke(handler, {
    path: "/api/v1/auth/staff/login", method: "POST",
    headers: postHeaders, body: JSON.stringify({ username: "teacher", password: "secret" })
  });
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /database secret/);
});
test("session endpoint reads only the HttpOnly session cookie", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/session",
    headers: { Host: "cornhill.local", Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.authenticate.sessionToken, secrets.sessionToken);
  assert.equal(calls.authenticate.method, "GET");
});
test("safe session GET does not require a CSRF header", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/session",
    headers: { Host: "cornhill.local", Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.authenticate.csrfToken, undefined);
});
test("logout requires same-origin and forwards cookie plus CSRF header", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/logout", method: "POST",
    headers: {
      Host: "cornhill.local", Origin: ORIGIN,
      Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
      "X-Cornhill-CSRF": secrets.csrfToken
    }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.logout.sessionToken, secrets.sessionToken);
  assert.equal(calls.logout.csrfToken, secrets.csrfToken);
  assert.equal(response.getSetCookie().length, 2);
  assert.match(response.getSetCookie()[0], /Max-Age=0/);
  assert.match(response.getSetCookie()[1], /Max-Age=0/);
});
test("logout denies cross-origin requests", async () => {
  const { handler, calls } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/logout", method: "POST",
    headers: {
      Host: "cornhill.local", Origin: "https://evil.example",
      Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
      "X-Cornhill-CSRF": secrets.csrfToken
    }
  });
  assert.equal(response.statusCode, 403);
  assert.equal(calls.logout, undefined);
});
test("logout returns unauthorised for an invalid session", async () => {
  const { handler } = setup({ async logout() { return false; } });
  const response = await invoke(handler, {
    path: "/api/v1/auth/logout", method: "POST",
    headers: {
      Host: "cornhill.local", Origin: ORIGIN,
      Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
      "X-Cornhill-CSRF": secrets.csrfToken
    }
  });
  assert.equal(response.statusCode, 401);
});
test("wrong methods are rejected with an Allow header", async () => {
  const { handler } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/session", method: "POST",
    headers: { Host: "cornhill.local" }
  });
  assert.equal(response.statusCode, 405);
  assert.equal(response.getHeader("allow"), "GET");
});
test("unknown authentication routes return route-not-found", async () => {
  const { handler } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/auth/admin", headers: { Host: "cornhill.local" }
  });
  assert.equal(response.statusCode, 404);
});
test("handler returns false for paths outside authentication API", async () => {
  const { handler } = setup();
  const response = await invoke(handler, {
    path: "/api/v1/health", headers: {}
  });
  assert.equal(response.handled, false);
  assert.equal(response.statusCode, null);
});
