-- CORNHILL prevent schedule changes from silently changing the meaning of recorded attendance.
BEGIN;

CREATE FUNCTION cornhill_school.guard_work_schedule_definition_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  has_assignments boolean;
  has_attendance boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM cornhill_school.staff_attendance_schedule_assignments sa
    WHERE sa.schedule_id = OLD.id
  ) INTO has_assignments;

  IF TG_OP = 'DELETE' THEN
    IF has_assignments THEN
      RAISE EXCEPTION 'A work schedule with assignment history cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF has_assignments AND ROW(NEW.schedule_code, NEW.schedule_name)
       IS DISTINCT FROM ROW(OLD.schedule_code, OLD.schedule_name) THEN
    RAISE EXCEPTION 'Work schedule code and name cannot change after staff assignments exist'
      USING ERRCODE = 'check_violation';
  END IF;

  IF ROW(NEW.start_time, NEW.end_time, NEW.saturday_start_time, NEW.saturday_end_time,
         NEW.grace_minutes, NEW.weekdays)
     IS DISTINCT FROM
     ROW(OLD.start_time, OLD.end_time, OLD.saturday_start_time, OLD.saturday_end_time,
         OLD.grace_minutes, OLD.weekdays) THEN
    SELECT EXISTS (
      SELECT 1
      FROM cornhill_school.staff_attendance_schedule_assignments sa
      JOIN cornhill_school.attendance_days ad
        ON ad.staff_account_id = sa.staff_account_id
       AND ad.work_date >= sa.starts_on
       AND ad.work_date <= COALESCE(sa.ends_on, 'infinity'::date)
      WHERE sa.schedule_id = OLD.id
    ) INTO has_attendance;

    IF has_attendance THEN
      RAISE EXCEPTION 'A work schedule used by recorded attendance cannot be edited; create a new schedule for future dates'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER work_schedule_definition_history_guard
BEFORE UPDATE OR DELETE ON cornhill_school.staff_work_schedules
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_work_schedule_definition_history();

REVOKE ALL ON FUNCTION cornhill_school.guard_work_schedule_definition_history() FROM PUBLIC;
COMMIT;
