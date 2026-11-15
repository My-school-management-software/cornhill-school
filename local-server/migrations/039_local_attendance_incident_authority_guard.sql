-- CORNHILL enforce Headteacher/DOS and Director authority for ordinary attendance incidents.
-- Forward-only additive migration; preserves the existing review window and deduction safeguards.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.guard_attendance_incident_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  statement_authorized boolean;
  director_authorized boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.director_decision IS NOT NULL
       OR NEW.director_decision_by IS NOT NULL
       OR NEW.director_decision_at IS NOT NULL
       OR NEW.headteacher_statement IS NOT NULL
       OR NEW.headteacher_statement_by IS NOT NULL
       OR NEW.headteacher_statement_at IS NOT NULL THEN
      RAISE EXCEPTION 'Attendance incidents must be created pending without leadership review metadata'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.review_deadline_at := now() + interval '120 minutes';
    RETURN NEW;
  END IF;

  IF OLD.director_decision IS NOT NULL THEN
    RAISE EXCEPTION 'A decided attendance incident is immutable; use a separately audited correction workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.review_deadline_at IS DISTINCT FROM OLD.review_deadline_at THEN
    RAISE EXCEPTION 'The attendance incident review deadline is fixed at creation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.headteacher_statement IS DISTINCT FROM OLD.headteacher_statement
     OR NEW.headteacher_statement_by IS DISTINCT FROM OLD.headteacher_statement_by
     OR NEW.headteacher_statement_at IS DISTINCT FROM OLD.headteacher_statement_at THEN
    IF OLD.headteacher_statement IS NOT NULL THEN
      RAISE EXCEPTION 'A recorded Headteacher/DOS statement is immutable; use an audited correction workflow'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.headteacher_statement IS NULL
       OR NEW.headteacher_statement_by IS NULL
       OR NEW.headteacher_statement_at IS NULL
       OR length(trim(NEW.headteacher_statement)) NOT BETWEEN 8 AND 1500 THEN
      RAISE EXCEPTION 'A complete Headteacher/DOS statement is required'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM cornhill_auth.staff_role_assignments r
      JOIN cornhill_auth.staff_accounts a ON a.id = r.staff_account_id
      WHERE r.staff_account_id = NEW.headteacher_statement_by
        AND r.role_code IN ('headteacher', 'director_of_studies')
        AND a.account_status = 'active'
    ) INTO statement_authorized;
    IF statement_authorized IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Attendance incident statement must be recorded by an active Headteacher or Director of Studies'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.headteacher_statement_at := now();
  END IF;

  IF NEW.director_decision IS NOT NULL THEN
    IF now() < OLD.review_deadline_at THEN
      RAISE EXCEPTION 'The attendance review window has not ended'
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
      RAISE EXCEPTION 'Only an active Director may decide an attendance incident'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.director_decision_at := now();
    IF NEW.director_decision = 'deduct' AND NULLIF(btrim(NEW.headteacher_statement),'') IS NULL THEN
      RAISE EXCEPTION 'A Headteacher or DOS statement is required before a deduction decision'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.director_decision = 'deduct' AND NEW.approved_deduction_ugx >
      COALESCE((
        SELECT a.daily_rate_ugx
        FROM cornhill_school.staff_salary_agreements a
        WHERE a.staff_account_id = NEW.staff_account_id
          AND a.is_active
          AND a.effective_from <= NEW.attendance_date
          AND (a.effective_to IS NULL OR a.effective_to >= NEW.attendance_date)
        ORDER BY a.effective_from DESC,a.created_at DESC
        LIMIT 1
      ),0) THEN
      RAISE EXCEPTION 'Approved attendance deduction exceeds the configured daily rate'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_incident_decision() FROM PUBLIC;

COMMIT;
