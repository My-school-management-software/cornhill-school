import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/004_local_auth_runtime_role.sql", import.meta.url), "utf8");

test("migration 004 requires administrator-provisioned auth roles", () => {
  assert.match(migration, /Authentication roles must be provisioned by the local PostgreSQL administrator/);
  assert.match(migration, /pg_catalog\.pg_roles/);
  assert.match(migration, /pg_catalog\.pg_has_role\('cornhill_auth_api', 'cornhill_auth_runtime', 'MEMBER'\)/);
});

test("migration 004 never creates, alters or grants membership to cluster roles", () => {
  assert.doesNotMatch(migration, /CREATE ROLE/i);
  assert.doesNotMatch(migration, /ALTER ROLE/i);
  assert.doesNotMatch(migration, /GRANT cornhill_auth_runtime TO cornhill_auth_api/i);
});

test("migration 004 retains database and schema scoped grants", () => {
  assert.match(migration, /GRANT CONNECT ON DATABASE cornhill_local TO cornhill_auth_runtime/);
  assert.match(migration, /GRANT USAGE ON SCHEMA cornhill_auth TO cornhill_auth_runtime/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
});
