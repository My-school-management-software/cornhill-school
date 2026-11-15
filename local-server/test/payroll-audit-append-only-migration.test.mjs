import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/041_local_payroll_audit_append_only.sql", import.meta.url), "utf8");

test("payroll audit append-only migration is transactional and additive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /CREATE FUNCTION cornhill_school\.prevent_payroll_audit_event_mutation/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON cornhill_school\.payroll_audit_events/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.prevent_payroll_audit_event_mutation\(\) FROM PUBLIC/);
});

test("payroll audit evidence cannot be rewritten or deleted", () => {
  assert.match(sql, /Payroll audit events are append-only and cannot be changed or deleted/);
  assert.match(sql, /RAISE EXCEPTION/);
});
