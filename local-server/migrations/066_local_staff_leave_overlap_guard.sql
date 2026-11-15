-- CORNHILL prevent concurrent overlapping submitted or approved leave requests.
BEGIN;
CREATE FUNCTION cornhill_school.guard_staff_leave_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF NEW.status IN ('Submitted','Approved') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('cornhill-staff-leave:' || NEW.staff_account_id::text,0));
    IF EXISTS (
      SELECT 1 FROM cornhill_school.staff_leave_requests existing
      WHERE existing.staff_account_id = NEW.staff_account_id
        AND existing.id IS DISTINCT FROM NEW.id
        AND existing.status IN ('Submitted','Approved')
        AND daterange(existing.starts_on,existing.ends_on,'[]')
            && daterange(NEW.starts_on,NEW.ends_on,'[]')
    ) THEN
      RAISE EXCEPTION 'Submitted or approved leave dates cannot overlap for the same staff member'
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER staff_leave_overlap_guard
BEFORE INSERT OR UPDATE OF staff_account_id,starts_on,ends_on,status
ON cornhill_school.staff_leave_requests
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_leave_overlap();
REVOKE ALL ON FUNCTION cornhill_school.guard_staff_leave_overlap() FROM PUBLIC;
COMMIT;
