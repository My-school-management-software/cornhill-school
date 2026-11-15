-- CORNHILL staff leadership workspace permissions and minimum scoped read/write grants.
-- This migration does not grant permissions to any role. A school administrator must approve each role grant.
BEGIN;

INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('staff.attendance_statement_submit','staff','Submit a Headteacher or Director of Studies statement for an attendance incident.',true)
ON CONFLICT(permission_code) DO NOTHING;

GRANT USAGE ON SCHEMA cornhill_school TO cornhill_auth_runtime;

GRANT SELECT (staff_account_id, staff_number, legal_name, preferred_name, job_title, department, employment_status, hired_on)
  ON cornhill_school.staff_profiles TO cornhill_auth_runtime;

GRANT SELECT (staff_account_id, work_date, first_clock_in, last_clock_out, expected_minutes,
  worked_minutes, attendance_status, calculation_source, verified_by_staff_id, verified_at, notes)
  ON cornhill_school.attendance_days TO cornhill_auth_runtime;

GRANT SELECT (id, attendance_day_id, staff_account_id, attendance_date, incident_type, status,
  detected_at, review_deadline_at, headteacher_statement, headteacher_statement_by,
  headteacher_statement_at, director_decision, director_decision_by, director_decision_at,
  approved_deduction_ugx, review_note, created_at)
  ON cornhill_school.staff_attendance_incidents TO cornhill_auth_runtime;

GRANT UPDATE (headteacher_statement, headteacher_statement_by, headteacher_statement_at)
  ON cornhill_school.staff_attendance_incidents TO cornhill_auth_runtime;

GRANT UPDATE (director_decision, director_decision_by, director_decision_at,
  status, approved_deduction_ugx, review_note)
  ON cornhill_school.staff_attendance_incidents TO cornhill_auth_runtime;

GRANT SELECT (id, prep_date, title, start_time, end_time, class_name, notes,
  approval_status, is_published, director_approved_by, director_approved_at, created_at)
  ON cornhill_school.staff_prep_sessions TO cornhill_auth_runtime;

COMMIT;
