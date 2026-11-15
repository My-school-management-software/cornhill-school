-- CORNHILL enforce special-session review authority and exact payroll linkage.
-- Replaces the migration 035 guard without rewriting already-applied migration history.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.guard_special_session_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  session_date date;
  daily_rate bigint;
  deductions_enabled boolean;
  linked_item_type text;
  linked_item_staff uuid;
  linked_item_amount bigint;
  statement_authorized boolean;
  director_authorized boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.review_deadline_at := now() + interval '120 minutes';
    NEW.director_decision := NULL;
    NEW.director_decision_by := NULL;
    NEW.director_decision_at := NULL;
    NEW.approved_deduction_ugx := 0;
    NEW.payroll_line_item_id := NULL;
    RETURN NEW;
  END IF;

  IF OLD.director_decision IS NOT NULL THEN
    RAISE EXCEPTION 'A decided special-session attendance record is immutable; use an audited correction workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.review_deadline_at IS DISTINCT FROM OLD.review_deadline_at THEN
    RAISE EXCEPTION 'The special-session review deadline is fixed at 120 minutes'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.headteacher_statement IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM cornhill_auth.staff_role_assignments r
      JOIN cornhill_auth.staff_accounts a ON a.id = r.staff_account_id
      WHERE r.staff_account_id = NEW.headteacher_statement_by
        AND r.role_code IN ('headteacher', 'director_of_studies')
        AND a.account_status = 'active'
    ) INTO statement_authorized;
    IF statement_authorized IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Special-session statement must be recorded by an active Headteacher or Director of Studies'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.director_decision IS NOT NULL THEN
    IF now() < OLD.review_deadline_at THEN
      RAISE EXCEPTION 'The special-session review window has not ended'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM cornhill_auth.staff_role_assignments r
      JOIN cornhill_auth.staff_accounts a ON a.id = r.staff_account_id
      WHERE r.staff_account_id = NEW.director_decision_by
        AND r.role_code = 'director'
        AND a.account_status = 'active'
    ) INTO director_authorized;
    IF director_authorized IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Only an active Director may decide special-session attendance'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.director_decision = 'deduct' THEN
      IF NULLIF(btrim(NEW.headteacher_statement),'') IS NULL
         OR NEW.headteacher_statement_by IS NULL
         OR NEW.headteacher_statement_at IS NULL THEN
        RAISE EXCEPTION 'A Headteacher or DOS statement is required before a special-session deduction'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT s.prep_date INTO session_date
      FROM cornhill_school.staff_prep_sessions s
      WHERE s.id = NEW.session_id;

      SELECT p.prep_deductions_enabled INTO deductions_enabled
      FROM cornhill_school.staff_attendance_policy_settings p
      WHERE p.id = true;

      IF deductions_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Special-session salary deductions are disabled by school policy'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT a.daily_rate_ugx INTO daily_rate
      FROM cornhill_school.staff_salary_agreements a
      WHERE a.staff_account_id = NEW.staff_account_id
        AND a.is_active
        AND a.effective_from <= session_date
        AND (a.effective_to IS NULL OR a.effective_to >= session_date)
      ORDER BY a.effective_from DESC, a.created_at DESC
      LIMIT 1;

      IF daily_rate IS NULL OR NEW.approved_deduction_ugx > daily_rate THEN
        RAISE EXCEPTION 'Special-session deduction must not exceed the effective daily salary rate'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.director_decision = 'excused' THEN
      IF NEW.approved_deduction_ugx <> 0 OR NEW.payroll_line_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'Excused special-session attendance cannot create a payroll deduction'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.payroll_line_item_id IS NOT NULL THEN
    SELECT i.item_type, l.staff_account_id, i.amount_ugx
      INTO linked_item_type, linked_item_staff, linked_item_amount
    FROM cornhill_school.payroll_line_items i
    JOIN cornhill_school.payroll_lines l ON l.id = i.payroll_line_id
    WHERE i.id = NEW.payroll_line_item_id;

    IF NEW.director_decision <> 'deduct'
       OR linked_item_type IS DISTINCT FROM 'Deduction'
       OR linked_item_staff IS DISTINCT FROM NEW.staff_account_id
       OR linked_item_amount IS DISTINCT FROM NEW.approved_deduction_ugx THEN
      RAISE EXCEPTION 'Special-session payroll linkage must reference a matching deduction item for the same staff member and exact amount'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.guard_special_session_review() FROM PUBLIC;

COMMIT;
