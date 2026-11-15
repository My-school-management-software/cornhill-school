-- CORNHILL validate daily attendance review identity and preserve review evidence.
BEGIN;
CREATE FUNCTION cornhill_school.guard_attendance_day_review_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE day_staff_id uuid; day_work_date date; reviewer_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Daily attendance review events are append-only'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT staff_account_id,work_date INTO day_staff_id,day_work_date
  FROM cornhill_school.attendance_days
  WHERE id = NEW.attendance_day_id
  FOR UPDATE;
  IF day_staff_id IS DISTINCT FROM NEW.staff_account_id
     OR day_work_date IS DISTINCT FROM NEW.attendance_date THEN
    RAISE EXCEPTION 'Attendance review identity must match its source attendance day'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reviewed_by_staff_id = NEW.staff_account_id THEN
    RAISE EXCEPTION 'Staff cannot independently review their own attendance'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT account_status INTO reviewer_status FROM cornhill_auth.staff_accounts WHERE id = NEW.reviewed_by_staff_id;
  IF reviewer_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Attendance review requires an active staff reviewer'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER attendance_day_review_event_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.attendance_day_review_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_day_review_event();
REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_day_review_event() FROM PUBLIC;
COMMIT;
