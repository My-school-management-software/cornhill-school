-- CORNHILL bind each attendance incident to the matching staff member and work date.
BEGIN;

CREATE FUNCTION cornhill_school.validate_attendance_incident_day_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  day_staff_id uuid;
  day_work_date date;
BEGIN
  SELECT ad.staff_account_id, ad.work_date
    INTO day_staff_id, day_work_date
  FROM cornhill_school.attendance_days ad
  WHERE ad.id = NEW.attendance_day_id;

  IF day_staff_id IS DISTINCT FROM NEW.staff_account_id
     OR day_work_date IS DISTINCT FROM NEW.attendance_date THEN
    RAISE EXCEPTION 'Attendance incident staff and date must match its attendance day'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER attendance_incident_day_identity_guard
BEFORE INSERT ON cornhill_school.staff_attendance_incidents
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_attendance_incident_day_identity();

REVOKE ALL ON FUNCTION cornhill_school.validate_attendance_incident_day_identity() FROM PUBLIC;
COMMIT;
