import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMigrationLedgerRow,
  migrationChecksum,
  prepareTransactionalMigration
} from "../src/db/migrations.mjs";

const validSql = "BEGIN;\nCREATE TABLE example (id integer);\nCOMMIT;";

test("migration checksum is stable and SHA-256 sized", () => {
  const checksum = migrationChecksum(validSql);
  assert.match(checksum, /^[0-9a-f]{64}$/);
  assert.equal(migrationChecksum(validSql), checksum);
  assert.notEqual(migrationChecksum(validSql + " "), checksum);
});

test("migration runner removes only the required outer transaction wrappers", () => {
  const body = prepareTransactionalMigration(validSql);
  assert.match(body, /^CREATE TABLE example/);
  assert.doesNotMatch(body, /^BEGIN;/);
  assert.doesNotMatch(body, /COMMIT;$/);
});

test("migration runner rejects empty or malformed migration files", () => {
  assert.throws(() => prepareTransactionalMigration(""), /non-empty/);
  assert.throws(() => prepareTransactionalMigration("CREATE TABLE x(id int);"), /BEGIN\/COMMIT/);
  assert.throws(() => prepareTransactionalMigration("BEGIN; SELECT 1;"), /BEGIN\/COMMIT/);
});

test("migration runner rejects destructive database operations", () => {
  assert.throws(() => prepareTransactionalMigration("BEGIN; DROP DATABASE school; COMMIT;"), /Destructive SQL/);
  assert.throws(() => prepareTransactionalMigration("BEGIN; TRUNCATE TABLE learners; COMMIT;"), /Destructive SQL/);
});

test("migration ledger requires exact name and checksum", () => {
  const checksum = migrationChecksum(validSql);
  assert.equal(assertMigrationLedgerRow({ migration_name: "001", checksum }, checksum, "001"), true);
  assert.throws(() => assertMigrationLedgerRow({ migration_name: "001", checksum: "bad" }, checksum, "001"), /ledger mismatch/);
  assert.throws(() => assertMigrationLedgerRow({ migration_name: "other", checksum }, checksum, "001"), /ledger mismatch/);
});
