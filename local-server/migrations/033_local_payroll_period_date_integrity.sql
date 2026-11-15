-- CORNHILL payroll period date-range integrity.
-- Payroll periods must be distinct to prevent duplicate or ambiguous pay coverage.
BEGIN;

CREATE FUNCTION cornhill_school.guard_payroll_period_date_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cornhill-payroll-periods', 0));

  IF EXISTS (
    SELECT 1
    FROM cornhill_school.payroll_periods existing
    WHERE existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.starts_on, existing.ends_on, '[]')
          && daterange(NEW.starts_on, NEW.ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'Payroll periods cannot have overlapping dates'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_period_no_date_overlap
BEFORE INSERT OR UPDATE OF starts_on, ends_on
ON cornhill_school.payroll_periods
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_period_date_overlap();

REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_period_date_overlap() FROM PUBLIC;

COMMIT;
