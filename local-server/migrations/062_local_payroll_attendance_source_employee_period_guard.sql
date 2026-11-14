-- CORNHILL restrict attendance deductions to the employee and period owning the correction.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.validate_payroll_line_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  linked_adjustment_status text;
  linked_staff_account_id uuid;
  linked_work_date date;
  run_status text;
  payroll_staff_account_id uuid;
  payroll_starts_on date;
  payroll_ends_on date;
  approver_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.source_attendance_adjustment_id IS DISTINCT FROM OLD.source_attendance_adjustment_id THEN
    RAISE EXCEPTION 'Payroll attendance adjustment provenance cannot be replaced'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.account_status INTO approver_status
  FROM cornhill_auth.staff_accounts a WHERE a.id = NEW.approved_by_staff_id;
  IF approver_status IS DISTINCT FROM 'active'
     OR NEW.approved_by_staff_id = NEW.created_by_staff_id THEN
    RAISE EXCEPTION 'Payroll line items require an active independent approver'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.source_attendance_adjustment_id IS NOT NULL THEN
    SELECT ad.staff_account_id, ad.work_date, aa.adjustment_status
      INTO linked_staff_account_id, linked_work_date, linked_adjustment_status
    FROM cornhill_school.attendance_adjustments aa
    JOIN cornhill_school.attendance_days ad ON ad.id = aa.attendance_day_id
    WHERE aa.id = NEW.source_attendance_adjustment_id
    FOR UPDATE OF ad, aa;

    IF linked_adjustment_status IS DISTINCT FROM 'Approved'
       OR linked_staff_account_id IS NULL THEN
      RAISE EXCEPTION 'Attendance-related payroll adjustments require separate approval'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT pr.run_status, pl.staff_account_id, pp.starts_on, pp.ends_on
    INTO run_status, payroll_staff_account_id, payroll_starts_on, payroll_ends_on
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id = pl.payroll_run_id
  JOIN cornhill_school.payroll_periods pp ON pp.id = pr.payroll_period_id
  WHERE pl.id = NEW.payroll_line_id
  FOR UPDATE OF pr;

  IF run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll items can only be added to a draft payroll run'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.source_attendance_adjustment_id IS NOT NULL THEN
    IF linked_staff_account_id IS DISTINCT FROM payroll_staff_account_id THEN
      RAISE EXCEPTION 'Attendance payroll adjustment must belong to the same staff member as the payroll line'
        USING ERRCODE = 'check_violation';
    END IF;
    IF linked_work_date < payroll_starts_on OR linked_work_date > payroll_ends_on THEN
      RAISE EXCEPTION 'Attendance payroll adjustment date must fall within the payroll period'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.validate_payroll_line_item() FROM PUBLIC;
COMMIT;
