-- CORNHILL preserve source checksums, processing totals and terminal import decisions.
BEGIN;

CREATE FUNCTION cornhill_school.guard_attendance_import_batch_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  event_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attendance import batches cannot be deleted; retain import provenance'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.import_status IS DISTINCT FROM 'Pending'
       OR NEW.rows_received <> 0 OR NEW.rows_accepted <> 0 OR NEW.rows_rejected <> 0
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance import batches must begin pending with zero processed rows'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.id, NEW.device_id, NEW.source_name, NEW.source_checksum_sha256,
         NEW.imported_by_staff_id, NEW.started_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.device_id, OLD.source_name, OLD.source_checksum_sha256,
         OLD.imported_by_staff_id, OLD.started_at) THEN
    RAISE EXCEPTION 'Attendance import batch identity and source checksum are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.import_status IN ('Completed', 'Failed') THEN
    RAISE EXCEPTION 'Completed or failed attendance import batches are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.rows_received < OLD.rows_received
     OR NEW.rows_accepted < OLD.rows_accepted
     OR NEW.rows_rejected < OLD.rows_rejected THEN
    RAISE EXCEPTION 'Attendance import row counters cannot move backwards'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.import_status IS DISTINCT FROM OLD.import_status
     AND NOT (
       (OLD.import_status = 'Pending' AND NEW.import_status IN ('Processing', 'Failed'))
       OR (OLD.import_status = 'Processing' AND NEW.import_status IN ('Completed', 'Failed'))
     ) THEN
    RAISE EXCEPTION 'Attendance import batch status transition is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.import_status IN ('Completed', 'Failed') THEN
    IF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance import completion time is assigned by the database'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.rows_accepted + NEW.rows_rejected <> NEW.rows_received THEN
      RAISE EXCEPTION 'Final attendance import row counts must reconcile exactly'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.import_status = 'Failed' AND NULLIF(btrim(NEW.error_summary), '') IS NULL THEN
      RAISE EXCEPTION 'Failed attendance imports require an error summary'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*)::integer INTO event_count
    FROM cornhill_school.attendance_events e
    WHERE e.import_batch_id = NEW.id;
    IF event_count <> NEW.rows_accepted THEN
      RAISE EXCEPTION 'Accepted attendance import count must match retained attendance events'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.completed_at := now();
  ELSIF NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'An in-progress attendance import cannot have a completion timestamp'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_import_batch_lifecycle_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.attendance_import_batches
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_import_batch_lifecycle();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_import_batch_lifecycle() FROM PUBLIC;
COMMIT;
