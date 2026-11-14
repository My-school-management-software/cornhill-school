-- CORNHILL require approved, published sessions and explicit staff assignment before attendance.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.guard_scheduled_session_attendance_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  session_status text;
  session_published boolean;
  assignment_exists boolean;
BEGIN
  SELECT s.approval_status, s.is_published
    INTO session_status, session_published
  FROM cornhill_school.staff_prep_sessions s
  WHERE s.id = NEW.session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Special-session attendance requires an existing scheduled session'
      USING ERRCODE = 'check_violation';
  END IF;

  IF session_status IS DISTINCT FROM 'Approved' OR session_published IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Special-session attendance is available only for Director-approved and published sessions'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM cornhill_school.staff_prep_assignments a
    WHERE a.prep_session_id = NEW.session_id
      AND a.staff_account_id = NEW.staff_account_id
  ) INTO assignment_exists;

  IF assignment_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Staff member must be explicitly assigned to the special session before attendance is recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS scheduled_session_attendance_assignment_guard
  ON cornhill_school.staff_scheduled_session_attendance;
CREATE TRIGGER scheduled_session_attendance_assignment_guard
BEFORE INSERT OR UPDATE OF session_id, staff_account_id
ON cornhill_school.staff_scheduled_session_attendance
FOR EACH ROW
EXECUTE FUNCTION cornhill_school.guard_scheduled_session_attendance_assignment();

REVOKE ALL ON FUNCTION cornhill_school.guard_scheduled_session_attendance() FROM PUBLIC;

COMMIT;
