-- CORNHILL preserve attendance facts once a linked correction enters payroll review.
-- Draft payroll may still be edited; once the run advances, its attendance basis is frozen.
BEGIN;

CREATE FUNCTION cornhill_school.guard_attendance_day_payroll_basis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  payroll_has_advanced boolean;
BEGIN
  IF ROW(
       NEW.staff_account_id, NEW.work_date, NEW.first_clock_in, NEW.last_clock_out,
       NEW.expected_minutes, NEW.worked_minutes, NEW.attendance_status,
       NEW.calculation_source, NEW.verified_by_staff_id, NEW.verified_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.staff_account_id, OLD.work_date, OLD.first_clock_in, OLD.last_clock_out,
       OLD.expected_minutes, OLD.worked_minutes, OLD.attendance_status,
       OLD.calculation_source, OLD.verified_by_staff_id, OLD.verified_at
     ) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM cornhill_school.attendance_adjustments aa
    JOIN cornhill_school.payroll_line_items pli
      ON pli.source_attendance_adjustment_id = aa.id
    JOIN cornhill_school.payroll_lines pl
      ON pl.id = pli.payroll_line_id
    JOIN cornhill_school.payroll_runs pr
      ON pr.id = pl.payroll_run_id
    WHERE aa.attendance_day_id = OLD.id
      AND pr.run_status <> 'Draft'
  ) INTO payroll_has_advanced;

  IF payroll_has_advanced THEN
    RAISE EXCEPTION 'Attendance facts linked to a non-draft payroll run cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_day_payroll_basis_guard
BEFORE UPDATE ON cornhill_school.attendance_days
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_day_payroll_basis();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_day_payroll_basis() FROM PUBLIC;

COMMIT;
