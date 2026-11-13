import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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

async function withServer(run, { secure = true, overrides = {} } = {}) {
  const { service, calls } = createMockAuthService(overrides);
  const handler = createAuthHttpHandler({
    authService: service,
    expectedOrigin: ORIGIN,
    isSecureRequest: () => secure
  });
  const server = createServer((request, response) => {
    handler(request, response).then(handled => {
      if (!handled) {
        response.writeHead(404);
        response.end();
      }
    }).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    await run({ base, calls });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
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
test("authentication endpoints require secure transport before parsing credentials", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders, body: JSON.stringify({ username: "teacher", password: "private" })
    });
    assert.equal(response.status, 426);
    assert.equal(calls.staffLogin, undefined);
    assert.match(response.headers.get("upgrade"), /TLS/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }, { secure: false });
});
test("staff login forwards only parsed credentials and uses socket source address", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders,
      body: JSON.stringify({ username: "teacher.one", password: "not-logged" })
    });
    assert.equal(response.status, 200);
    assert.equal(calls.staffLogin.username, "teacher.one");
    assert.equal(calls.staffLogin.password, "not-logged");
    assert.equal(calls.staffLogin.sourceAddress, "127.0.0.1");
    assert.equal(response.headers.get("cache-control"), "no-store");
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies[0].startsWith(SESSION_COOKIE_NAME + "="));
    assert.match(cookies[0], /HttpOnly/);
    assert.ok(cookies[1].startsWith(CSRF_COOKIE_NAME + "="));
    assert.doesNotMatch(cookies[1], /HttpOnly/);
  });
});
test("guardian login is on a separate route", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/guardian/login", {
      method: "POST", headers: postHeaders,
      body: JSON.stringify({ phone: "+256700000001", pin: "private-pin" })
    });
    assert.equal(response.status, 200);
    assert.equal(calls.guardianLogin.phone, "+256700000001");
    assert.equal(calls.guardianLogin.pin, "private-pin");
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login rejects cross-origin POST before calling service", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST",
      headers: { ...postHeaders, Origin: "https://attacker.example" },
      body: JSON.stringify({ username: "teacher.one", password: "private" })
    });
    assert.equal(response.status, 403);
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login rejects a mismatched Host header", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST",
      headers: { ...postHeaders, Host: "attacker.example" },
      body: JSON.stringify({ username: "teacher.one", password: "private" })
    });
    assert.equal(response.status, 421);
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login requires JSON content type", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: { ...postHeaders, "Content-Type": "text/plain" },
      body: "username=teacher"
    });
    assert.equal(response.status, 415);
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login rejects malformed JSON", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders, body: "{bad"
    });
    assert.equal(response.status, 400);
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login rejects array JSON bodies", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders, body: "[]"
    });
    assert.equal(response.status, 400);
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login rejects oversized request bodies", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders,
      body: JSON.stringify({ username: "x".repeat(20_000), password: "x" })
    });
    assert.equal(response.status, 413);
    assert.equal(calls.staffLogin, undefined);
  });
});
test("login maps failed credentials to a generic response", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders, body: JSON.stringify({ username: "unknown", password: "wrong" })
    });
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /could not be verified/);
  }, { overrides: { async loginStaff() { throw new AuthenticationError(); } } });
});
test("login maps throttling to 429", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/v1/auth/guardian/login", {
      method: "POST", headers: postHeaders, body: JSON.stringify({ phone: "+256700000001", pin: "wrong" })
    });
    assert.equal(response.status, 429);
  }, { overrides: { async loginGuardian() { throw new AuthenticationRateLimitError(); } } });
});
test("login hides unexpected errors behind service-unavailable response", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/v1/auth/staff/login", {
      method: "POST", headers: postHeaders, body: JSON.stringify({ username: "teacher", password: "secret" })
    });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /database secret/);
  }, { overrides: { async loginStaff() { throw new Error("database secret"); } } });
});
test("session endpoint reads only the HttpOnly session cookie", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/session", {
      headers: { Host: "cornhill.local", Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken }
    });
    assert.equal(response.status, 200);
    assert.equal(calls.authenticate.sessionToken, secrets.sessionToken);
    assert.equal(calls.authenticate.method, "GET");
  });
});
test("session endpoint forwards no CSRF header for a safe GET", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/session", {
      headers: { Host: "cornhill.local", Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken }
    });
    assert.equal(response.status, 200);
    assert.equal(calls.authenticate.csrfToken, undefined);
  });
});
test("logout requires same-origin and forwards cookie plus CSRF header", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/logout", {
      method: "POST",
      headers: {
        Host: "cornhill.local", Origin: ORIGIN,
        Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
        "X-Cornhill-CSRF": secrets.csrfToken
      }
    });
    assert.equal(response.status, 200);
    assert.equal(calls.logout.sessionToken, secrets.sessionToken);
    assert.equal(calls.logout.csrfToken, secrets.csrfToken);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
    assert.match(response.headers.getSetCookie()[1], /Max-Age=0/);
  });
});
test("logout denies cross-origin requests", async () => {
  await withServer(async ({ base, calls }) => {
    const response = await fetch(base + "/api/v1/auth/logout", {
      method: "POST",
      headers: {
        Host: "cornhill.local", Origin: "https://evil.example",
        Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
        "X-Cornhill-CSRF": secrets.csrfToken
      }
    });
    assert.equal(response.status, 403);
    assert.equal(calls.logout, undefined);
  });
});
test("logout returns generic unauthorised for invalid session", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/v1/auth/logout", {
      method: "POST",
      headers: {
        Host: "cornhill.local", Origin: ORIGIN,
        Cookie: SESSION_COOKIE_NAME + "=" + secrets.sessionToken,
        "X-Cornhill-CSRF": secrets.csrfToken
      }
    });
    assert.equal(response.status, 401);
  }, { overrides: { async logout() { return false; } } });
});
test("wrong methods are rejected with an Allow header", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/v1/auth/session", {
      method: "POST", headers: { Host: "cornhill.local" }
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
  });
});
test("unknown authentication routes return a route-not-found response", async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(base + "/api/v1/auth/admin", {
      headers: { Host: "cornhill.local" }
    });
    assert.equal(response.status, 404);
  });
});
test("handler returns false for paths outside authentication API", async () => {
  const { service } = createMockAuthService();
  const handler = createAuthHttpHandler({
    authService: service, expectedOrigin: ORIGIN, isSecureRequest: () => true
  });
  let responded = false;
  const handled = await handler(
    { url: "/api/v1/health", method: "GET", headers: {}, socket: {} },
    { writeHead() { responded = true; }, end() {} }
  );
  assert.equal(handled, false);
  assert.equal(responded, false);
});
