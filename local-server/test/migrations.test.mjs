import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertMigrationLedgerRow,
  migrationChecksum,
  prepareTransactionalMigration,
  sortMigrationFiles
} from "../src/db/migrations.mjs";

const validSql = "BEGIN;\nCREATE TABLE example (id integer);\nCOMMIT;";

test("migration filenames are sorted in version order", () => {
  assert.deepEqual(
    sortMigrationFiles(["002_local_authorization_foundation.sql", "001_local_identity_foundation.sql", "README.md"]),
    ["001_local_identity_foundation.sql", "002_local_authorization_foundation.sql"]
  );
});
test("migration filename validator rejects invalid SQL names", () => {
  assert.throws(() => sortMigrationFiles(["new_migration.sql"]), /numeric-prefix/);
});
test("migration filename validator rejects duplicate version prefixes", () => {
  assert.throws(() => sortMigrationFiles(["001_identity.sql", "001_permissions.sql"]), /prefixes must be unique/);
});
test("migration directory list must be an array", () => {
  assert.throws(() => sortMigrationFiles("001_identity.sql"), /must be an array/);
});
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
test("migration runner accepts leading line and block comments", () => {
  const sql = "-- local migration header\n/* second header */\nBEGIN;\nSELECT 1;\nCOMMIT;";
  assert.equal(prepareTransactionalMigration(sql), "SELECT 1;");
});
test("migration runner accepts UTF-8 BOM and CRLF comment headers", () => {
  const sql = "\uFEFF-- migration header\r\n-- second line\r\nBEGIN;\r\nSELECT 1;\r\nCOMMIT;";
  assert.equal(prepareTransactionalMigration(sql), "SELECT 1;");
});
test("migration runner rejects unterminated leading block comments", () => {
  assert.throws(() => prepareTransactionalMigration("/* missing close\nBEGIN; SELECT 1; COMMIT;"), /BEGIN\/COMMIT/);
});
test("all four committed SQL migrations have a valid outer transaction", async () => {
  const dir = new URL("../migrations/", import.meta.url);
  const entries = await readdir(dir);
  const files = sortMigrationFiles(entries);
  assert.deepEqual(files, [
    "001_local_identity_foundation.sql",
    "002_local_authorization_foundation.sql",
    "003_local_auth_rate_limit_indexes.sql",
    "004_local_auth_runtime_role.sql"
  ]);
  for (const filename of files) {
    const source = await readFile(new URL(filename, dir), "utf8");
    assert.doesNotThrow(() => prepareTransactionalMigration(source), filename);
  }
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
