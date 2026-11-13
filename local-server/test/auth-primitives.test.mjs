import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  buildClearedSessionCookie,
  buildSessionCookie,
  constantTimeHexEqual,
  createOpaqueToken,
  hasApprovedGuardianLearnerAccess,
  hasStaffPermission,
  hmacFingerprint,
  parseSessionCookie,
  redactSensitiveFields,
  sha256Hex
} from "../src/security/auth-primitives.mjs";

test("opaque session tokens use cryptographically random URL-safe values", () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.throws(() => createOpaqueToken(16), TypeError);
});

test("session token storage uses SHA-256 and compares fixed-size hashes", () => {
  const digest = sha256Hex("example-session-token");
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(constantTimeHexEqual(digest, sha256Hex("example-session-token")), true);
  assert.equal(constantTimeHexEqual(digest, sha256Hex("different-token")), false);
  assert.equal(constantTimeHexEqual("bad", digest), false);
});

test("identifier fingerprints use keyed HMAC and reject weak keys", () => {
  const key = "x".repeat(32);
  assert.equal(hmacFingerprint("staff-identifier", key), hmacFingerprint("staff-identifier", key));
  assert.notEqual(hmacFingerprint("staff-identifier", key), hmacFingerprint("other", key));
  assert.throws(() => hmacFingerprint("identifier", "weak"), TypeError);
});

test("session cookie is host-only, secure, HttpOnly and SameSite strict", () => {
  const token = createOpaqueToken();
  const cookie = buildSessionCookie(token);
  assert.ok(cookie.startsWith(SESSION_COOKIE_NAME + "="));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, new RegExp("Max-Age=" + SESSION_MAX_AGE_SECONDS));
  assert.throws(() => buildSessionCookie(token, { secure: false }), TypeError);
  assert.throws(() => buildSessionCookie(token, { maxAge: SESSION_MAX_AGE_SECONDS + 1 }), TypeError);
});

test("session cookie parser rejects malformed and oversized cookie headers", () => {
  const token = createOpaqueToken();
  const cookie = buildSessionCookie(token);
  assert.equal(parseSessionCookie("theme=green; " + cookie), token);
  assert.equal(parseSessionCookie("__Host-cornhill_session=bad"), null);
  assert.equal(parseSessionCookie("x".repeat(8193)), null);
  assert.equal(parseSessionCookie(null), null);
});

test("logout cookie clears the host-only session", () => {
  const cookie = buildClearedSessionCookie();
  assert.match(cookie, /; Max-Age=0/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
});

test("staff roles use explicit permissions and unknown roles deny access", () => {
  assert.equal(hasStaffPermission(["teacher"], "academics:write"), true);
  assert.equal(hasStaffPermission(["teacher"], "finance:approve"), false);
  assert.equal(hasStaffPermission(["bursar"], "finance:write"), true);
  assert.equal(hasStaffPermission(["unknown_role"], "learners:read"), false);
  assert.equal(hasStaffPermission(["teacher"], "admin:delete"), false);
});

test("director permission is broad but only for a recognised role", () => {
  assert.equal(hasStaffPermission(["director"], "finance:approve"), true);
  assert.equal(hasStaffPermission(["director"], "system:configure"), true);
  assert.equal(hasStaffPermission(["not_director"], "system:configure"), false);
});

test("guardian access requires active account and exact approved learner mapping", () => {
  const guardian = { id: "guardian-1", account_status: "active" };
  const links = [
    { guardian_account_id: "guardian-1", learner_id: "learner-1", access_status: "approved" },
    { guardian_account_id: "guardian-1", learner_id: "learner-2", access_status: "pending" }
  ];
  assert.equal(hasApprovedGuardianLearnerAccess(guardian, "learner-1", links), true);
  assert.equal(hasApprovedGuardianLearnerAccess(guardian, "learner-2", links), false);
  assert.equal(hasApprovedGuardianLearnerAccess(guardian, "learner-3", links), false);
  assert.equal(hasApprovedGuardianLearnerAccess({ ...guardian, account_status: "suspended" }, "learner-1", links), false);
});

test("audit metadata redacts credentials and nested sensitive fields", () => {
  const safe = redactSensitiveFields({
    event: "login",
    password: "secret",
    nested: { pin: "1234", role: "teacher", accessToken: "abc" }
  });
  assert.equal(safe.password, "[REDACTED]");
  assert.equal(safe.nested.pin, "[REDACTED]");
  assert.equal(safe.nested.accessToken, "[REDACTED]");
  assert.equal(safe.nested.role, "teacher");
});
