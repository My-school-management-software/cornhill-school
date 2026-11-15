-- CORNHILL protect imported attendance evidence and one-time review decisions.
-- Raw clock events are evidence: corrections must be separate audited records.
BEGIN;

CREATE FUNCTION cornhill_school.guard_attendance_event_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  reviewer_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attendance event evidence cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  IF ROW(
    NEW.id,
    NEW.import_batch_id,
    NEW.device_id,
    NEW.staff_account_id,
    NEW.device_staff_identifier,
    NEW.external_event_id,
    NEW.event_type,
    NEW.occurred_at,
    NEW.source_type,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.import_batch_id,
    OLD.device_id,
    OLD.staff_account_id,
    OLD.device_staff_identifier,
    OLD.external_event_id,
    OLD.event_type,
    OLD.occurred_at,
    OLD.source_type,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Imported attendance event evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.review_status <> 'Pending' THEN
    RAISE EXCEPTION 'Attendance event review decisions are final'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.review_status NOT IN ('Verified', 'Rejected') THEN
    RAISE EXCEPTION 'A pending attendance event must receive one final review decision'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.reviewed_by_staff_id IS NULL OR NEW.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Attendance event reviewer must be supplied and review time is database-assigned'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.reviewed_by_staff_id = NEW.staff_account_id THEN
    RAISE EXCEPTION 'Staff cannot review their own attendance event'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.account_status INTO reviewer_status
  FROM cornhill_auth.staff_accounts a
  WHERE a.id = NEW.reviewed_by_staff_id;

  IF reviewer_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Attendance event reviewer must be an active staff account'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.reviewed_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_event_review_guard
BEFORE UPDATE OR DELETE ON cornhill_school.attendance_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_event_review();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_event_review() FROM PUBLIC;

COMMIT;
