import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/008_local_staff_attendance_payroll_foundation.sql", import.meta.url), "utf8");

test("staff and payroll migration is transactional and stores no biometric templates", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.doesNotMatch(sql, /fingerprint_template|biometric_template|face_template|biometric_data/i);
});

test("staff profiles and employment terms preserve role-linked identity and UGX salary terms", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.staff_profiles/);
  assert.match(sql, /staff_account_id uuid NOT NULL UNIQUE REFERENCES cornhill_auth\.staff_accounts/);
  assert.match(sql, /CREATE TABLE cornhill_school\.staff_employment_terms/);
  assert.match(sql, /salary_basis IN \('Monthly', 'Daily', 'Hourly', 'Fixed'\)/);
  assert.match(sql, /base_salary_ugx bigint NOT NULL CHECK \(base_salary_ugx >= 0\)/);
});

test("attendance device import records support USB and LAN without biometric data", () => {
  assert.match(sql, /connection_type IN \('USB', 'LAN', 'Manual Import'\)/);
  assert.match(sql, /CREATE TABLE cornhill_school\.attendance_import_batches/);
  assert.match(sql, /source_checksum_sha256 varchar\(64\) NOT NULL/);
  assert.match(sql, /CREATE TABLE cornhill_school\.attendance_events/);
  assert.match(sql, /external_event_id/);
  assert.match(sql, /UNIQUE \(device_id, source_checksum_sha256\)/);
});

test("attendance events and daily summaries are auditable and separately verified", () => {
  assert.match(sql, /review_status IN \('Pending', 'Verified', 'Rejected'\)/);
  assert.match(sql, /CREATE TABLE cornhill_school\.attendance_days/);
  assert.match(sql, /CREATE TABLE cornhill_school\.attendance_adjustments/);
  assert.match(sql, /adjustment_status IN \('Pending', 'Approved', 'Rejected'\)/);
  assert.match(sql, /attendance_adjustment_two_person/);
});

test("payroll requires staged review approval posting and reversal", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.payroll_runs/);
  assert.match(sql, /run_status IN \('Draft', 'Reviewed', 'Approved', 'Posted', 'Reversed'\)/);
  assert.match(sql, /validate_payroll_run_transition/);
  assert.match(sql, /Payroll approval must be performed by someone other than the preparer/);
  assert.match(sql, /Invalid payroll status transition/);
});

test("payroll lines calculate gross and net and require matching approved line items", () => {
  assert.match(sql, /gross_pay_ugx bigint GENERATED ALWAYS AS \(base_salary_ugx \+ allowances_ugx\) STORED/);
  assert.match(sql, /net_pay_ugx bigint GENERATED ALWAYS AS \(base_salary_ugx \+ allowances_ugx - deductions_ugx\) STORED/);
  assert.match(sql, /assert_payroll_line_item_totals/);
  assert.match(sql, /Payroll line totals must match their approved allowance and deduction items/);
  assert.match(sql, /source_attendance_adjustment_id/);
  assert.match(sql, /Attendance-related payroll adjustments require separate approval/);
});

test("payroll lines and adjustments cannot be edited after review or without two-person approval", () => {
  assert.match(sql, /payroll_line_draft_only/);
  assert.match(sql, /payroll_item_draft_only_delete/);
  assert.match(sql, /payroll_item_approval_separation CHECK \(approved_by_staff_id <> created_by_staff_id\)/);
  assert.match(sql, /attendance_adjustment_two_person/);
});

test("attendance data is not automatically converted into salary deductions", () => {
  assert.doesNotMatch(sql, /CREATE TRIGGER[^;]*(attendance_days|attendance_events)[^;]*payroll/i);
  assert.doesNotMatch(sql, /UPDATE cornhill_school\.payroll_lines[\s\S]*attendance_days/i);
});

test("staff permissions are catalogued without automatic role grants", () => {
  for (const permission of [
    "staff.profile_manage", "staff.attendance_import",
    "staff.attendance_adjust", "staff.payroll_approve"
  ]) assert.ok(sql.includes("'" + permission + "'"));
  assert.doesNotMatch(sql, /INSERT INTO cornhill_auth\.staff_role_permissions/);
});

test("PUBLIC receives no direct staff or payroll schema grants", () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated|PUBLIC)/i);
});
