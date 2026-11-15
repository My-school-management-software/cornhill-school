-- CORNHILL protect salary agreements used by reviewed or posted payroll.
BEGIN;

CREATE FUNCTION cornhill_school.guard_staff_salary_agreement_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  approver_status text;
  advanced_payroll_exists boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Salary agreements are retained as employment and payroll history'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approved_by_staff_id = NEW.staff_account_id THEN
      RAISE EXCEPTION 'A staff member cannot approve their own salary agreement'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT a.account_status INTO approver_status
    FROM cornhill_auth.staff_accounts a WHERE a.id = NEW.approved_by_staff_id;
    IF approver_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Salary agreements require an active independent approver'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW.id, NEW.staff_account_id, NEW.approved_by_staff_id, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.staff_account_id, OLD.approved_by_staff_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Salary agreement identity and approval attribution cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  IF ROW(NEW.salary_basis, NEW.base_salary_ugx, NEW.daily_rate_ugx, NEW.effective_from, NEW.effective_to)
     IS DISTINCT FROM ROW(OLD.salary_basis, OLD.base_salary_ugx, OLD.daily_rate_ugx, OLD.effective_from, OLD.effective_to) THEN
    PERFORM pr.id
    FROM cornhill_school.payroll_runs pr
    JOIN cornhill_school.payroll_periods pp ON pp.id = pr.payroll_period_id
    JOIN cornhill_school.payroll_lines pl ON pl.payroll_run_id = pr.id
    WHERE pl.staff_account_id = OLD.staff_account_id
      AND (
        daterange(pp.starts_on, pp.ends_on, '[]')
          && daterange(OLD.effective_from, COALESCE(OLD.effective_to, 'infinity'::date), '[]')
        OR daterange(pp.starts_on, pp.ends_on, '[]')
          && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
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
            && daterange(OLD.effective_from, COALESCE(OLD.effective_to, 'infinity'::date), '[]')
          OR daterange(pp.starts_on, pp.ends_on, '[]')
            && daterange(NEW.effective_from, COALESCE(NEW.effective_to, 'infinity'::date), '[]')
        )
    ) INTO advanced_payroll_exists;

    IF advanced_payroll_exists THEN
      RAISE EXCEPTION 'Salary terms used by reviewed or posted payroll cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER staff_salary_agreement_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.staff_salary_agreements
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_salary_agreement_history();

REVOKE ALL ON FUNCTION cornhill_school.guard_staff_salary_agreement_history() FROM PUBLIC;
COMMIT;
