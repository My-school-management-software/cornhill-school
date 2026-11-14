-- CORNHILL preserve the schedule basis for attendance dates already recorded.
-- Historical schedule corrections require a separate audited correction workflow.
BEGIN;

CREATE FUNCTION cornhill_school.guard_staff_schedule_assignment_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  historical_attendance_exists boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.staff_account_id, NEW.schedule_id, NEW.starts_on, NEW.ends_on, NEW.saturday_required)
       IS NOT DISTINCT FROM
       ROW(OLD.staff_account_id, OLD.schedule_id, OLD.starts_on, OLD.ends_on, OLD.saturday_required) THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('cornhill-staff-schedule-history:' || OLD.staff_account_id::text, 0)
  );

  SELECT EXISTS (
    SELECT 1
    FROM cornhill_school.attendance_days ad
    WHERE ad.staff_account_id = OLD.staff_account_id
      AND ad.work_date >= OLD.starts_on
      AND (OLD.ends_on IS NULL OR ad.work_date <= OLD.ends_on)
  ) OR (
    TG_OP = 'UPDATE' AND EXISTS (
      SELECT 1
      FROM cornhill_school.attendance_days ad
      WHERE ad.staff_account_id = NEW.staff_account_id
        AND ad.work_date >= NEW.starts_on
        AND (NEW.ends_on IS NULL OR ad.work_date <= NEW.ends_on)
    )
  ) INTO historical_attendance_exists;

  IF historical_attendance_exists THEN
    RAISE EXCEPTION 'A schedule assignment with recorded attendance history cannot be changed or deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER staff_schedule_assignment_history_guard
BEFORE UPDATE OR DELETE ON cornhill_school.staff_attendance_schedule_assignments
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_schedule_assignment_history();

REVOKE ALL ON FUNCTION cornhill_school.guard_staff_schedule_assignment_history() FROM PUBLIC;

COMMIT;
