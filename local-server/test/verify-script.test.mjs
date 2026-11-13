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

test("PostgreSQL integration verifier checks seeded roles, permission catalog and empty grants", () => {
  assert.match(source, /count\s*!==\s*17/);
  assert.match(source, /count\s*!==\s*19/);
  assert.match(source, /roleGrants\.rows\[0\]\?\.count\s*!==\s*0/);
  assert.match(source, /a\.grantee\s*=\s*0/);
  assert.match(source, /PUBLIC unexpectedly has access/);
});

test("PostgreSQL integration verifier checks database constraints", () => {
  assert.match(source, /table_constraints/);
  assert.match(source, /count\s*<\s*35/);
});
