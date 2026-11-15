-- CORNHILL academic workspace API and assessment/marks integrity.
-- Additive, local-only migration. It preserves existing learner and assessment data.
BEGIN;

ALTER TABLE cornhill_school.assessments
  ADD COLUMN last_updated_by_staff_id uuid
    REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT;

CREATE TABLE cornhill_school.academic_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN ('assessment', 'learner_mark')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE')),
  before_state jsonb,
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_audit_before_state_object
    CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object')
);

CREATE INDEX academic_audit_entity_time_idx
  ON cornhill_school.academic_audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX academic_audit_actor_time_idx
  ON cornhill_school.academic_audit_events (actor_staff_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION cornhill_school.record_academic_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  new_state jsonb := to_jsonb(NEW);
  old_state jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  actor_text text;
BEGIN
  actor_text := COALESCE(
    new_state ->> 'last_updated_by_staff_id',
    new_state ->> 'updated_by_staff_id',
    new_state ->> 'entered_by_staff_id',
    new_state ->> 'created_by_staff_id'
  );
  INSERT INTO cornhill_school.academic_audit_events
    (actor_staff_id, entity_type, entity_id, action, before_state, after_state)
  VALUES (
    NULLIF(actor_text, '')::uuid,
    CASE WHEN TG_TABLE_NAME = 'assessments' THEN 'assessment' ELSE 'learner_mark' END,
    (new_state ->> 'id')::uuid,
    TG_OP,
    old_state,
    new_state
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION cornhill_school.prevent_academic_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  RAISE EXCEPTION 'Academic audit events are append-only and cannot be changed or deleted'
    USING ERRCODE = 'check_violation';
END;
$function$;

CREATE TRIGGER academic_audit_events_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.academic_audit_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_academic_audit_mutation();

CREATE TRIGGER assessments_audit_capture
AFTER INSERT OR UPDATE ON cornhill_school.assessments
FOR EACH ROW EXECUTE FUNCTION cornhill_school.record_academic_audit_event();

CREATE TRIGGER learner_marks_audit_capture
AFTER INSERT OR UPDATE ON cornhill_school.learner_marks
FOR EACH ROW EXECUTE FUNCTION cornhill_school.record_academic_audit_event();

CREATE OR REPLACE FUNCTION cornhill_school.guard_assessment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.academic_term_id IS DISTINCT FROM OLD.academic_term_id
      OR NEW.class_id IS DISTINCT FROM OLD.class_id
      OR NEW.assessment_name IS DISTINCT FROM OLD.assessment_name
      OR NEW.assessment_type IS DISTINCT FROM OLD.assessment_type
      OR NEW.assessment_date IS DISTINCT FROM OLD.assessment_date
      OR NEW.max_score IS DISTINCT FROM OLD.max_score
      OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Assessment identity and scoring rules cannot be rewritten'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'Draft' AND NEW.status IN ('Open', 'Archived'))
        OR (OLD.status = 'Open' AND NEW.status IN ('Locked', 'Archived'))
        OR (OLD.status = 'Locked' AND NEW.status IN ('Published', 'Archived'))
      ) THEN
        RAISE EXCEPTION 'Assessment status transition is not permitted'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('Locked', 'Published') AND NEW.locked_at IS NULL THEN
    RAISE EXCEPTION 'A locked or published assessment requires a lock timestamp'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'Published' AND NEW.published_at IS NULL THEN
    RAISE EXCEPTION 'A published assessment requires a publication timestamp'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('Draft', 'Open') AND
     (NEW.locked_at IS NOT NULL OR NEW.published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'An open assessment cannot carry finalisation timestamps'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER assessment_lifecycle_guard
BEFORE INSERT OR UPDATE ON cornhill_school.assessments
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_assessment_lifecycle();

CREATE OR REPLACE FUNCTION cornhill_school.guard_learner_mark_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  assessment_status text;
  assessment_max_score numeric(7,2);
  assessment_reference_date date;
  learner_enrolment_exists boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
    OR NEW.learner_id IS DISTINCT FROM OLD.learner_id
    OR NEW.class_id IS DISTINCT FROM OLD.class_id
    OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
    OR NEW.entered_by_staff_id IS DISTINCT FROM OLD.entered_by_staff_id
    OR NEW.entered_at IS DISTINCT FROM OLD.entered_at
  ) THEN
    RAISE EXCEPTION 'Mark identity and original entry attribution cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.status, a.max_score, COALESCE(a.assessment_date, a.created_at::date)
    INTO assessment_status, assessment_max_score, assessment_reference_date
  FROM cornhill_school.assessments a
  WHERE a.id = NEW.assessment_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment or learner does not exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF assessment_status IS DISTINCT FROM 'Open' THEN
    RAISE EXCEPTION 'Marks can only be entered while an assessment is open'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM cornhill_school.enrolment_periods ep
    WHERE ep.learner_id = NEW.learner_id
      AND ep.class_id = NEW.class_id
      AND ep.admission_date <= assessment_reference_date
      AND (ep.exit_date IS NULL OR ep.exit_date >= assessment_reference_date)
  ) INTO learner_enrolment_exists;
  IF learner_enrolment_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Learner was not enrolled in the assessment class on the assessment date'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.max_score IS DISTINCT FROM assessment_max_score THEN
    RAISE EXCEPTION 'Mark maximum must match the assessment maximum'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER learner_mark_scope_guard
BEFORE INSERT OR UPDATE ON cornhill_school.learner_marks
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_learner_mark_scope();

REVOKE ALL ON TABLE cornhill_school.academic_audit_events FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.record_academic_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.prevent_academic_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_assessment_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_learner_mark_scope() FROM PUBLIC;

GRANT SELECT (id, learner_id, admission_date, exit_date, class_id)
  ON cornhill_school.enrolment_periods TO cornhill_auth_runtime;

GRANT SELECT ON
  cornhill_school.academic_years,
  cornhill_school.academic_terms,
  cornhill_school.assessments,
  cornhill_school.learner_marks
TO cornhill_auth_runtime;

GRANT INSERT (
  academic_term_id, class_id, assessment_name, assessment_type,
  assessment_date, max_score, status, created_by_staff_id,
  last_updated_by_staff_id
) ON cornhill_school.assessments TO cornhill_auth_runtime;

GRANT UPDATE (
  status, locked_at, published_at, last_updated_by_staff_id, updated_at
) ON cornhill_school.assessments TO cornhill_auth_runtime;

GRANT INSERT (
  assessment_id, learner_id, class_id, subject_id, score, max_score,
  teacher_comment, entered_by_staff_id, updated_by_staff_id
) ON cornhill_school.learner_marks TO cornhill_auth_runtime;

GRANT UPDATE (
  score, max_score, teacher_comment, updated_by_staff_id, updated_at
) ON cornhill_school.learner_marks TO cornhill_auth_runtime;

GRANT SELECT ON cornhill_school.academic_audit_events TO cornhill_auth_runtime;

COMMIT;
