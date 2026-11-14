-- CORNHILL attendance and salary date-range integrity guards.
-- Prevent overlapping effective agreements and staff schedule assignments without
-- introducing salary deductions or changing existing attendance policy.
BEGIN;

CREATE FUNCTION cornhill_school.guard_salary_agreement_date_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.staff_account_id IS DISTINCT FROM OLD.staff_account_id THEN
    RAISE EXCEPTION 'A salary agreement cannot be reassigned to another staff account'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.is_active THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.staff_account_id::text, 0));
    IF EXISTS (
      SELECT 1
      FROM cornhill_school.staff_salary_agreements existing
      WHERE existing.staff_account_id = NEW.staff_account_id
        AND existing.is_active
        AND existing.id IS DISTINCT FROM NEW.id
        AND daterange(existing.effective_from, existing.effective_to, '[]')
            && daterange(NEW.effective_from, NEW.effective_to, '[]')
    ) THEN
      RAISE EXCEPTION 'Active salary agreements for one staff member cannot have overlapping effective dates'
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER staff_salary_agreement_no_overlap
BEFORE INSERT OR UPDATE ON cornhill_school.staff_salary_agreements
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_salary_agreement_date_overlap();

CREATE FUNCTION cornhill_school.guard_staff_schedule_date_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.staff_account_id IS DISTINCT FROM OLD.staff_account_id THEN
    RAISE EXCEPTION 'A staff schedule assignment cannot be reassigned to another staff account'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.staff_account_id::text, 0));
  IF EXISTS (
    SELECT 1
    FROM cornhill_school.staff_attendance_schedule_assignments existing
    WHERE existing.staff_account_id = NEW.staff_account_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.starts_on, existing.ends_on, '[]')
          && daterange(NEW.starts_on, NEW.ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'A staff member cannot have overlapping attendance schedule assignments'
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER staff_schedule_assignment_no_overlap
BEFORE INSERT OR UPDATE ON cornhill_school.staff_attendance_schedule_assignments
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_schedule_date_overlap();

REVOKE ALL ON FUNCTION cornhill_school.guard_salary_agreement_date_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_staff_schedule_date_overlap() FROM PUBLIC;

COMMIT;
