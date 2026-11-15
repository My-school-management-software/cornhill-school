import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthenticationError,
  AuthenticationServiceError,
  CsrfValidationError,
  createAuthService
} from "../src/security/auth-service.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const GUARDIAN_ID = "22222222-2222-4222-8222-222222222222";
const HASH = "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$Ynl0ZXNlY3JldA";
const DUMMY = "$argon2id$v=19$m=65536,t=3,p=1$ZHVtbXlzYWx0$ZHVtbXl2YWx1ZQ";
const NOW = new Date("2026-11-15T19:00:00.000Z");

function setup(overrides = {}) {
  const tokens = createOpaqueSessionSecrets();
  const calls = { create: [], revoke: [], lookups: [], audit: [] };
  const state = {
    accountStatus: "active",
    sessionRow: null,
    account: {
      id: STAFF_ID, username: "teacher.one", accountStatus: "active",
      passwordHash: HASH, roles: ["teacher"], rolePermissions: { teacher: ["academics.marks_enter"] },
      classIds: []
    },
    ...overrides
  };
  const dependencies = {
    accountRepository: {
      async findStaffByUsername(value) { calls.lookups.push(["staff", value]); return state.account; },
      async findGuardianByPhone(value) { calls.lookups.push(["guardian", value]); return state.account; }
    },
    loginAttemptStore: {
      async beginAttempt() { return { allowed: true, attemptId: "attempt-1" }; },
      async completeAttempt() { return true; }
    },
    sessionRepository: {
      async createAuthenticatedSession(input) { calls.create.push(input); },
      async findActiveSessionByTokenHash(hash) { calls.lookups.push(["session", hash]); return state.sessionRow; },
      async revokeSessionByTokenHash(hash, at) { calls.revoke.push({ hash, at }); return true; }
    },
    auditRepository: {
      async recordAuthenticationEvent(input) { calls.audit.push(input); }
    },
    passwordHasher: {
      isArgon2idHash(value) { return typeof value === "string" && value.startsWith("$argon2id$"); },
      async verify(hash, credential) { return hash === HASH && credential === "correct-password"; }
    },
    dummyArgon2idHash: DUMMY,
    fingerprintSecret: "0123456789abcdef0123456789abcdef",
    tokenFactory: () => tokens,
    clock: () => NOW
  };
  const service = createAuthService({ ...dependencies, ...overrides.dependencies });
  function validStaffSession(changes = {}) {
    return {
      principalType: "staff",
      staffAccountId: STAFF_ID,
      guardianAccountId: null,
      tokenHash: tokens.sessionTokenHash,
      csrfTokenHash: tokens.csrfTokenHash,
      accountStatus: "active",
      expiresAt: new Date(NOW.getTime() + 60_000),
      revokedAt: null,
      roles: ["teacher"],
      rolePermissions: { teacher: ["academics.marks_enter"] },
      classIds: [],
      ...changes
    };
  }
  return { service, tokens, calls, state, validStaffSession };
}

test("session lookup uses a hash and never the raw session token", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession();
  await f.service.authenticate({ sessionToken: f.tokens.sessionToken });
  assert.equal(f.calls.lookups[0][1], f.tokens.sessionTokenHash);
  assert.notEqual(f.calls.lookups[0][1], f.tokens.sessionToken);
});

test("session authentication rejects a stored hash belonging to another token", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ tokenHash: "a".repeat(64) });
  await assert.rejects(f.service.authenticate({ sessionToken: f.tokens.sessionToken }), AuthenticationError);
});

test("session authentication rejects a malformed stored token hash", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ tokenHash: "not-a-hash" });
  await assert.rejects(f.service.authenticate({ sessionToken: f.tokens.sessionToken }), AuthenticationError);
});

test("session authentication rejects unknown principal types", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ principalType: "administrator" });
  await assert.rejects(f.service.authenticate({ sessionToken: f.tokens.sessionToken }), AuthenticationError);
});

test("session authentication rejects a guardian row containing a staff account id", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({
    principalType: "guardian",
    staffAccountId: STAFF_ID,
    guardianAccountId: GUARDIAN_ID
  });
  await assert.rejects(f.service.authenticate({ sessionToken: f.tokens.sessionToken }), AuthenticationError);
});

test("valid guardian session resolves only a guardian principal", async () => {
  const f = setup();
  f.state.sessionRow = {
    principalType: "guardian",
    staffAccountId: null,
    guardianAccountId: GUARDIAN_ID,
    tokenHash: f.tokens.sessionTokenHash,
    csrfTokenHash: f.tokens.csrfTokenHash,
    accountStatus: "active",
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    displayName: "Guardian"
  };
  const principal = await f.service.authenticate({ sessionToken: f.tokens.sessionToken });
  assert.equal(principal.principalType, "guardian");
  assert.equal(principal.id, GUARDIAN_ID);
  assert.equal(Object.hasOwn(principal, "roles"), false);
});

test("session repository lookup failure fails closed with a generic service error", async () => {
  const f = setup({ dependencies: {
    sessionRepository: {
      async createAuthenticatedSession() {},
      async findActiveSessionByTokenHash() { throw new Error("private database detail"); },
      async revokeSessionByTokenHash() { return true; }
    }
  }});
  await assert.rejects(f.service.authenticate({ sessionToken: f.tokens.sessionToken }), AuthenticationServiceError);
});

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(method + " requests require a valid CSRF token", async () => {
    const f = setup();
    f.state.sessionRow = f.validStaffSession();
    await assert.rejects(
      f.service.authenticate({ sessionToken: f.tokens.sessionToken, method, csrfToken: "invalid" }),
      CsrfValidationError
    );
  });
}

for (const method of ["GET", "HEAD", "OPTIONS"]) {
  test(method + " requests do not require a CSRF token", async () => {
    const f = setup();
    f.state.sessionRow = f.validStaffSession();
    const principal = await f.service.authenticate({ sessionToken: f.tokens.sessionToken, method });
    assert.equal(principal.id, STAFF_ID);
  });
}

test("CSRF token from a different session is rejected", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession();
  const other = createOpaqueSessionSecrets();
  await assert.rejects(
    f.service.authenticate({ sessionToken: f.tokens.sessionToken, method: "POST", csrfToken: other.csrfToken }),
    CsrfValidationError
  );
});

test("CSRF validation is case-insensitive for HTTP method names", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession();
  await assert.rejects(
    f.service.authenticate({ sessionToken: f.tokens.sessionToken, method: "post", csrfToken: "wrong" }),
    CsrfValidationError
  );
});

test("logout rejects an expired session without revoking it", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ expiresAt: new Date(NOW.getTime() - 1) });
  assert.equal(await f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), false);
  assert.equal(f.calls.revoke.length, 0);
});

test("logout rejects a revoked session without a second revocation", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ revokedAt: NOW });
  assert.equal(await f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), false);
  assert.equal(f.calls.revoke.length, 0);
});

test("logout rejects an inactive account without revoking the session", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ accountStatus: "suspended" });
  assert.equal(await f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), false);
  assert.equal(f.calls.revoke.length, 0);
});

test("logout rejects a session whose stored hash does not match", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ tokenHash: "b".repeat(64) });
  assert.equal(await f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), false);
  assert.equal(f.calls.revoke.length, 0);
});

test("logout rejects mixed principal identifiers", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ guardianAccountId: GUARDIAN_ID });
  assert.equal(await f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), false);
  assert.equal(f.calls.revoke.length, 0);
});

test("logout fails closed when session repository lookup fails", async () => {
  const f = setup({ dependencies: {
    sessionRepository: {
      async createAuthenticatedSession() {},
      async findActiveSessionByTokenHash() { throw new Error("database details"); },
      async revokeSessionByTokenHash() { return true; }
    }
  }});
  await assert.rejects(f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), AuthenticationServiceError);
});

test("logout reports false when repository cannot revoke the session", async () => {
  const f = setup({ dependencies: {
    sessionRepository: {
      async createAuthenticatedSession() {},
      async findActiveSessionByTokenHash(hash) {
        return {
          principalType: "staff", staffAccountId: STAFF_ID, guardianAccountId: null,
          tokenHash: hash, csrfTokenHash: f.tokens.csrfTokenHash,
          accountStatus: "active", expiresAt: new Date(NOW.getTime() + 60_000), revokedAt: null
        };
      },
      async revokeSessionByTokenHash() { return false; }
    }
  }});
  // The lookup adapter deliberately cannot complete revocation; no success is reported.
  assert.equal(await f.service.logout({ sessionToken: f.tokens.sessionToken, csrfToken: f.tokens.csrfToken }), false);
});

test("session token factory output must satisfy the opaque-token format", async () => {
  const f = setup({ dependencies: { tokenFactory: () => ({
    sessionToken: "bad", csrfToken: "bad",
    sessionTokenHash: "x".repeat(64), csrfTokenHash: "y".repeat(64)
  }) }});
  await assert.rejects(f.service.loginStaff({ username: "teacher.one", password: "correct-password" }), AuthenticationServiceError);
});

test("session creation failure attempts to revoke the newly issued token hash", async () => {
  const f = setup({ dependencies: {
    sessionRepository: {
      async createAuthenticatedSession() { throw new Error("database write failed"); },
      async findActiveSessionByTokenHash() { return null; },
      async revokeSessionByTokenHash(hash) { f.calls.revoke.push(hash); return true; }
    }
  }});
  await assert.rejects(f.service.loginStaff({ username: "teacher.one", password: "correct-password" }), AuthenticationServiceError);
  assert.deepEqual(f.calls.revoke, [f.tokens.sessionTokenHash]);
});

test("session creation never stores the raw session or CSRF token", async () => {
  const f = setup();
  await f.service.loginStaff({ username: "teacher.one", password: "correct-password" });
  const stored = JSON.stringify(f.calls.create[0]);
  assert.equal(stored.includes(f.tokens.sessionToken), false);
  assert.equal(stored.includes(f.tokens.csrfToken), false);
  assert.equal(stored.includes(f.tokens.sessionTokenHash), true);
  assert.equal(stored.includes(f.tokens.csrfTokenHash), true);
});

test("principal returned by authentication is frozen and excludes credential fields", async () => {
  const f = setup();
  f.state.sessionRow = f.validStaffSession({ passwordHash: HASH, pinHash: HASH });
  const principal = await f.service.authenticate({ sessionToken: f.tokens.sessionToken });
  assert.equal(Object.isFrozen(principal), true);
  assert.equal(Object.hasOwn(principal, "passwordHash"), false);
  assert.equal(Object.hasOwn(principal, "pinHash"), false);
});

test("session authentication fails closed when the clock is invalid", async () => {
  const f = setup({ dependencies: { clock: () => new Date("invalid") } });
  f.state.sessionRow = f.validStaffSession();
  await assert.rejects(f.service.authenticate({ sessionToken: f.tokens.sessionToken }), AuthenticationError);
});
