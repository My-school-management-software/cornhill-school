import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/004_local_auth_runtime_role.sql", import.meta.url), "utf8");
const verifier = await readFile(new URL("../scripts/verify-local-runtime-role.mjs", import.meta.url), "utf8");

test("authentication runtime roles are administrator-provisioned and remain unprivileged", async () => {
  const installer = await readFile(new URL("../windows/Install-CORNHILL-Local.ps1", import.meta.url), "utf8");
  assert.match(installer, /CREATE ROLE cornhill_auth_runtime NOLOGIN/);
  assert.match(installer, /CREATE ROLE cornhill_auth_api NOLOGIN INHERIT/);
  assert.match(installer, /ALTER ROLE cornhill_auth_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(installer, /ALTER ROLE cornhill_auth_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
  assert.match(installer, /GRANT cornhill_auth_runtime TO cornhill_auth_api/);
  assert.match(migration, /must be provisioned by the local PostgreSQL administrator before migration 004/);
  assert.match(migration, /must remain NOLOGIN and non-privileged/);
});
test("runtime role migration uses column-level privileges rather than broad table CRUD", () => {
  assert.match(migration, /GRANT SELECT \(id, username, username_normalized, password_hash, account_status\)/);
  assert.match(migration, /GRANT UPDATE \(last_login_at, updated_at\)/);
  assert.match(migration, /GRANT UPDATE \(revoked_at\)/);
  assert.doesNotMatch(migration, /GRANT ALL PRIVILEGES ON ALL TABLES/);
});
test("runtime auth role cannot administer guardian links or role permissions", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*guardian_learner_access/);
});
test("role verifier confirms no login until secret provisioning and no superuser flags", () => {
  assert.match(verifier, /rolcanlogin/);
  assert.match(verifier, /must remain NOLOGIN/);
  assert.match(verifier, /rolsuper/);
  assert.match(verifier, /rolbypassrls/);
});
test("role verifier checks that sensitive management permissions are absent", () => {
  assert.match(verifier, /staff_status_update/);
  assert.match(verifier, /permission_grant_insert/);
  assert.match(verifier, /guardian_link_update/);
  assert.match(verifier, /audit_read/);
  assert.match(verifier, /audit_sequence_usage/);
  assert.match(verifier, /has_column_privilege\('cornhill_auth_api', 'cornhill_auth\.security_audit_events', 'event_code', 'INSERT'\)/);
});
test("runtime config uses only the dedicated API login and loopback host", async () => {
  const config = await readFile(new URL("../src/db/runtime-config.mjs", import.meta.url), "utf8");
  assert.match(config, /LOOPBACK_HOSTS/);
  assert.match(config, /user !== "cornhill_auth_api"/);
  assert.match(config, /CORNHILL_DB_RUNTIME_PASSWORD/);
});
