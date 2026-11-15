import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthorizationError,
  LOCAL_AUTHORIZATION_CATALOG,
  guardianHasLearnerAccess,
  requireGuardianLearnerAccess,
  requireStaffClassAssignment,
  requireStaffPermission,
  staffHasClassAssignment,
  staffHasPermission
} from "../src/security/authorization.mjs";

const NOW = Date.parse("2026-11-15T19:00:00.000Z");
const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const CLASS_ID = "22222222-2222-4222-8222-222222222222";
const LEARNER_ID = "33333333-3333-4333-8333-333333333333";
const GUARDIAN_ID = "44444444-4444-4444-8444-444444444444";

function staff({
  roles = ["teacher"],
  rolePermissions = { teacher: ["academics.marks_enter"] },
  accountStatus = "active",
  expiresAt = NOW + 60_000,
  revokedAt = null,
  principalType = "staff",
  classIds = [CLASS_ID],
  id = STAFF_ID
} = {}) {
  return {
    id, principalType, accountStatus, roles, rolePermissions, classIds,
    session: { expiresAt, revokedAt }
  };
}

function guardian({ expiresAt = NOW + 60_000, revokedAt = null } = {}) {
  return {
    id: GUARDIAN_ID, principalType: "guardian", accountStatus: "active",
    session: { expiresAt, revokedAt }
  };
}

test("authorization catalogue exposes unique role and permission codes", () => {
  assert.equal(new Set(LOCAL_AUTHORIZATION_CATALOG.staffRoles).size, LOCAL_AUTHORIZATION_CATALOG.staffRoles.length);
  assert.equal(new Set(LOCAL_AUTHORIZATION_CATALOG.permissions).size, LOCAL_AUTHORIZATION_CATALOG.permissions.length);
  assert.ok(LOCAL_AUTHORIZATION_CATALOG.staffRoles.includes("director"));
  assert.ok(LOCAL_AUTHORIZATION_CATALOG.permissions.includes("system.roles_manage"));
});

const roleCases = [
  ["director", "system.roles_manage"],
  ["headteacher", "learners.read"],
  ["deputy_headteacher", "learners.read"],
  ["director_of_studies", "academics.assessments_manage"],
  ["bursar", "finance.payments_record"],
  ["deputy_bursar", "finance.payments_record"],
  ["teacher", "academics.marks_enter"],
  ["class_teacher", "academics.results_view"],
  ["upper_primary_teacher", "academics.marks_enter"],
  ["lower_primary_teacher", "academics.marks_enter"],
  ["nursery_head", "academics.results_view"],
  ["matron", "staff.profile_manage"],
  ["patron", "staff.profile_manage"],
  ["senior_woman", "staff.profile_manage"],
  ["senior_man", "staff.profile_manage"],
  ["store_manager", "finance.expenses_request"],
  ["cook", "staff.profile_manage"]
];

for (const [role, permission] of roleCases) {
  test(`accepts an explicitly assigned permission for ${role}`, () => {
    const principal = staff({ roles: [role], rolePermissions: { [role]: [permission] } });
    assert.equal(staffHasPermission({ principal, permissionCode: permission, nowMs: NOW }), true);
  });
}

test("does not inherit a permission from a role the account does not hold", () => {
  const principal = staff({ roles: ["teacher"], rolePermissions: {
    teacher: ["academics.marks_enter"], director: ["system.roles_manage"]
  }});
  assert.equal(staffHasPermission({ principal, permissionCode: "system.roles_manage", nowMs: NOW }), false);
});

test("does not grant permissions from an unknown role", () => {
  const principal = staff({ roles: ["super_admin"], rolePermissions: { super_admin: ["system.roles_manage"] } });
  assert.equal(staffHasPermission({ principal, permissionCode: "system.roles_manage", nowMs: NOW }), false);
});

test("rejects a permission code outside the authorization catalogue", () => {
  assert.equal(staffHasPermission({ principal: staff(), permissionCode: "system.root_access", nowMs: NOW }), false);
});

test("rejects a missing role-permission map", () => {
  assert.equal(staffHasPermission({ principal: { ...staff(), rolePermissions: null }, permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("rejects a malformed role-permission map", () => {
  assert.equal(staffHasPermission({ principal: { ...staff(), rolePermissions: [] }, permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("rejects a non-array permission grant", () => {
  const principal = staff({ rolePermissions: { teacher: "academics.marks_enter" } });
  assert.equal(staffHasPermission({ principal, permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("rejects inactive staff accounts", () => {
  assert.equal(staffHasPermission({ principal: staff({ accountStatus: "disabled" }), permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("rejects expired staff sessions", () => {
  assert.equal(staffHasPermission({ principal: staff({ expiresAt: NOW }), permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("rejects revoked staff sessions", () => {
  assert.equal(staffHasPermission({ principal: staff({ revokedAt: "2026-11-15T18:59:00.000Z" }), permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("rejects a guardian principal on staff permissions", () => {
  const principal = { ...guardian(), roles: ["director"], rolePermissions: { director: ["system.roles_manage"] } };
  assert.equal(staffHasPermission({ principal, permissionCode: "system.roles_manage", nowMs: NOW }), false);
});

test("rejects malformed staff account identifiers", () => {
  assert.equal(staffHasPermission({ principal: staff({ id: "not-a-uuid" }), permissionCode: "academics.marks_enter", nowMs: NOW }), false);
});

test("requires a live staff session before allowing a permission", () => {
  const principal = staff();
  assert.equal(requireStaffPermission({ principal, permissionCode: "academics.marks_enter", nowMs: NOW }), true);
});

test("throws AuthorizationError when a permission is absent", () => {
  assert.throws(
    () => requireStaffPermission({ principal: staff(), permissionCode: "finance.payments_reverse", nowMs: NOW }),
    AuthorizationError
  );
});

test("class assignment is restricted to the assigned class", () => {
  assert.equal(staffHasClassAssignment({ principal: staff(), classId: CLASS_ID, nowMs: NOW }), true);
  assert.equal(staffHasClassAssignment({ principal: staff(), classId: LEARNER_ID, nowMs: NOW }), false);
});

test("class assignment comparison is case-insensitive for UUIDs", () => {
  assert.equal(staffHasClassAssignment({ principal: staff(), classId: CLASS_ID.toUpperCase(), nowMs: NOW }), true);
});

test("class assignment rejects malformed class identifiers", () => {
  assert.equal(staffHasClassAssignment({ principal: staff(), classId: "class-one", nowMs: NOW }), false);
});

test("class assignment rejects expired sessions", () => {
  assert.equal(staffHasClassAssignment({ principal: staff({ expiresAt: NOW - 1 }), classId: CLASS_ID, nowMs: NOW }), false);
});

test("required class assignment throws when class is not assigned", () => {
  assert.throws(
    () => requireStaffClassAssignment({ principal: staff(), classId: LEARNER_ID, nowMs: NOW }),
    AuthorizationError
  );
});

test("guardian access requires an approved relationship on every check", async () => {
  let checks = 0;
  const principal = guardian();
  const accessRepository = {
    async hasApprovedLearnerAccess(input) {
      checks++;
      assert.equal(input.guardianAccountId, GUARDIAN_ID);
      assert.equal(input.learnerId, LEARNER_ID);
      return true;
    }
  };
  assert.equal(await guardianHasLearnerAccess({ principal, learnerId: LEARNER_ID, accessRepository, nowMs: NOW }), true);
  assert.equal(await guardianHasLearnerAccess({ principal, learnerId: LEARNER_ID, accessRepository, nowMs: NOW }), true);
  assert.equal(checks, 2);
});

test("guardian access denies an unapproved learner", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return false; } };
  assert.equal(await guardianHasLearnerAccess({ principal: guardian(), learnerId: LEARNER_ID, accessRepository, nowMs: NOW }), false);
});

test("guardian access denies malformed learner identifiers without repository lookup", async () => {
  let checks = 0;
  const accessRepository = { async hasApprovedLearnerAccess() { checks++; return true; } };
  assert.equal(await guardianHasLearnerAccess({ principal: guardian(), learnerId: "PUPIL-001", accessRepository, nowMs: NOW }), false);
  assert.equal(checks, 0);
});

test("guardian access rejects expired guardian sessions", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return true; } };
  assert.equal(await guardianHasLearnerAccess({ principal: guardian({ expiresAt: NOW }), learnerId: LEARNER_ID, accessRepository, nowMs: NOW }), false);
});

test("guardian access rejects revoked guardian sessions", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return true; } };
  assert.equal(await guardianHasLearnerAccess({ principal: guardian({ revokedAt: "2026-11-15T18:59:00.000Z" }), learnerId: LEARNER_ID, accessRepository, nowMs: NOW }), false);
});

test("required guardian access throws when the relationship is not approved", async () => {
  const accessRepository = { async hasApprovedLearnerAccess() { return false; } };
  await assert.rejects(
    requireGuardianLearnerAccess({ principal: guardian(), learnerId: LEARNER_ID, accessRepository, nowMs: NOW }),
    AuthorizationError
  );
});
