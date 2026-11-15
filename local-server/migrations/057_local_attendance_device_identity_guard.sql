-- CORNHILL protect terminal identity once mappings or imported attendance exist.
BEGIN;

CREATE FUNCTION cornhill_school.guard_attendance_device_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  has_history boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM cornhill_school.attendance_events e WHERE e.device_id = OLD.id
    UNION ALL
    SELECT 1 FROM cornhill_school.attendance_device_staff_mappings m WHERE m.device_id = OLD.id
  ) INTO has_history;

  IF TG_OP = 'DELETE' THEN
    IF has_history THEN
      RAISE EXCEPTION 'Attendance devices with mapping or event history cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF has_history AND ROW(
    NEW.device_code, NEW.device_name, NEW.manufacturer, NEW.model,
    NEW.serial_number, NEW.connection_type, NEW.device_location
  ) IS DISTINCT FROM ROW(
    OLD.device_code, OLD.device_name, OLD.manufacturer, OLD.model,
    OLD.serial_number, OLD.connection_type, OLD.device_location
  ) THEN
    RAISE EXCEPTION 'Fingerprint terminal identity cannot be rewritten after attendance history exists'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_device_identity_guard
BEFORE UPDATE OR DELETE ON cornhill_school.attendance_devices
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_device_identity();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_device_identity() FROM PUBLIC;
COMMIT;
