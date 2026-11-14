-- CORNHILL special-session review and optional payroll linkage.
-- Special-session decisions remain separate from ordinary daily attendance incidents.
BEGIN;

ALTER TABLE cornhill_school.staff_attendance_policy_settings
  ADD COLUMN prep_deductions_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE cornhill_school.staff_scheduled_session_attendance
  ADD COLUMN review_deadline_at timestamptz NOT NULL DEFAULT (now() + interval '120 minutes'),
  ADD COLUMN headteacher_statement text,
  ADD COLUMN headteacher_statement_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN headteacher_statement_at timestamptz,
  ADD COLUMN director_decision text CHECK (director_decision IS NULL OR director_decision IN ('excused','deduct')),
  ADD COLUMN director_decision_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN director_decision_at timestamptz,
  ADD COLUMN approved_deduction_ugx bigint NOT NULL DEFAULT 0 CHECK (approved_deduction_ugx >= 0),
  ADD COLUMN payroll_line_item_id uuid REFERENCES cornhill_school.payroll_line_items(id) ON DELETE RESTRICT;

ALTER TABLE cornhill_school.staff_scheduled_session_attendance
  ADD CONSTRAINT scheduled_session_statement_metadata CHECK (
    (headteacher_statement IS NULL AND headteacher_statement_by IS NULL AND headteacher_statement_at IS NULL)
    OR (length(trim(headteacher_statement)) BETWEEN 8 AND 1500
        AND headteacher_statement_by IS NOT NULL AND headteacher_statement_at IS NOT NULL)
  ),
  ADD CONSTRAINT scheduled_session_decision_metadata CHECK (
    (director_decision IS NULL AND director_decision_by IS NULL AND director_decision_at IS NULL
      AND approved_deduction_ugx = 0 AND payroll_line_item_id IS NULL)
    OR (director_decision = 'excused' AND director_decision_by IS NOT NULL
      AND director_decision_at IS NOT NULL AND approved_deduction_ugx = 0
      AND payroll_line_item_id IS NULL)
    OR (director_decision = 'deduct' AND director_decision_by IS NOT NULL
      AND director_decision_at IS NOT NULL AND approved_deduction_ugx > 0)
  );

CREATE UNIQUE INDEX special_session_payroll_item_unique\n  ON cornhill_school.staff_scheduled_session_attendance(payroll_line_item_id)\n  WHERE payroll_line_item_id IS NOT NULL;\n\nCREATE FUNCTION cornhill_school.guard_special_session_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  session_date date;
  daily_rate bigint;
  deductions_enabled boolean;
  linked_item_type text;
  linked_item_staff uuid;\n  linked_item_amount bigint;
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

  IF NEW.director_decision IS NOT NULL THEN
    IF now() < OLD.review_deadline_at THEN
      RAISE EXCEPTION 'The special-session review window has not ended'
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
    SELECT i.item_type, l.staff_account_id
      INTO linked_item_type, linked_item_staff
    FROM cornhill_school.payroll_line_items i
    JOIN cornhill_school.payroll_lines l ON l.id = i.payroll_line_id
    WHERE i.id = NEW.payroll_line_item_id;

    IF NEW.director_decision <> 'deduct'
       OR linked_item_type IS DISTINCT FROM 'Deduction'
       OR linked_item_staff IS DISTINCT FROM NEW.staff_account_id\n       OR linked_item_amount IS DISTINCT FROM NEW.approved_deduction_ugx THEN
      RAISE EXCEPTION 'Special-session payroll linkage must reference a matching deduction item for the same staff member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER special_session_review_guard
BEFORE INSERT OR UPDATE ON cornhill_school.staff_scheduled_session_attendance
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_special_session_review();

REVOKE ALL ON FUNCTION cornhill_school.guard_special_session_review() FROM PUBLIC;

COMMIT;
