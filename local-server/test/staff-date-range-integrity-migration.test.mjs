import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/032_local_staff_date_range_integrity.sql", import.meta.url), "utf8");

test("staff date-range integrity migration is transactional and additive", () => {
  assert.match(sql, /^--[\\s\\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("active salary agreements cannot overlap for the same staff member", () => {
  assert.match(sql, /guard_salary_agreement_date_overlap/);
  assert.match(sql, /existing\\.is_active/);
  assert.match(sql, /daterange\\(existing\\.effective_from, existing\\.effective_to, '\\[\\]'\\)/);
  assert.match(sql, /daterange\\(NEW\\.effective_from, NEW\\.effective_to, '\\[\\]'\\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /staff_salary_agreement_no_overlap/);
});

test("schedule assignments cannot overlap for the same staff member", () => {
  assert.match(sql, /guard_staff_schedule_date_overlap/);
  assert.match(sql, /daterange\\(existing\\.starts_on, existing\\.ends_on, '\\[\\]'\\)/);
  assert.match(sql, /daterange\\(NEW\\.starts_on, NEW\\.ends_on, '\\[\\]'\\)/);
  assert.match(sql, /staff_schedule_assignment_no_overlap/);
});

test("date-range guards prevent reassignment across staff identities", () => {
  assert.equal((sql.match(/NEW\\.staff_account_id IS DISTINCT FROM OLD\\.staff_account_id/g) || []).length, 2);
});

test("new trigger functions are not executable by PUBLIC", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\\.guard_salary_agreement_date_overlap\\(\\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\\.guard_staff_schedule_date_overlap\\(\\) FROM PUBLIC/);
});

test("integrity guards do not create automatic salary deductions", () => {
  assert.doesNotMatch(sql, /payroll_line_items|approved_deduction_ugx|UPDATE cornhill_school\\.payroll_lines/i);
});
