-- CORNHILL preserve attendance correction requests and review decisions.
-- Requests are immutable once submitted; decisions cannot be rewritten or erased.
BEGIN;

CREATE FUNCTION cornhill_school.guard_attendance_adjustment_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  reviewer_is_active boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attendance adjustment requests cannot be deleted; retain the review history'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.adjustment_status <> 'Pending'
       OR NEW.approved_by_staff_id IS NOT NULL
       OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance adjustment requests must begin pending and undecided'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.attendance_day_id IS DISTINCT FROM OLD.attendance_day_id
     OR NEW.adjustment_type IS DISTINCT FROM OLD.adjustment_type
     OR NEW.proposed_value IS DISTINCT FROM OLD.proposed_value
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.requested_by_staff_id IS DISTINCT FROM OLD.requested_by_staff_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Submitted attendance adjustment details are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.adjustment_status <> 'Pending' THEN
    RAISE EXCEPTION 'An attendance adjustment decision is final and cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.adjustment_status NOT IN ('Approved','Rejected')
     OR NEW.approved_by_staff_id IS NULL
     OR NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'A pending attendance adjustment must receive a complete approval or rejection decision'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.account_status = 'active'
    INTO reviewer_is_active
  FROM cornhill_auth.staff_accounts a
  WHERE a.id = NEW.approved_by_staff_id;
  IF reviewer_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Attendance adjustments must be reviewed by an active staff account'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.approved_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_adjustment_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.attendance_adjustments
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_adjustment_history();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_adjustment_history() FROM PUBLIC;

COMMIT;
