import test from "node:test";
import assert from "node:assert/strict";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildCsrfCookie,
  buildExpiredCsrfCookie,
  buildExpiredSessionCookie,
  buildSessionCookie,
  readCsrfTokenFromCookieHeader,
  readSessionTokenFromCookieHeader,
  sessionTokenHashFromCookieHeader
} from "../src/security/session-cookies.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";

const secrets = createOpaqueSessionSecrets();

test("session cookie uses host-only Secure HttpOnly Strict attributes", () => {
  const cookie = buildSessionCookie(secrets.sessionToken, 1800);
  assert.ok(cookie.startsWith(SESSION_COOKIE_NAME + "="));
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=1800/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.doesNotMatch(cookie, /Domain=/i);
});
test("cookie builder rejects malformed session token", () => {
  assert.throws(() => buildSessionCookie("not-a-token", 1800), /token is invalid/);
});
test("cookie builder rejects invalid lifetime", () => {
  for (const age of [0, -1, 86_401, 1.5, "30"]) {
    assert.throws(() => buildSessionCookie(secrets.sessionToken, age), /lifetime is invalid/);
  }
});
test("cookie parser finds session among other cookies", () => {
  const header = "theme=dark; " + SESSION_COOKIE_NAME + "=" + secrets.sessionToken + "; language=en";
  assert.equal(readSessionTokenFromCookieHeader(header), secrets.sessionToken);
});
test("cookie parser rejects duplicate session cookie names", () => {
  const header = SESSION_COOKIE_NAME + "=" + secrets.sessionToken + "; " +
    SESSION_COOKIE_NAME + "=" + secrets.sessionToken;
  assert.equal(readSessionTokenFromCookieHeader(header), null);
});
test("cookie parser rejects malformed and oversized headers", () => {
  assert.equal(readSessionTokenFromCookieHeader("bad-cookie"), null);
  assert.equal(readSessionTokenFromCookieHeader("x".repeat(8193)), null);
});
test("cookie parser does not decode arbitrary percent-encoded values", () => {
  assert.equal(readSessionTokenFromCookieHeader(SESSION_COOKIE_NAME + "=%41".repeat(43)), null);
});
test("cookie clear helper expires the host-only session cookie", () => {
  const cookie = buildExpiredSessionCookie();
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});
test("token hash helper returns only the hash", () => {
  const header = SESSION_COOKIE_NAME + "=" + secrets.sessionToken;
  const hash = sessionTokenHashFromCookieHeader(header);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, secrets.sessionToken);
});
test("CSRF cookie is readable but remains Secure and SameSite Strict", () => {
  const cookie = buildCsrfCookie(secrets.csrfToken, 1800);
  assert.ok(cookie.startsWith(CSRF_COOKIE_NAME + "="));
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.doesNotMatch(cookie, /HttpOnly|Domain=/i);
});
test("CSRF cookie token can be read after page reload", () => {
  const header = CSRF_COOKIE_NAME + "=" + secrets.csrfToken;
  assert.equal(readCsrfTokenFromCookieHeader(header), secrets.csrfToken);
});
test("CSRF parser rejects duplicate values and malformed cookies", () => {
  assert.equal(readCsrfTokenFromCookieHeader(
    CSRF_COOKIE_NAME + "=" + secrets.csrfToken + "; " + CSRF_COOKIE_NAME + "=" + secrets.csrfToken
  ), null);
  assert.equal(readCsrfTokenFromCookieHeader(CSRF_COOKIE_NAME + "=bad"), null);
});
test("CSRF cookie clear helper expires the cookie", () => {
  const cookie = buildExpiredCsrfCookie();
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});
