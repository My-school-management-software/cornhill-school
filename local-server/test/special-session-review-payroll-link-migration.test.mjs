import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/035_local_special_session_review_payroll_link.sql", import.meta.url), "utf8");

test("special-session review migration is transactional and additive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("special-session deductions are disabled by default and separate from ordinary attendance", () => {
  assert.match(sql, /prep_deductions_enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /staff_scheduled_session_attendance/);
  assert.doesNotMatch(sql, /staff_attendance_incidents/);
});

test("special-session review is fixed to 120 minutes and cannot be shortened", () => {
  assert.match(sql, /now\(\) \+ interval '120 minutes'/);
  assert.match(sql, /NEW\.review_deadline_at := now\(\) \+ interval '120 minutes'/);
  assert.match(sql, /The special-session review deadline is fixed at 120 minutes/);
  assert.match(sql, /now\(\) < OLD\.review_deadline_at/);
});

test("deduction requires Headteacher or DOS statement and effective daily salary rate", () => {
  assert.match(sql, /Headteacher or DOS statement is required/);
  assert.match(sql, /a\.daily_rate_ugx/);
  assert.match(sql, /NEW\.approved_deduction_ugx > daily_rate/);
  assert.match(sql, /Special-session salary deductions are disabled by school policy/);
});

test("excused session creates no deduction or payroll link", () => {
  assert.match(sql, /NEW\.director_decision = 'excused'/);
  assert.match(sql, /NEW\.approved_deduction_ugx <> 0 OR NEW\.payroll_line_item_id IS NOT NULL/);
});

test("payroll link must be a deduction for the same staff member", () => {
  assert.match(sql, /linked_item_type IS DISTINCT FROM 'Deduction'/);
  assert.match(sql, /linked_item_staff IS DISTINCT FROM NEW\.staff_account_id/);
});

test("decided special-session attendance cannot be overwritten", () => {
  assert.match(sql, /OLD\.director_decision IS NOT NULL/);
  assert.match(sql, /audited correction workflow/);
});
