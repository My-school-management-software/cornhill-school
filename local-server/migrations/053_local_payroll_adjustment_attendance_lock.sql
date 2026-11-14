-- CORNHILL serialize attendance corrections against payroll adjustment linkage.
-- Preserve the adjustment provenance once a payroll item has been created.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.validate_payroll_line_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  linked_adjustment_status text;
  run_status text;
  linked_attendance_day_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.source_attendance_adjustment_id IS DISTINCT FROM OLD.source_attendance_adjustment_id THEN
    RAISE EXCEPTION 'Payroll attendance adjustment provenance cannot be replaced'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Use the same attendance-day -> payroll-run lock order as the attendance
  -- basis guard. This closes the race where a correction is edited while a
  -- payroll item is being linked to it.
  IF NEW.source_attendance_adjustment_id IS NOT NULL THEN
    SELECT ad.id INTO linked_attendance_day_id
    FROM cornhill_school.attendance_adjustments aa
    JOIN cornhill_school.attendance_days ad ON ad.id = aa.attendance_day_id
    WHERE aa.id = NEW.source_attendance_adjustment_id
    FOR UPDATE OF ad;

    SELECT aa.adjustment_status INTO linked_adjustment_status
    FROM cornhill_school.attendance_adjustments aa
    WHERE aa.id = NEW.source_attendance_adjustment_id;

    IF linked_adjustment_status IS DISTINCT FROM 'Approved'
       OR linked_attendance_day_id IS NULL THEN
      RAISE EXCEPTION 'Attendance-related payroll adjustments require separate approval'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT pr.run_status INTO run_status
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id = pl.payroll_run_id
  WHERE pl.id = NEW.payroll_line_id
  FOR UPDATE OF pr;

  IF run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll items can only be added to a draft payroll run'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.validate_payroll_line_item() FROM PUBLIC;

COMMIT;
