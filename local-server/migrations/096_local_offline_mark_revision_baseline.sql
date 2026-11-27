-- CORNHILL V2.1 OFFLINE MARK REVISION PREPARATION
-- Additive LOCAL PostgreSQL migration; NEVER apply to Supabase or production cloud.
-- Approval, isolated backup and installed-source reconciliation required for a real Windows install.
BEGIN;

ALTER TABLE cornhill_school.learner_marks
  ADD COLUMN offline_sync_revision bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT learner_marks_offline_sync_revision_positive
    CHECK (offline_sync_revision BETWEEN 1 AND 9223372036854775807);

CREATE OR REPLACE FUNCTION cornhill_school.bump_learner_mark_offline_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $trigger$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.offline_sync_revision := 1;
    RETURN NEW;
  END IF;
  IF OLD.offline_sync_revision >= 9223372036854775806 THEN
    RAISE EXCEPTION 'Learner mark revision exhausted' USING ERRCODE = '23514';
  END IF;
  -- Always increment on any update; clients cannot assign their own revision.
  NEW.offline_sync_revision := OLD.offline_sync_revision + 1;
  RETURN NEW;
END;
$trigger$;

CREATE TRIGGER learner_mark_offline_revision_guard
BEFORE INSERT OR UPDATE ON cornhill_school.learner_marks
FOR EACH ROW
EXECUTE FUNCTION cornhill_school.bump_learner_mark_offline_revision();

REVOKE ALL ON FUNCTION cornhill_school.bump_learner_mark_offline_revision() FROM PUBLIC;

-- Scoped read-only resolver columns; no learner names, codes, phone numbers
-- or finance permissions are granted by this migration.
GRANT SELECT (id, source_record_id, status) ON cornhill_school.learners TO cornhill_auth_runtime;
GRANT SELECT (id, class_id, status, max_score) ON cornhill_school.assessments TO cornhill_auth_runtime;
GRANT SELECT (learner_id, class_id, status, admission_date, exit_date)
  ON cornhill_school.enrolment_periods TO cornhill_auth_runtime;
GRANT SELECT (class_id, subject_id, is_active)
  ON cornhill_school.class_subjects TO cornhill_auth_runtime;
GRANT SELECT (id, is_active) ON cornhill_school.subjects TO cornhill_auth_runtime;
GRANT SELECT (
  assessment_id, learner_id, subject_id, offline_sync_revision,
  score, max_score, teacher_comment
) ON cornhill_school.learner_marks TO cornhill_auth_runtime;

COMMIT;
