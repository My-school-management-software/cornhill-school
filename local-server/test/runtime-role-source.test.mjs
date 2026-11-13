import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/004_local_auth_runtime_role.sql", import.meta.url), "utf8");
const verifier = await readFile(new URL("../scripts/verify-local-runtime-role.mjs", import.meta.url), "utf8");

test("authentication runtime roles begin with login disabled and no elevated attributes", () => {
  assert.match(migration, /CREATE ROLE cornhill_auth_runtime NOLOGIN/);
  assert.match(migration, /CREATE ROLE cornhill_auth_api NOLOGIN INHERIT/);
  assert.match(migration, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
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
  assert.match(verifier, /roles must remain NOLOGIN/);
  assert.match(verifier, /rolsuper/);
  assert.match(verifier, /rolbypassrls/);
});
test("role verifier checks that sensitive management permissions are absent", () => {
  assert.match(verifier, /staff_status_update/);
  assert.match(verifier, /permission_grant_insert/);
  assert.match(verifier, /guardian_link_update/);
  assert.match(verifier, /audit_read/);
});
test("runtime config uses only the dedicated API login and loopback host", async () => {
  const config = await readFile(new URL("../src/db/runtime-config.mjs", import.meta.url), "utf8");
  assert.match(config, /LOOPBACK_HOSTS/);
  assert.match(config, /user !== "cornhill_auth_api"/);
  assert.match(config, /CORNHILL_DB_RUNTIME_PASSWORD/);
});
