import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/033_local_payroll_period_date_integrity.sql", import.meta.url), "utf8");

test("payroll period integrity migration is transactional and additive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("payroll periods cannot overlap, including concurrent inserts", () => {
  assert.match(sql, /guard_payroll_period_date_overlap/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /daterange\(existing\.starts_on, existing\.ends_on, '\[\]'\)/);
  assert.match(sql, /daterange\(NEW\.starts_on, NEW\.ends_on, '\[\]'\)/);
  assert.match(sql, /payroll_period_no_date_overlap/);
});

test("payroll period guard excludes only the row being updated", () => {
  assert.match(sql, /existing\.id IS DISTINCT FROM NEW\.id/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF starts_on, ends_on/);
});

test("payroll period guard is not executable by PUBLIC", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_payroll_period_date_overlap\(\) FROM PUBLIC/);
});
