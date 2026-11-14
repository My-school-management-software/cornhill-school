-- CORNHILL preserve payment evidence and expose verified payroll disbursement totals.
BEGIN;
CREATE FUNCTION cornhill_school.guard_payroll_disbursement_finality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Payroll disbursement evidence cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.disbursement_status <> 'Pending Verification' THEN
    RAISE EXCEPTION 'Verified or rejected payroll disbursement evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(NEW.id,NEW.payroll_line_id,NEW.amount_ugx,NEW.payment_method,NEW.external_reference,
         NEW.paid_at,NEW.recorded_by_staff_id,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.payroll_line_id,OLD.amount_ugx,OLD.payment_method,OLD.external_reference,
         OLD.paid_at,OLD.recorded_by_staff_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Payroll disbursement identity and payment evidence cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER payroll_disbursement_finality_guard
BEFORE UPDATE OR DELETE ON cornhill_school.payroll_disbursements
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_disbursement_finality();
REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_disbursement_finality() FROM PUBLIC;

CREATE VIEW cornhill_school.payroll_disbursement_summary
WITH (security_invoker=true)
AS
SELECT pl.id AS payroll_line_id,pl.payroll_run_id,pl.staff_account_id,
       pl.net_pay_ugx,
       COALESCE(sum(pd.amount_ugx) FILTER (WHERE pd.disbursement_status='Verified'),0)::bigint AS verified_paid_ugx,
       COALESCE(sum(pd.amount_ugx) FILTER (WHERE pd.disbursement_status='Pending Verification'),0)::bigint AS pending_verification_ugx,
       pl.net_pay_ugx-COALESCE(sum(pd.amount_ugx) FILTER (WHERE pd.disbursement_status IN ('Verified','Pending Verification')),0)::bigint AS remaining_unallocated_ugx
FROM cornhill_school.payroll_lines pl
LEFT JOIN cornhill_school.payroll_disbursements pd ON pd.payroll_line_id=pl.id
GROUP BY pl.id,pl.payroll_run_id,pl.staff_account_id,pl.net_pay_ugx;
REVOKE ALL ON cornhill_school.payroll_disbursement_summary FROM PUBLIC;
COMMIT;
