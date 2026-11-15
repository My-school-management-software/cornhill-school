-- CORNHILL enforce controlled leave request transitions and independent review.
BEGIN;
CREATE FUNCTION cornhill_school.guard_staff_leave_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE reviewer_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'Draft' OR NEW.submitted_at IS NOT NULL
       OR NEW.reviewed_by_staff_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Staff leave requests must begin as unsubmitted drafts'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF ROW(NEW.id,NEW.staff_account_id,NEW.requested_by_staff_id,NEW.created_by_staff_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.staff_account_id,OLD.requested_by_staff_id,OLD.created_by_staff_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Staff leave request identity and authorship cannot be reassigned'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status <> 'Draft' AND ROW(NEW.leave_type,NEW.starts_on,NEW.ends_on,NEW.requested_days,NEW.reason)
     IS DISTINCT FROM ROW(OLD.leave_type,OLD.starts_on,OLD.ends_on,OLD.requested_days,OLD.reason) THEN
    RAISE EXCEPTION 'Submitted leave request details are immutable; submit a new request for corrections'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'Draft' AND NEW.status IN ('Submitted','Cancelled'))
      OR (OLD.status = 'Submitted' AND NEW.status IN ('Approved','Rejected','Cancelled'))) THEN
      RAISE EXCEPTION 'Staff leave request status transition is invalid'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'Submitted' THEN
      IF NEW.submitted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Leave submission time is assigned by the database'
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.submitted_at := now();
    ELSIF NEW.status IN ('Approved','Rejected') THEN
      IF NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by_staff_id IS NULL
         OR NEW.reviewed_by_staff_id = NEW.staff_account_id
         OR NEW.reviewed_by_staff_id = NEW.requested_by_staff_id THEN
        RAISE EXCEPTION 'Leave review requires a different independent reviewer'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT account_status INTO reviewer_status
      FROM cornhill_auth.staff_accounts WHERE id = NEW.reviewed_by_staff_id;
      IF reviewer_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Leave review requires an active staff reviewer'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'Rejected' AND length(trim(COALESCE(NEW.review_note,''))) < 5 THEN
        RAISE EXCEPTION 'Rejected leave requests require a review reason'
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.reviewed_at := now();
    END IF;
  ELSIF OLD.status <> 'Draft' AND
      ROW(NEW.submitted_at,NEW.reviewed_by_staff_id,NEW.reviewed_at,NEW.review_note)
      IS DISTINCT FROM ROW(OLD.submitted_at,OLD.reviewed_by_staff_id,OLD.reviewed_at,OLD.review_note) THEN
    RAISE EXCEPTION 'Leave review evidence can only be written during its status transition'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER staff_leave_request_transition_guard
BEFORE INSERT OR UPDATE ON cornhill_school.staff_leave_requests
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_leave_request_transition();
REVOKE ALL ON FUNCTION cornhill_school.guard_staff_leave_request_transition() FROM PUBLIC;
COMMIT;
