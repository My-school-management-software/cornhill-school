import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/verify-local-schema.mjs", import.meta.url), "utf8");

test("PostgreSQL integration verifier checks all eight identity tables", () => {
  for (const table of [
    "auth_sessions", "guardian_accounts", "guardian_learner_access",
    "login_attempts", "security_audit_events", "staff_accounts",
    "staff_role_assignments", "staff_roles"
  ]) assert.ok(source.includes(table));
});

test("PostgreSQL integration verifier checks seeded roles and PUBLIC isolation", () => {
  assert.match(source, /count !== 17/);
  assert.match(source, /a\.grantee = 0/);
  assert.match(source, /PUBLIC unexpectedly has access/);
});

test("PostgreSQL integration verifier checks database constraints", () => {
  assert.match(source, /table_constraints/);
  assert.match(source, /count < 20/);
});
