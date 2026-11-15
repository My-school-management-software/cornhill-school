-- CORNHILL serialize payroll payment evidence against posted payroll and net pay.
BEGIN;
CREATE FUNCTION cornhill_school.validate_payroll_disbursement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE run_status text; net_pay bigint; beneficiary_staff_id uuid; recorded_staff_status text; verifier_status text; reserved_amount bigint;
BEGIN
  SELECT pr.run_status,pl.net_pay_ugx,pl.staff_account_id
    INTO run_status,net_pay,beneficiary_staff_id
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id=pl.payroll_run_id
  WHERE pl.id=NEW.payroll_line_id
  FOR UPDATE OF pr,pl;
  IF run_status IS DISTINCT FROM 'Posted' THEN
    RAISE EXCEPTION 'Payroll disbursements can only be recorded against a posted payroll run'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.disbursement_status <> 'Pending Verification'
       OR NEW.verified_by_staff_id IS NOT NULL OR NEW.verified_at IS NOT NULL THEN
      RAISE EXCEPTION 'Payroll disbursements must begin pending independent verification'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT account_status INTO recorded_staff_status
    FROM cornhill_auth.staff_accounts WHERE id=NEW.recorded_by_staff_id;
    IF recorded_staff_status IS DISTINCT FROM 'active' OR NEW.recorded_by_staff_id=beneficiary_staff_id THEN
      RAISE EXCEPTION 'Payroll disbursements require an active recording officer'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(sum(amount_ugx),0)::bigint INTO reserved_amount
    FROM cornhill_school.payroll_disbursements
    WHERE payroll_line_id=NEW.payroll_line_id
      AND disbursement_status IN ('Pending Verification','Verified');
    IF reserved_amount + NEW.amount_ugx > net_pay THEN
      RAISE EXCEPTION 'Payroll disbursement amount exceeds the remaining net pay'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF OLD.disbursement_status <> 'Pending Verification'
       OR NEW.disbursement_status NOT IN ('Verified','Rejected')
       OR NEW.verified_by_staff_id IS NULL OR NEW.verified_at IS NOT NULL
       OR NEW.verified_by_staff_id=NEW.recorded_by_staff_id
       OR NEW.verified_by_staff_id=beneficiary_staff_id THEN
      RAISE EXCEPTION 'Payroll disbursement requires one independent final verification decision'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT account_status INTO verifier_status
    FROM cornhill_auth.staff_accounts WHERE id=NEW.verified_by_staff_id;
    IF verifier_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Payroll disbursement verification requires an active independent officer'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.disbursement_status='Rejected' AND length(trim(COALESCE(NEW.verification_note,'')))<5 THEN
      RAISE EXCEPTION 'Rejected payroll disbursements require a reason'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.verified_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER payroll_disbursement_validation_guard
BEFORE INSERT OR UPDATE ON cornhill_school.payroll_disbursements
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_payroll_disbursement();
REVOKE ALL ON FUNCTION cornhill_school.validate_payroll_disbursement() FROM PUBLIC;
COMMIT;
