-- CORNHILL map terminal staff identifiers to active staff with effective-date history.
BEGIN;

CREATE TABLE cornhill_school.attendance_device_staff_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES cornhill_school.attendance_devices(id) ON DELETE RESTRICT,
  device_staff_identifier text NOT NULL,
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_device_staff_identifier_length CHECK (length(trim(device_staff_identifier)) BETWEEN 1 AND 80),
  CONSTRAINT attendance_device_staff_mapping_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX attendance_device_staff_mapping_lookup_idx
  ON cornhill_school.attendance_device_staff_mappings(device_id, device_staff_identifier, effective_from DESC);

CREATE FUNCTION cornhill_school.guard_attendance_device_staff_mapping()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  mapped_staff_status text;
  creator_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fingerprint staff mappings are retained as attendance identity history'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id, NEW.device_id, NEW.device_staff_identifier, NEW.staff_account_id,
    NEW.effective_from, NEW.created_by_staff_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.device_id, OLD.device_staff_identifier, OLD.staff_account_id,
    OLD.effective_from, OLD.created_by_staff_id, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Fingerprint staff mapping identity cannot be reassigned'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.account_status INTO mapped_staff_status
  FROM cornhill_auth.staff_accounts a WHERE a.id = NEW.staff_account_id;
  IF mapped_staff_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'A fingerprint identifier can only be mapped to an active staff account'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.account_status INTO creator_status
  FROM cornhill_auth.staff_accounts a WHERE a.id = NEW.created_by_staff_id;
  IF creator_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Fingerprint staff mappings must be registered by an active staff account'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('cornhill-device-staff-map:' || NEW.device_id::text || ':' || NEW.device_staff_identifier, 0)
  );

  IF NEW.is_active AND EXISTS (
    SELECT 1
    FROM cornhill_school.attendance_device_staff_mappings existing
    WHERE existing.device_id = NEW.device_id
      AND existing.device_staff_identifier = NEW.device_staff_identifier
      AND existing.is_active
      AND existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.effective_from, COALESCE(existing.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'A device staff identifier cannot have overlapping active staff mappings'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_device_staff_mapping_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.attendance_device_staff_mappings
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_device_staff_mapping();

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_device_staff_mapping() FROM PUBLIC;
COMMIT;
