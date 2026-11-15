import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/036_local_special_session_authority_guard.sql", import.meta.url), "utf8");

test("special-session authority hardening is transactional and non-destructive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\.guard_special_session_review/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("only an active Director may record a special-session decision", () => {
  assert.match(sql, /r\.role_code = 'director'/);
  assert.match(sql, /a\.account_status = 'active'/);
  assert.match(sql, /Only an active Director may decide special-session attendance/);
});

test("Headteacher or DOS statement author must hold an active matching role", () => {
  assert.match(sql, /r\.role_code IN \('headteacher', 'director_of_studies'\)/);
  assert.match(sql, /Special-session statement must be recorded by an active Headteacher or Director of Studies/);
});

test("payroll linkage validates the exact deduction amount as well as staff and item type", () => {
  assert.match(sql, /SELECT i\.item_type, l\.staff_account_id, i\.amount_ugx/);
  assert.match(sql, /linked_item_amount IS DISTINCT FROM NEW\.approved_deduction_ugx/);
  assert.match(sql, /matching deduction item for the same staff member and exact amount/);
});

test("existing review protections remain in the replacement trigger", () => {
  assert.match(sql, /now\(\) < OLD\.review_deadline_at/);
  assert.match(sql, /prep_deductions_enabled/);
  assert.match(sql, /NEW\.approved_deduction_ugx > daily_rate/);
  assert.match(sql, /OLD\.director_decision IS NOT NULL/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_special_session_review\(\) FROM PUBLIC/);
});
