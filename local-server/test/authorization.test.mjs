import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthorizationError,
  guardianHasLearnerAccess,
  isLocalUuid,
  requireGuardianLearnerAccess,
  requireStaffClassAssignment,
  requireStaffPermission,
  sessionMatchesPrincipal,
  staffHasClassAssignment,
  staffHasPermission
} from "../src/security/authorization.mjs";

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const GUARDIAN_ID = "22222222-2222-4222-8222-222222222222";
const LEARNER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_LEARNER_ID = "44444444-4444-4444-8444-444444444444";
const CLASS_ID = "55555555-5555-4555-8555-555555555555";
const NOW = Date.parse("2026-11-13T20:00:00Z");

function staff(overrides = {}) {
  return {
    id: STAFF_ID,
    principalType: "staff",
    accountStatus: "active",
    session: { revokedAt: null, expiresAt: NOW + 60_000 },
    roles: ["teacher"],
    classIds: [CLASS_ID],
    ...overrides
  };
}
function guardian(overrides = {}) {
  return {
    id: GUARDIAN_ID,
    principalType: "guardian",
    accountStatus: "active",
    session: { revokedAt: null, expiresAt: NOW + 60_000 },
    ...overrides
  };
}
const teacherPermissions = { teacher: ["academics.marks_enter", "learners.read"] };

test("active staff with an explicitly granted permission is authorised", () => {
  assert.equal(staffHasPermission({
    principal: staff(), permissionCode: "academics.marks_enter",
    rolePermissions: teacherPermissions, nowMs: NOW
  }), true);
});
test("staff without an explicit role grant are denied", () => {
  assert.equal(staffHasPermission({
    principal: staff({ roles: ["cook"] }), permissionCode: "academics.marks_enter",
    rolePermissions: teacherPermissions, nowMs: NOW
  }), false);
});
test("an unknown permission code is denied even if supplied in a mapping", () => {
  assert.equal(staffHasPermission({
    principal: staff(), permissionCode: "system.root_access",
    rolePermissions: { teacher: ["system.root_access"] }, nowMs: NOW
  }), false);
});
test("inactive staff accounts are denied", () => {
  assert.equal(staffHasPermission({
    principal: staff({ accountStatus: "suspended" }),
    permissionCode: "learners.read", rolePermissions: teacherPermissions, nowMs: NOW
  }), false);
});
test("revoked staff sessions are denied", () => {
  assert.equal(staffHasPermission({
    principal: staff({ session: { revokedAt: NOW - 1, expiresAt: NOW + 60_000 } }),
    permissionCode: "learners.read", rolePermissions: teacherPermissions, nowMs: NOW
  }), false);
});
test("expired staff sessions are denied", () => {
  assert.equal(staffHasPermission({
    principal: staff({ session: { revokedAt: null, expiresAt: NOW } }),
    permissionCode: "learners.read", rolePermissions: teacherPermissions, nowMs: NOW
  }), false);
});
test("guardian principals cannot use staff permission checks", () => {
  assert.equal(staffHasPermission({
    principal: guardian(), permissionCode: "learners.read",
    rolePermissions: teacherPermissions, nowMs: NOW
  }), false);
});
test("malformed role collections fail closed", () => {
  assert.equal(staffHasPermission({
    principal: staff({ roles: "director" }), permissionCode: "learners.read",
    rolePermissions: { director: ["learners.read"] }, nowMs: NOW
  }), false);
});
test("inherited role mapping properties cannot grant permissions", () => {
  const inherited = Object.create({ teacher: ["learners.read"] });
  assert.equal(staffHasPermission({
    principal: staff(), permissionCode: "learners.read",
    rolePermissions: inherited, nowMs: NOW
  }), false);
});
test("staff with a matching class assignment can access that class scope", () => {
  assert.equal(staffHasClassAssignment({
    principal: staff(), classId: CLASS_ID, nowMs: NOW
  }), true);
});
test("staff cannot access a class they are not assigned to", () => {
  assert.equal(staffHasClassAssignment({
    principal: staff(), classId: OTHER_LEARNER_ID, nowMs: NOW
  }), false);
});
test("malformed class identifiers are denied", () => {
  assert.equal(staffHasClassAssignment({
    principal: staff(), classId: "P7", nowMs: NOW
  }), false);
});
test("staff class requirement throws a generic access-denied error", () => {
  assert.throws(() => requireStaffClassAssignment({
    principal: staff({ classIds: [] }), classId: CLASS_ID, nowMs: NOW
  }), AuthorizationError);
});
test("guardian with an approved mapping can access only the requested learner", async () => {
  const calls = [];
  const accessRepository = {
    async hasApprovedLearnerAccess(input) {
      calls.push(input);
      return input.guardianAccountId === GUARDIAN_ID && input.learnerId === LEARNER_ID;
    }
  };
  assert.equal(await guardianHasLearnerAccess({
    principal: guardian(), learnerId: LEARNER_ID, accessRepository, nowMs: NOW
  }), true);
  assert.deepEqual(calls, [{ guardianAccountId: GUARDIAN_ID, learnerId: LEARNER_ID }]);
});
test("guardian cannot access another learner without a separate approved mapping", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return false; } };
  assert.equal(await guardianHasLearnerAccess({
    principal: guardian(), learnerId: OTHER_LEARNER_ID, accessRepository, nowMs: NOW
  }), false);
});
test("pending or revoked guardian links are denied by the access repository result", async () => {
  for (const result of [false, null, undefined, "approved"]) {
    const accessRepository = { async hasApprovedLearnerAccess() { return result; } };
    assert.equal(await guardianHasLearnerAccess({
      principal: guardian(), learnerId: LEARNER_ID, accessRepository, nowMs: NOW
    }), false);
  }
});
test("guardian cannot call the staff permission path", () => {
  assert.throws(() => requireStaffPermission({
    principal: guardian(), permissionCode: "learners.read",
    rolePermissions: { director: ["learners.read"] }, nowMs: NOW
  }), AuthorizationError);
});
test("invalid guardian learner identifiers are denied before repository access", async () => {
  let called = false;
  const accessRepository = { async hasApprovedLearnerAccess() { called = true; return true; } };
  assert.equal(await guardianHasLearnerAccess({
    principal: guardian(), learnerId: "LIN-123", accessRepository, nowMs: NOW
  }), false);
  assert.equal(called, false);
});
test("guardian accounts with inactive status are denied", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return true; } };
  assert.equal(await guardianHasLearnerAccess({
    principal: guardian({ accountStatus: "disabled" }),
    learnerId: LEARNER_ID, accessRepository, nowMs: NOW
  }), false);
});
test("guardian sessions are rechecked for revocation and expiry", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return true; } };
  for (const session of [
    { revokedAt: NOW, expiresAt: NOW + 60_000 },
    { revokedAt: null, expiresAt: NOW - 1 }
  ]) {
    assert.equal(await guardianHasLearnerAccess({
      principal: guardian({ session }), learnerId: LEARNER_ID,
      accessRepository, nowMs: NOW
    }), false);
  }
});
test("missing guardian repository fails closed", async () => {
  assert.equal(await guardianHasLearnerAccess({
    principal: guardian(), learnerId: LEARNER_ID, nowMs: NOW
  }), false);
});
test("guardian access requirement throws a generic error when no approved link exists", async () => {
  await assert.rejects(
    requireGuardianLearnerAccess({
      principal: guardian(), learnerId: LEARNER_ID,
      accessRepository: { async hasApprovedLearnerAccess() { return false; } },
      nowMs: NOW
    }),
    AuthorizationError
  );
});
test("session principal mapping forbids mixed staff and guardian identity", () => {
  const hash = "a".repeat(64);
  assert.equal(sessionMatchesPrincipal({
    principalType: "staff", staffAccountId: STAFF_ID,
    guardianAccountId: null, tokenHash: hash
  }), true);
  assert.equal(sessionMatchesPrincipal({
    principalType: "staff", staffAccountId: STAFF_ID,
    guardianAccountId: GUARDIAN_ID, tokenHash: hash
  }), false);
  assert.equal(sessionMatchesPrincipal({
    principalType: "guardian", staffAccountId: STAFF_ID,
    guardianAccountId: GUARDIAN_ID, tokenHash: hash
  }), false);
});
test("UUID helper rejects non-UUID learner and class values", () => {
  assert.equal(isLocalUuid(LEARNER_ID), true);
  assert.equal(isLocalUuid("AKAMPURIRA"), false);
});
