-- CORNHILL preserve assignment integrity for scheduled staff attendance.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.guard_special_session_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  target_session_id uuid;
  target_staff_id uuid;
  target_assigner_id uuid;
  session_status text;
  staff_status text;
  assigner_status text;
  attendance_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_session_id := OLD.prep_session_id;
    target_staff_id := OLD.staff_account_id;
  ELSE
    target_session_id := NEW.prep_session_id;
    target_staff_id := NEW.staff_account_id;
    target_assigner_id := NEW.assigned_by_staff_id;
  END IF;

  SELECT s.approval_status INTO session_status
  FROM cornhill_school.staff_prep_sessions s
  WHERE s.id = target_session_id;

  IF session_status IS NULL OR session_status = 'Cancelled' THEN
    RAISE EXCEPTION 'Staff cannot be assigned to a missing or cancelled special session'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.account_status INTO staff_status
  FROM cornhill_auth.staff_accounts a
  WHERE a.id = target_staff_id;

  IF staff_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only active staff accounts may be assigned to a special session'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT a.account_status INTO assigner_status
    FROM cornhill_auth.staff_accounts a
    WHERE a.id = target_assigner_id;

    IF assigner_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Special-session assignment must be recorded by an active staff account'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM cornhill_school.staff_scheduled_session_attendance sa
    WHERE sa.session_id = OLD.prep_session_id
      AND sa.staff_account_id = OLD.staff_account_id
  ) INTO attendance_exists;

  IF TG_OP = 'DELETE' AND attendance_exists THEN
    RAISE EXCEPTION 'A staff assignment cannot be removed after attendance has been recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.prep_session_id IS DISTINCT FROM OLD.prep_session_id
    OR NEW.staff_account_id IS DISTINCT FROM OLD.staff_account_id
  ) AND attendance_exists THEN
    RAISE EXCEPTION 'A staff assignment linked to attendance cannot be reassigned'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS special_session_assignment_guard
  ON cornhill_school.staff_prep_assignments;
CREATE TRIGGER special_session_assignment_guard
BEFORE INSERT OR UPDATE OR DELETE
ON cornhill_school.staff_prep_assignments
FOR EACH ROW
EXECUTE FUNCTION cornhill_school.guard_special_session_assignment();

REVOKE ALL ON FUNCTION cornhill_school.guard_special_session_assignment() FROM PUBLIC;

COMMIT;
