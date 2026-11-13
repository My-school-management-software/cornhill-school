import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthenticationError,
  AuthenticationRateLimitError,
  AuthenticationServiceError,
  CsrfValidationError,
  createAuthService,
  createCredentialFingerprinter,
  normalizeGuardianPhone,
  normalizeStaffIdentifier
} from "../src/security/auth-service.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const GUARDIAN_ID = "22222222-2222-4222-8222-222222222222";
const HASH = "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$Ynl0ZXNlY3JldA";
const DUMMY = "$argon2id$v=19$m=65536,t=3,p=1$ZHVtbXlzYWx0$ZHVtbXl2YWx1ZQ";
const SESSION = createOpaqueSessionSecrets();
const NOW = new Date("2026-11-13T20:00:00Z");

function fixture(overrides = {}) {
  const calls = { attempts: [], audits: [], sessions: [], verifications: [], revoked: [] };
  const staffAccount = {
    id: STAFF_ID, username: "teacher.one", accountStatus: "active",
    passwordHash: HASH, displayName: "Teacher One",
    roles: ["teacher", "made_up_role"],
    classIds: ["33333333-3333-4333-8333-333333333333", "not-a-class"]
  };
  const guardianAccount = {
    id: GUARDIAN_ID, accountStatus: "active", pinHash: HASH,
    displayName: "Guardian One", phone_e164: "+256700000001"
  };
  const state = {
    allowed: true,
    staff: staffAccount,
    guardian: guardianAccount,
    failVerify: false,
    sessionRow: null,
    ...overrides
  };
  const service = createAuthService({
    accountRepository: {
      async findStaffByUsername(name) { calls.staffLookup = name; return state.staff; },
      async findGuardianByPhone(phone) { calls.guardianLookup = phone; return state.guardian; }
    },
    loginAttemptStore: {
      async beginAttempt(input) {
        calls.attempts.push(input);
        return state.allowed ? { allowed: true, attemptId: "attempt-1" } : { allowed: false };
      },
      async completeAttempt(input) { calls.completed = input; }
    },
    sessionRepository: {
      async createAuthenticatedSession(input) { calls.sessions.push(input); },
      async findActiveSessionByTokenHash() { return state.sessionRow; },
      async revokeSessionByTokenHash(hash, at) { calls.revoked.push({ hash, at }); return true; }
    },
    auditRepository: {
      async recordAuthenticationEvent(input) { calls.audits.push(input); }
    },
    passwordHasher: {
      isArgon2idHash(hash) { return typeof hash === "string" && hash.startsWith("$argon2id$"); },
      async verify(hash, credential) {
        calls.verifications.push({ hash, credential });
        if (state.failVerify) throw new Error("test hash adapter failure");
        return hash === HASH && credential === "Correct-Horse-Battery";
      }
    },
    dummyArgon2idHash: DUMMY,
    fingerprintSecret: "0123456789abcdef0123456789abcdef",
    tokenFactory: () => SESSION,
    clock: () => NOW,
    ...overrides.dependencies
  });
  return { service, calls, state, staffAccount, guardianAccount };
}

test("staff identifier normalisation trims, Unicode-normalises and folds case", () => {
  assert.equal(normalizeStaffIdentifier("  TEACHER.One  "), "teacher.one");
  assert.equal(normalizeStaffIdentifier("ＡBC"), "abc");
});
test("staff identifier rejects short, long and non-string input", () => {
  assert.equal(normalizeStaffIdentifier("ab"), null);
  assert.equal(normalizeStaffIdentifier("x".repeat(121)), null);
  assert.equal(normalizeStaffIdentifier(null), null);
});
test("guardian phone accepts only E.164 format", () => {
  assert.equal(normalizeGuardianPhone("+256700000001"), "+256700000001");
  assert.equal(normalizeGuardianPhone("0700000001"), null);
  assert.equal(normalizeGuardianPhone("+00000000"), null);
});
test("fingerprint secret must contain at least 32 bytes", () => {
  assert.throws(() => createCredentialFingerprinter("too-short"), /32 bytes/);
});
test("credential fingerprints are keyed, stable and SHA-256 sized", () => {
  const fingerprint = createCredentialFingerprinter("0123456789abcdef0123456789abcdef");
  assert.equal(fingerprint("staff:teacher"), fingerprint("staff:teacher"));
  assert.match(fingerprint("staff:teacher"), /^[a-f0-9]{64}$/);
  assert.notEqual(fingerprint("staff:teacher"), createCredentialFingerprinter("abcdef0123456789abcdef0123456789")("staff:teacher"));
});
test("fingerprint utility rejects empty and oversized identifiers", () => {
  const fingerprint = createCredentialFingerprinter("0123456789abcdef0123456789abcdef");
  assert.throws(() => fingerprint(""), /invalid/);
  assert.throws(() => fingerprint("x".repeat(257)), /invalid/);
});
test("service refuses incomplete repository contracts", () => {
  assert.throws(() => createAuthService({}), /dependency is incomplete/);
});
test("service refuses a non-Argon2id dummy hash", () => {
  const { service } = fixture();
  assert.ok(service);
  assert.throws(() => fixture({ dependencies: { dummyArgon2idHash: "plain" } }), /valid Argon2id/);
});
test("successful staff login creates a hashed session and returns a minimal principal", async () => {
  const { service, calls } = fixture();
  const result = await service.loginStaff({
    username: " TEACHER.ONE ", password: "Correct-Horse-Battery", sourceAddress: "127.0.0.1"
  });
  assert.equal(result.principal.id, STAFF_ID);
  assert.deepEqual(result.principal.roles, ["teacher"]);
  assert.equal(Object.hasOwn(result.principal, "passwordHash"), false);
  assert.equal(result.sessionToken, SESSION.sessionToken);
  assert.equal(calls.sessions.length, 1);
  assert.equal(calls.sessions[0].tokenHash, SESSION.sessionTokenHash);
  assert.equal(calls.sessions[0].csrfTokenHash, SESSION.csrfTokenHash);
  assert.notEqual(calls.sessions[0].tokenHash, SESSION.sessionToken);
  assert.equal(calls.completed.succeeded, true);
});
test("successful guardian login is represented as a guardian principal", async () => {
  const { service } = fixture();
  const result = await service.loginGuardian({
    phone: "+256700000001", pin: "Correct-Horse-Battery"
  });
  assert.equal(result.principal.principalType, "guardian");
  assert.equal(result.principal.id, GUARDIAN_ID);
  assert.equal(Object.hasOwn(result.principal, "phone_e164"), false);
  assert.equal(Object.hasOwn(result.principal, "roles"), false);
});
test("unknown account verifies against the dummy Argon2id hash", async () => {
  const { service, calls } = fixture({ staff: null });
  await assert.rejects(service.loginStaff({
    username: "unknown.user", password: "Wrong-Credential"
  }), AuthenticationError);
  assert.equal(calls.verifications[0].hash, DUMMY);
  assert.equal(calls.completed.succeeded, false);
});
test("wrong password returns generic authentication error", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Wrong-Credential"
  }), AuthenticationError);
  assert.equal(calls.audits[0].eventCode, "authentication.login_denied");
  assert.equal(calls.sessions.length, 0);
});
test("inactive account is denied even with a valid password", async () => {
  const { service } = fixture({ staff: {
    id: STAFF_ID, username: "teacher.one", accountStatus: "suspended",
    passwordHash: HASH, roles: []
  } });
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  }), AuthenticationError);
});
test("invalid account UUID is denied", async () => {
  const { service } = fixture({ staff: {
    id: "not-a-uuid", accountStatus: "active", passwordHash: HASH
  } });
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  }), AuthenticationError);
});
test("rate limiting occurs before account lookup", async () => {
  const { service, calls } = fixture({ allowed: false });
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  }), AuthenticationRateLimitError);
  assert.equal(calls.staffLookup, undefined);
  assert.equal(calls.audits[0].outcome, "denied");
});
test("invalid identifiers do not reach repositories", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.loginGuardian({ phone: "0700000001", pin: "hello" }), AuthenticationError);
  assert.equal(calls.guardianLookup, undefined);
  assert.equal(calls.attempts.length, 0);
});
test("invalid credentials do not reach repositories", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.loginStaff({ username: "teacher.one", password: "" }), AuthenticationError);
  assert.equal(calls.staffLookup, undefined);
});
test("source address is stored only as a keyed fingerprint", async () => {
  const { service, calls } = fixture();
  await service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery", sourceAddress: "192.0.2.10"
  });
  assert.match(calls.attempts[0].sourceFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(calls.attempts[0]).includes("192.0.2.10"), false);
});
test("identifier is stored only as a keyed fingerprint", async () => {
  const { service, calls } = fixture();
  await service.loginStaff({ username: "teacher.one", password: "Correct-Horse-Battery" });
  assert.match(calls.attempts[0].identifierFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(calls.attempts[0]).includes("teacher.one"), false);
});
test("database attempt-store error fails closed", async () => {
  const { service } = fixture({ dependencies: {
    loginAttemptStore: { async beginAttempt() { throw new Error("db down"); }, async completeAttempt() {} }
  } });
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  }), AuthenticationServiceError);
});
test("password hasher error is not exposed to the caller", async () => {
  const { service } = fixture({ failVerify: true });
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  }), AuthenticationServiceError);
});
test("session repository error does not reveal implementation details", async () => {
  const { service } = fixture({ dependencies: {
    sessionRepository: {
      async createAuthenticatedSession() { throw new Error("database secret detail"); },
      async findActiveSessionByTokenHash() { return null; },
      async revokeSessionByTokenHash() { return true; }
    }
  } });
  await assert.rejects(service.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  }), AuthenticationServiceError);
});
test("login responses use distinct configured staff and guardian lifetimes", async () => {
  const { service: staffService } = fixture();
  const staffResult = await staffService.loginStaff({
    username: "teacher.one", password: "Correct-Horse-Battery"
  });
  assert.equal(staffResult.cookieMaxAgeSeconds, 8 * 60 * 60);
  const { service: guardianService } = fixture();
  const guardianResult = await guardianService.loginGuardian({
    phone: "+256700000001", pin: "Correct-Horse-Battery"
  });
  assert.equal(guardianResult.cookieMaxAgeSeconds, 30 * 60);
});
test("session authentication rejects malformed token", async () => {
  const { service } = fixture();
  await assert.rejects(service.authenticate({ sessionToken: "bad" }), AuthenticationError);
});
test("session authentication requires an active matching stored session", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null, roles: ["teacher"], classIds: []
  };
  const principal = await service.authenticate({ sessionToken: SESSION.sessionToken });
  assert.equal(principal.id, STAFF_ID);
  assert.equal(principal.principalType, "staff");
});
test("session authentication denies expired sessions", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() - 1),
    revokedAt: null
  };
  await assert.rejects(service.authenticate({ sessionToken: SESSION.sessionToken }), AuthenticationError);
});
test("session authentication denies account status changes", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "suspended", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null
  };
  await assert.rejects(service.authenticate({ sessionToken: SESSION.sessionToken }), AuthenticationError);
});
test("session authentication denies mixed staff and guardian principal IDs", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: GUARDIAN_ID,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null
  };
  await assert.rejects(service.authenticate({ sessionToken: SESSION.sessionToken }), AuthenticationError);
});
test("session authentication denies explicitly revoked sessions", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: NOW
  };
  await assert.rejects(service.authenticate({ sessionToken: SESSION.sessionToken }), AuthenticationError);
});
test("session authentication denies malformed expiry timestamps", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: "not-a-date", revokedAt: null
  };
  await assert.rejects(service.authenticate({ sessionToken: SESSION.sessionToken }), AuthenticationError);
});
test("unsafe requests require a valid CSRF token", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null
  };
  await assert.rejects(
    service.authenticate({ sessionToken: SESSION.sessionToken, method: "POST", csrfToken: "wrong" }),
    CsrfValidationError
  );
});
test("unsafe requests pass with a valid CSRF token", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null
  };
  const principal = await service.authenticate({
    sessionToken: SESSION.sessionToken, method: "PATCH", csrfToken: SESSION.csrfToken
  });
  assert.equal(principal.id, STAFF_ID);
});
test("safe methods do not require a CSRF token", async () => {
  const { service, state } = fixture();
  state.sessionRow = {
    principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
    tokenHash: SESSION.sessionTokenHash, csrfTokenHash: SESSION.csrfTokenHash,
    accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null
  };
  const principal = await service.authenticate({ sessionToken: SESSION.sessionToken, method: "GET" });
  assert.equal(principal.id, STAFF_ID);
});
test("logout revokes the stored token hash without requiring a raw token in storage", async () => {
  const { service, calls } = fixture();
  assert.equal(await service.logout({ sessionToken: SESSION.sessionToken }), true);
  assert.equal(calls.revoked[0].hash, SESSION.sessionTokenHash);
  assert.notEqual(calls.revoked[0].hash, SESSION.sessionToken);
});
test("logout rejects malformed tokens without repository access", async () => {
  const { service, calls } = fixture();
  assert.equal(await service.logout({ sessionToken: "bad" }), false);
  assert.equal(calls.revoked.length, 0);
});
