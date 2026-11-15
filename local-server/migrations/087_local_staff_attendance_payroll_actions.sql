-- Narrow runtime grants for append-only attendance review and staged payroll evidence.
-- SECURITY DEFINER lock helpers preserve concurrency without granting UPDATE on source records.
BEGIN;

CREATE FUNCTION cornhill_school.lock_attendance_day_identity_for_review(p_attendance_day_id uuid)
RETURNS TABLE(staff_account_id uuid, work_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  RETURN QUERY
  SELECT ad.staff_account_id, ad.work_date
  FROM cornhill_school.attendance_days ad
  WHERE ad.id = p_attendance_day_id
  FOR UPDATE;
END;
$function$;
REVOKE ALL ON FUNCTION cornhill_school.lock_attendance_day_identity_for_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cornhill_school.lock_attendance_day_identity_for_review(uuid) TO cornhill_auth_runtime;

CREATE OR REPLACE FUNCTION cornhill_school.guard_attendance_day_review_event()
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
  SELECT locked.staff_account_id,locked.work_date
    INTO day_staff_id,day_work_date
  FROM cornhill_school.lock_attendance_day_identity_for_review(NEW.attendance_day_id) locked;
  IF day_staff_id IS DISTINCT FROM NEW.staff_account_id
     OR day_work_date IS DISTINCT FROM NEW.attendance_date THEN
    RAISE EXCEPTION 'Attendance review identity must match its source attendance day'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reviewed_by_staff_id = NEW.staff_account_id THEN
    RAISE EXCEPTION 'Staff cannot independently review their own attendance'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT account_status INTO reviewer_status
  FROM cornhill_auth.staff_accounts WHERE id = NEW.reviewed_by_staff_id;
  IF reviewer_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Attendance review requires an active staff reviewer'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.reviewed_at := now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION cornhill_school.lock_payroll_line_for_disbursement(p_payroll_line_id uuid)
RETURNS TABLE(run_status text, net_pay_ugx bigint, beneficiary_staff_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  RETURN QUERY
  SELECT pr.run_status,pl.net_pay_ugx,pl.staff_account_id
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id=pl.payroll_run_id
  WHERE pl.id=p_payroll_line_id
  FOR UPDATE OF pr,pl;
END;
$function$;
REVOKE ALL ON FUNCTION cornhill_school.lock_payroll_line_for_disbursement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cornhill_school.lock_payroll_line_for_disbursement(uuid) TO cornhill_auth_runtime;

CREATE OR REPLACE FUNCTION cornhill_school.validate_payroll_disbursement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE run_status text; net_pay bigint; beneficiary_staff_id uuid; recorded_staff_status text; verifier_status text; reserved_amount bigint;
BEGIN
  SELECT locked.run_status,locked.net_pay_ugx,locked.beneficiary_staff_id
    INTO run_status,net_pay,beneficiary_staff_id
  FROM cornhill_school.lock_payroll_line_for_disbursement(NEW.payroll_line_id) locked;
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

GRANT INSERT (
  attendance_day_id, staff_account_id, attendance_date,
  review_status, review_note, reviewed_by_staff_id
)
ON cornhill_school.attendance_day_review_events TO cornhill_auth_runtime;

GRANT INSERT (
  payroll_line_id, amount_ugx, payment_method, external_reference,
  paid_at, recorded_by_staff_id
)
ON cornhill_school.payroll_disbursements TO cornhill_auth_runtime;

GRANT UPDATE (
  disbursement_status, verified_by_staff_id, verification_note
)
ON cornhill_school.payroll_disbursements TO cornhill_auth_runtime;

COMMIT;
