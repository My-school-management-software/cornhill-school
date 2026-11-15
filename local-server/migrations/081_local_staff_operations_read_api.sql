-- CORNHILL local Staff Operations read models and self-service leave submission.
-- This grants only narrow column reads and leave-request insert/status-update privileges.
-- No roles receive permissions automatically; role grants remain Director-controlled.
BEGIN;

GRANT SELECT ON
  cornhill_school.attendance_monthly_summary,
  cornhill_school.attendance_day_review_queue,
  cornhill_school.staff_leave_review_queue,
  cornhill_school.staff_leave_balance_summary,
  cornhill_school.payroll_disbursement_summary
TO cornhill_auth_runtime;

GRANT SELECT (
  id, staff_account_id, leave_type, starts_on, ends_on, requested_days,
  reason, status, requested_by_staff_id, submitted_at,
  reviewed_by_staff_id, reviewed_at, review_note, created_at, updated_at
)
ON cornhill_school.staff_leave_requests TO cornhill_auth_runtime;

GRANT INSERT (
  staff_account_id, leave_type, starts_on, ends_on, requested_days,
  reason, requested_by_staff_id, created_by_staff_id
)
ON cornhill_school.staff_leave_requests TO cornhill_auth_runtime;

GRANT UPDATE (status)
ON cornhill_school.staff_leave_requests TO cornhill_auth_runtime;

GRANT SELECT (
  staff_account_id, leave_type, entry_type, days_delta, effective_on, reason
)
ON cornhill_school.staff_leave_balance_entries TO cornhill_auth_runtime;

GRANT SELECT (
  id, period_code, starts_on, ends_on, payment_date, period_status
)
ON cornhill_school.payroll_periods TO cornhill_auth_runtime;

GRANT SELECT (
  id, payroll_period_id, run_status, prepared_by_staff_id, reviewed_by_staff_id,
  approved_by_staff_id, posted_by_staff_id, status_reason,
  prepared_at, reviewed_at, approved_at, posted_at, reversed_at
)
ON cornhill_school.payroll_runs TO cornhill_auth_runtime;

GRANT SELECT (
  id, payroll_run_id, staff_account_id, base_salary_ugx, allowances_ugx,
  deductions_ugx, gross_pay_ugx, net_pay_ugx, currency
)
ON cornhill_school.payroll_lines TO cornhill_auth_runtime;

GRANT SELECT (
  id, payroll_line_id, amount_ugx, payment_method, external_reference,
  paid_at, recorded_by_staff_id, disbursement_status,
  verified_by_staff_id, verified_at, verification_note
)
ON cornhill_school.payroll_disbursements TO cornhill_auth_runtime;

COMMIT;
