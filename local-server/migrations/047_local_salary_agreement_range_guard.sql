-- CORNHILL prevent overlapping active salary agreements for the same staff member.
-- This keeps the effective salary used by attendance review and payroll unambiguous.
BEGIN;

CREATE FUNCTION cornhill_school.guard_salary_agreement_effective_range()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.staff_account_id IS DISTINCT FROM OLD.staff_account_id THEN
    RAISE EXCEPTION 'A salary agreement cannot be reassigned to another staff member'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('cornhill-salary-agreement:' || NEW.staff_account_id::text, 0)
  );

  IF NEW.is_active AND EXISTS (
    SELECT 1
    FROM cornhill_school.staff_salary_agreements existing
    WHERE existing.staff_account_id = NEW.staff_account_id
      AND existing.is_active
      AND existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.effective_from, COALESCE(existing.effective_to, 'infinity'::date), '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'Active salary agreement dates cannot overlap for the same staff member'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER salary_agreement_effective_range_guard
BEFORE INSERT OR UPDATE OF staff_account_id, effective_from, effective_to, is_active
ON cornhill_school.staff_salary_agreements
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_salary_agreement_effective_range();

REVOKE ALL ON FUNCTION cornhill_school.guard_salary_agreement_effective_range() FROM PUBLIC;

COMMIT;
