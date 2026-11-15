import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/verify-local-schema.mjs", import.meta.url), "utf8");

test("PostgreSQL integration verifier checks all eleven identity and authorization tables", () => {
  for (const table of [
    "auth_sessions", "guardian_accounts", "guardian_learner_access",
    "login_attempts", "permission_catalog", "security_audit_events",
    "staff_accounts", "staff_class_assignments", "staff_role_assignments",
    "staff_role_permissions", "staff_roles"
  ]) assert.ok(source.includes(table));
});

test("PostgreSQL integration verifier checks seeded roles, protected Director grants and audited delegation", () => {
  assert.ok(source.includes("roles.rows[0]?.count !== 17"));
  assert.ok(source.includes("SELECT permission_code FROM cornhill_auth.permission_catalog ORDER BY permission_code"));
  assert.ok(source.includes("permissionCatalog.rows.length !== 50"));
  assert.ok(source.includes("permissionCatalog.rows.map(row => row.permission_code).join"));

  assert.ok(source.includes("Only one active Director account is permitted."));
  assert.ok(source.includes("invalid_delegated"));
  assert.ok(source.includes("The initial Director must retain the complete protected permission catalogue."));
  assert.ok(source.includes("set_staff_role_permissions"));
  assert.ok(source.includes("has_function_privilege"));
  assert.ok(source.includes("Director-controlled role grants"));
  assert.ok(source.includes("a.grantee = 0"));
  assert.ok(source.includes("PUBLIC unexpectedly has access"));
});

test("PostgreSQL integration verifier checks database constraints", () => {
  assert.ok(source.includes("table_constraints"));
  assert.ok(source.includes("constraints.rows[0]?.count < 35"));
});
