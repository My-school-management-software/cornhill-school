import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/001_local_identity_foundation.sql", import.meta.url), "utf8");

test("identity migration creates a separate local auth schema and transaction", () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS cornhill_auth/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(sql, /CREATE TABLE\s+auth\.users/i);
});

test("staff and guardian credentials are stored only as Argon2id hashes", () => {
  assert.match(sql, /password_hash LIKE '\$argon2id\$%'/);
  assert.match(sql, /pin_hash LIKE '\$argon2id\$%'/);
  assert.doesNotMatch(sql, /password_plaintext|pin_plaintext|password_value|pin_value/i);
});

test("guardian access is separate and requires explicit approval metadata", () => {
  assert.match(sql, /CREATE TABLE cornhill_auth\.guardian_accounts/);
  assert.match(sql, /CREATE TABLE cornhill_auth\.guardian_learner_access/);
  assert.match(sql, /access_status IN \('pending', 'approved', 'revoked'\)/);
  assert.match(sql, /approved_by_staff_id IS NOT NULL AND approved_at IS NOT NULL/);
});

test("staff and guardian sessions cannot be mixed", () => {
  assert.match(sql, /principal_type = 'staff' AND staff_account_id IS NOT NULL AND guardian_account_id IS NULL/);
  assert.match(sql, /principal_type = 'guardian' AND guardian_account_id IS NOT NULL AND staff_account_id IS NULL/);
  assert.match(sql, /token_hash varchar\(64\) NOT NULL UNIQUE/);
});

test("sessions, login attempts and audit events have expiry or traceability controls", () => {
  assert.match(sql, /expires_at > created_at/);
  assert.match(sql, /login_attempts_rate_limit_idx/);
  assert.match(sql, /correlation_id uuid NOT NULL/);
  assert.match(sql, /outcome IN \('success', 'denied', 'failure'\)/);
});

test("migration does not grant browser or public database access", () => {
  assert.match(sql, /REVOKE ALL ON SCHEMA cornhill_auth FROM PUBLIC/);
  assert.match(sql, /No application role grants are made here/);
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated|PUBLIC)/i);
});

test("learner foreign key is deliberately deferred until UUID mapping is verified", () => {
  assert.match(sql, /learner_id uuid NOT NULL/);
  assert.match(sql, /Add the FK only after the local learner table/);
});
