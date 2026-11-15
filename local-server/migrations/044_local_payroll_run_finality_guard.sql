-- CORNHILL preserve posted payroll run headers and reversal evidence.
-- Posted runs may only transition once to Reversed without rewriting their identity.
BEGIN;

CREATE FUNCTION cornhill_school.guard_payroll_run_finality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.run_status IN ('Posted', 'Reversed') THEN
      RAISE EXCEPTION 'Posted or reversed payroll runs cannot be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.run_status = 'Reversed' THEN
    RAISE EXCEPTION 'Reversed payroll runs are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.run_status = 'Posted' THEN
    IF NEW.run_status <> 'Reversed' THEN
      RAISE EXCEPTION 'A posted payroll run can only be reversed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF ROW(
      NEW.id,
      NEW.payroll_period_id,
      NEW.prepared_by_staff_id,
      NEW.reviewed_by_staff_id,
      NEW.approved_by_staff_id,
      NEW.posted_by_staff_id,
      NEW.prepared_at,
      NEW.reviewed_at,
      NEW.approved_at,
      NEW.posted_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.payroll_period_id,
      OLD.prepared_by_staff_id,
      OLD.reviewed_by_staff_id,
      OLD.approved_by_staff_id,
      OLD.posted_by_staff_id,
      OLD.prepared_at,
      OLD.reviewed_at,
      OLD.approved_at,
      OLD.posted_at
    ) THEN
      RAISE EXCEPTION 'Posted payroll identity and approval history cannot be rewritten during reversal'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status_reason IS NULL OR length(trim(NEW.status_reason)) < 5 THEN
      RAISE EXCEPTION 'Payroll reversal requires an audit reason'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Payroll reversal time is assigned by the database'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_run_finality_guard
BEFORE UPDATE OR DELETE ON cornhill_school.payroll_runs
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_run_finality();

REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_run_finality() FROM PUBLIC;

COMMIT;
