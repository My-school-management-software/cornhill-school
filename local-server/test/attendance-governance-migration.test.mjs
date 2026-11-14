import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/009_local_attendance_salary_governance.sql", import.meta.url), "utf8");

test("attendance governance migration is transactional, additive and private", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC/);
});

test("salary agreements preserve dated UGX rates without assuming deductions", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.staff_salary_agreements/);
  assert.match(sql, /daily_rate_ugx bigint/);
  assert.match(sql, /effective_from date NOT NULL/);
  assert.doesNotMatch(sql, /UPDATE cornhill_school\.payroll_lines|INSERT INTO cornhill_school\.payroll_line_items/i);
});

test("attendance policy supports Kampala schedule rules, Saturdays and calendar exceptions", () => {
  assert.match(sql, /review_window_minutes integer NOT NULL DEFAULT 120/);
  assert.match(sql, /saturday_required boolean NOT NULL DEFAULT false/);
  assert.match(sql, /staff_attendance_calendar_exceptions/);
  assert.match(sql, /Africa\/Kampala|saturday_start_time/);
});

test("incident deductions require a completed review window and leadership statement", () => {
  assert.match(sql, /review_deadline_at/);
  assert.match(sql, /now\(\) < NEW\.review_deadline_at/);
  assert.match(sql, /Headteacher or DOS statement is required/);
  assert.match(sql, /Approved attendance deduction exceeds the configured daily rate/);
  assert.match(sql, /attendance_incident_decision_guard/);
});

test("special sessions require Director approval metadata and auditable attendance events", () => {
  assert.match(sql, /approval_status IN \('Draft','Approved','Cancelled'\)/);
  assert.match(sql, /director_approved_by/);
  assert.match(sql, /staff_prep_assignments/);
  assert.match(sql, /staff_scheduled_session_attendance/);
  assert.match(sql, /UNIQUE\(session_id,staff_account_id\)/);
});

test("attendance policy and incident permissions are catalogued but not granted automatically", () => {
  for (const permission of ["staff.attendance_policy_manage","staff.attendance_incident_decide","staff.prep_session_manage"]) {
    assert.ok(sql.includes("'" + permission + "'"));
  }
  assert.doesNotMatch(sql, /INSERT INTO cornhill_auth\.staff_role_permissions/);
});
