-- CORNHILL resolve terminal events through an approved device-to-staff mapping.
BEGIN;

ALTER TABLE cornhill_school.attendance_events
  ADD COLUMN device_staff_mapping_id uuid
  REFERENCES cornhill_school.attendance_device_staff_mappings(id) ON DELETE RESTRICT;

CREATE INDEX attendance_events_device_staff_mapping_idx
  ON cornhill_school.attendance_events(device_staff_mapping_id)
  WHERE device_staff_mapping_id IS NOT NULL;

CREATE FUNCTION cornhill_school.guard_attendance_event_import_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  batch_device_id uuid;
  batch_status text;
  mapped_staff_id uuid;
  mapped_mapping_id uuid;
BEGIN
  IF NEW.review_status IS DISTINCT FROM 'Pending'
     OR NEW.reviewed_by_staff_id IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'New attendance events must begin pending independent review'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.source_type = 'Device' THEN
    IF NEW.import_batch_id IS NULL OR NEW.device_id IS NULL
       OR NULLIF(btrim(NEW.device_staff_identifier), '') IS NULL THEN
      RAISE EXCEPTION 'Device attendance events require a batch, device and staff identifier'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT b.device_id, b.import_status
      INTO batch_device_id, batch_status
    FROM cornhill_school.attendance_import_batches b
    WHERE b.id = NEW.import_batch_id
    FOR KEY SHARE;

    IF batch_device_id IS DISTINCT FROM NEW.device_id
       OR batch_status IS DISTINCT FROM 'Processing' THEN
      RAISE EXCEPTION 'Device events must belong to the matching device batch while it is processing'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT m.id, m.staff_account_id
      INTO mapped_mapping_id, mapped_staff_id
    FROM cornhill_school.attendance_device_staff_mappings m
    WHERE m.device_id = NEW.device_id
      AND m.device_staff_identifier = NEW.device_staff_identifier
      AND m.is_active
      AND m.effective_from <= (NEW.occurred_at AT TIME ZONE 'Africa/Kampala')::date
      AND (m.effective_to IS NULL OR m.effective_to >= (NEW.occurred_at AT TIME ZONE 'Africa/Kampala')::date)
    ORDER BY m.effective_from DESC
    LIMIT 1
    FOR KEY SHARE OF m;

    IF mapped_mapping_id IS NULL THEN
      RAISE EXCEPTION 'Device staff identifier has no active mapping for the attendance event date'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.staff_account_id IS NOT NULL AND NEW.staff_account_id IS DISTINCT FROM mapped_staff_id THEN
      RAISE EXCEPTION 'Device attendance event staff account does not match its registered device mapping'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.device_staff_mapping_id IS NOT NULL
       AND NEW.device_staff_mapping_id IS DISTINCT FROM mapped_mapping_id THEN
      RAISE EXCEPTION 'Device attendance event mapping does not match its device identifier'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.staff_account_id := mapped_staff_id;
    NEW.device_staff_mapping_id := mapped_mapping_id;
  ELSIF NEW.device_staff_mapping_id IS NOT NULL THEN
    RAISE EXCEPTION 'Manual attendance events cannot claim a fingerprint device mapping'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_event_import_identity_guard
BEFORE INSERT ON cornhill_school.attendance_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_event_import_identity();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_event_import_identity() FROM PUBLIC;
COMMIT;
