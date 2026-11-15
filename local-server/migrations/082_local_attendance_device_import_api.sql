-- CORNHILL append-only row-level attendance import rejection evidence.
-- Runtime permissions are column-scoped; roles receive no default grants.
BEGIN;

CREATE TABLE cornhill_school.attendance_import_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES cornhill_school.attendance_import_batches(id) ON DELETE RESTRICT,
  source_row_number integer NOT NULL CHECK (source_row_number >= 2),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  source_row_sha256 varchar(64) NOT NULL CHECK (source_row_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, source_row_number)
);

CREATE INDEX attendance_import_rejections_batch_idx
  ON cornhill_school.attendance_import_rejections(import_batch_id, source_row_number);

CREATE FUNCTION cornhill_school.guard_attendance_import_rejection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  batch_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Attendance import rejection evidence is append-only'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT import_status INTO batch_status
  FROM cornhill_school.attendance_import_batches
  WHERE id = NEW.import_batch_id
  FOR KEY SHARE;
  IF batch_status IS DISTINCT FROM 'Processing' THEN
    RAISE EXCEPTION 'Rejected attendance rows can only be recorded while their import batch is processing'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_import_rejection_append_only
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.attendance_import_rejections
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_import_rejection();

CREATE FUNCTION cornhill_school.validate_attendance_import_rejection_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  rejection_count integer;
BEGIN
  IF NEW.import_status IN ('Completed', 'Failed') THEN
    SELECT count(*)::integer INTO rejection_count
    FROM cornhill_school.attendance_import_rejections
    WHERE import_batch_id = NEW.id;
    IF rejection_count <> NEW.rows_rejected THEN
      RAISE EXCEPTION 'Rejected attendance import row count must match retained rejection evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_import_rejection_count_guard
BEFORE UPDATE OF rows_rejected, import_status ON cornhill_school.attendance_import_batches
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_attendance_import_rejection_count();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_import_rejection() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.validate_attendance_import_rejection_count() FROM PUBLIC;
REVOKE ALL ON TABLE cornhill_school.attendance_import_rejections FROM PUBLIC;

GRANT SELECT (
  id, device_code, device_name, manufacturer, model, serial_number,
  connection_type, device_location, device_status, last_import_at, created_at
)
ON cornhill_school.attendance_devices TO cornhill_auth_runtime;

GRANT INSERT (
  device_code, device_name, manufacturer, model, serial_number,
  connection_type, device_location
)
ON cornhill_school.attendance_devices TO cornhill_auth_runtime;

GRANT UPDATE (device_status, last_import_at)
ON cornhill_school.attendance_devices TO cornhill_auth_runtime;

GRANT SELECT (
  id, device_id, device_staff_identifier, staff_account_id,
  effective_from, effective_to, is_active, created_by_staff_id, created_at
)
ON cornhill_school.attendance_device_staff_mappings TO cornhill_auth_runtime;

GRANT INSERT (
  device_id, device_staff_identifier, staff_account_id,
  effective_from, is_active, created_by_staff_id
)
ON cornhill_school.attendance_device_staff_mappings TO cornhill_auth_runtime;

GRANT UPDATE (effective_to, is_active)
ON cornhill_school.attendance_device_staff_mappings TO cornhill_auth_runtime;

GRANT SELECT (
  id, device_id, source_name, source_checksum_sha256, imported_by_staff_id,
  rows_received, rows_accepted, rows_rejected, import_status,
  started_at, completed_at, error_summary
)
ON cornhill_school.attendance_import_batches TO cornhill_auth_runtime;

GRANT INSERT (
  device_id, source_name, source_checksum_sha256, imported_by_staff_id
)
ON cornhill_school.attendance_import_batches TO cornhill_auth_runtime;

GRANT UPDATE (
  import_status, rows_received, rows_accepted, rows_rejected, error_summary
)
ON cornhill_school.attendance_import_batches TO cornhill_auth_runtime;

GRANT SELECT (
  id, import_batch_id, device_id, staff_account_id, device_staff_identifier,
  external_event_id, event_type, occurred_at, source_type, review_status,
  reviewed_by_staff_id, reviewed_at, created_at, device_staff_mapping_id
)
ON cornhill_school.attendance_events TO cornhill_auth_runtime;

GRANT INSERT (
  import_batch_id, device_id, device_staff_identifier,
  external_event_id, event_type, occurred_at, source_type
)
ON cornhill_school.attendance_events TO cornhill_auth_runtime;

GRANT SELECT (
  id, import_batch_id, source_row_number, reason_code, reason,
  source_row_sha256, created_at
)
ON cornhill_school.attendance_import_rejections TO cornhill_auth_runtime;

GRANT INSERT (
  import_batch_id, source_row_number, reason_code, reason, source_row_sha256
)
ON cornhill_school.attendance_import_rejections TO cornhill_auth_runtime;

COMMIT;
