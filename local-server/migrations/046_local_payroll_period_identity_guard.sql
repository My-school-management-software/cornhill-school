-- CORNHILL preserve payroll period identity once a payroll run has been opened.
-- Period labels and coverage/payment dates must not drift beneath an existing run.
BEGIN;

CREATE FUNCTION cornhill_school.guard_payroll_period_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF ROW(NEW.period_code, NEW.starts_on, NEW.ends_on, NEW.payment_date)
     IS DISTINCT FROM
     ROW(OLD.period_code, OLD.starts_on, OLD.ends_on, OLD.payment_date)
     AND EXISTS (
       SELECT 1
       FROM cornhill_school.payroll_runs pr
       WHERE pr.payroll_period_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Payroll period identity and dates cannot change after a payroll run has been created'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_period_identity_guard
BEFORE UPDATE OF period_code, starts_on, ends_on, payment_date
ON cornhill_school.payroll_periods
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_period_identity();

REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_period_identity() FROM PUBLIC;

COMMIT;
