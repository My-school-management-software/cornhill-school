-- CORNHILL read-only attendance governance and salary evidence for Staff Operations.
-- Keep the runtime role read-only on policy, schedules, incidents, salary agreements and payroll items.
BEGIN;
GRANT SELECT (
  review_window_minutes, sunday_paid_rest_day, saturday_start_time, saturday_end_time,
  prep_enabled, prep_deduction_ugx, updated_at
) ON cornhill_school.staff_attendance_policy_settings TO cornhill_auth_runtime;
GRANT SELECT (attendance_date, exception_type, is_working_day, note)
ON cornhill_school.staff_attendance_calendar_exceptions TO cornhill_auth_runtime;
GRANT SELECT (id, schedule_code, schedule_name, start_time, end_time, saturday_start_time,
  saturday_end_time, grace_minutes, weekdays, is_active)
ON cornhill_school.staff_work_schedules TO cornhill_auth_runtime;
GRANT SELECT (staff_account_id, schedule_id, starts_on, ends_on, saturday_required)
ON cornhill_school.staff_attendance_schedule_assignments TO cornhill_auth_runtime;
GRANT SELECT (id, attendance_day_id, staff_account_id, attendance_date, incident_type, status,
  detected_at, review_deadline_at, headteacher_statement, director_decision,
  approved_deduction_ugx, review_note)
ON cornhill_school.staff_attendance_incidents TO cornhill_auth_runtime;
GRANT SELECT (id, prep_date, title, start_time, end_time, class_name, approval_status, is_published)
ON cornhill_school.staff_prep_sessions TO cornhill_auth_runtime;
GRANT SELECT (prep_session_id, staff_account_id, assigned_at)
ON cornhill_school.staff_prep_assignments TO cornhill_auth_runtime;
GRANT SELECT (session_id, staff_account_id, clock_in_at, clock_out_at)
ON cornhill_school.staff_scheduled_session_attendance TO cornhill_auth_runtime;
GRANT SELECT (staff_account_id, salary_basis, base_salary_ugx, daily_rate_ugx,
  effective_from, effective_to, is_active, created_at)
ON cornhill_school.staff_salary_agreements TO cornhill_auth_runtime;
GRANT SELECT (id, payroll_line_id, item_type, item_code, description, amount_ugx,
  source_attendance_adjustment_id, approved_at, created_at)
ON cornhill_school.payroll_line_items TO cornhill_auth_runtime;
COMMIT;
