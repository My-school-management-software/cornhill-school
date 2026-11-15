-- Narrow runtime grants for append-only attendance review and staged payroll evidence.
BEGIN;

GRANT INSERT (
  attendance_day_id, staff_account_id, attendance_date,
  review_status, review_note, reviewed_by_staff_id
)
ON cornhill_school.attendance_day_review_events TO cornhill_auth_runtime;

GRANT INSERT (
  payroll_line_id, amount_ugx, payment_method, external_reference,
  paid_at, recorded_by_staff_id
)
ON cornhill_school.payroll_disbursements TO cornhill_auth_runtime;

GRANT UPDATE (
  disbursement_status, verified_by_staff_id, verification_note
)
ON cornhill_school.payroll_disbursements TO cornhill_auth_runtime;

COMMIT;
