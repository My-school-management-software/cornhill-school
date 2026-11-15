-- CORNHILL prevent overlapping employment terms and preserve attendance/payroll history.
BEGIN;

CREATE FUNCTION cornhill_school.guard_staff_employment_term_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  approver_status text;
  advanced_payroll_exists boolean;
  attendance_history_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Staff employment terms cannot be deleted; retain contract history'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approved_by_staff_id = NEW.staff_account_id THEN
      RAISE EXCEPTION 'A staff member cannot approve their own employment terms'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT a.account_status INTO approver_status
    FROM cornhill_auth.staff_accounts a WHERE a.id = NEW.approved_by_staff_id;
    IF approver_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Employment terms require an active independent approver'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF ROW(NEW.id, NEW.staff_account_id, NEW.approved_by_staff_id, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.staff_account_id, OLD.approved_by_staff_id, OLD.created_at) THEN
      RAISE EXCEPTION 'Employment term identity and approval attribution cannot be reassigned'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('cornhill-employment-terms:' || NEW.staff_account_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM cornhill_school.staff_employment_terms existing
    WHERE existing.staff_account_id = NEW.staff_account_id
      AND existing.id IS DISTINCT FROM NEW.id
      AND daterange(existing.starts_on, COALESCE(existing.ends_on, 'infinity'::date), '[]')
          && daterange(NEW.starts_on, COALESCE(NEW.ends_on, 'infinity'::date), '[]')
  ) THEN
    RAISE EXCEPTION 'Employment terms for one staff member cannot overlap'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  IF TG_OP = 'UPDATE'
     AND ROW(
       NEW.starts_on, NEW.ends_on, NEW.contract_type, NEW.salary_basis,
       NEW.base_salary_ugx, NEW.payment_frequency, NEW.expected_minutes_per_day,
       NEW.working_days_per_week
     ) IS DISTINCT FROM ROW(
       OLD.starts_on, OLD.ends_on, OLD.contract_type, OLD.salary_basis,
       OLD.base_salary_ugx, OLD.payment_frequency, OLD.expected_minutes_per_day,
       OLD.working_days_per_week
     ) THEN
    PERFORM pr.id
    FROM cornhill_school.payroll_runs pr
    JOIN cornhill_school.payroll_periods pp ON pp.id = pr.payroll_period_id
    JOIN cornhill_school.payroll_lines pl ON pl.payroll_run_id = pr.id
    WHERE pl.staff_account_id = OLD.staff_account_id
      AND (
        daterange(pp.starts_on, pp.ends_on, '[]')
          && daterange(OLD.starts_on, COALESCE(OLD.ends_on, 'infinity'::date), '[]')
        OR daterange(pp.starts_on, pp.ends_on, '[]')
          && daterange(NEW.starts_on, COALESCE(NEW.ends_on, 'infinity'::date), '[]')
      )
    ORDER BY pr.id
    FOR UPDATE OF pr;

    SELECT EXISTS (
      SELECT 1
      FROM cornhill_school.payroll_runs pr
      JOIN cornhill_school.payroll_periods pp ON pp.id = pr.payroll_period_id
      JOIN cornhill_school.payroll_lines pl ON pl.payroll_run_id = pr.id
      WHERE pl.staff_account_id = OLD.staff_account_id
        AND pr.run_status <> 'Draft'
        AND (
          daterange(pp.starts_on, pp.ends_on, '[]')
            && daterange(OLD.starts_on, COALESCE(OLD.ends_on, 'infinity'::date), '[]')
          OR daterange(pp.starts_on, pp.ends_on, '[]')
            && daterange(NEW.starts_on, COALESCE(NEW.ends_on, 'infinity'::date), '[]')
        )
    ) INTO advanced_payroll_exists;

    IF advanced_payroll_exists THEN
      RAISE EXCEPTION 'Employment terms used by reviewed or posted payroll cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM cornhill_school.attendance_days ad
      WHERE ad.staff_account_id = OLD.staff_account_id
        AND (
          ad.work_date BETWEEN OLD.starts_on AND COALESCE(OLD.ends_on, 'infinity'::date)
          OR ad.work_date BETWEEN NEW.starts_on AND COALESCE(NEW.ends_on, 'infinity'::date)
        )
    ) INTO attendance_history_exists;

    IF attendance_history_exists THEN
      RAISE EXCEPTION 'Employment terms covering recorded attendance cannot be rewritten'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER staff_employment_term_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.staff_employment_terms
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_employment_term_history();

REVOKE ALL ON FUNCTION cornhill_school.guard_staff_employment_term_history() FROM PUBLIC;
COMMIT;
