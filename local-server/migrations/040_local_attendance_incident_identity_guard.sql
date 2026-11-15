-- CORNHILL preserve the identity and audit history of staff attendance incidents.
-- Forward-only additive migration. Corrections require a separately audited workflow.
BEGIN;

CREATE FUNCTION cornhill_school.guard_attendance_incident_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Attendance incidents cannot be deleted; use a separately audited correction workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.attendance_day_id IS DISTINCT FROM OLD.attendance_day_id
     OR NEW.staff_account_id IS DISTINCT FROM OLD.staff_account_id
     OR NEW.attendance_date IS DISTINCT FROM OLD.attendance_date
     OR NEW.incident_type IS DISTINCT FROM OLD.incident_type
     OR NEW.detected_at IS DISTINCT FROM OLD.detected_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Attendance incident identity and detection evidence are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_incident_identity_guard
BEFORE UPDATE OR DELETE ON cornhill_school.staff_attendance_incidents
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_incident_identity();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_incident_identity() FROM PUBLIC;

COMMIT;
