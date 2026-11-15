-- CORNHILL guardian portal: strictly scoped, read-only learner profile access.
-- The guardian can see only learners with an explicitly approved link.
-- No write grants, financial details, staff data, marks, or class rosters are exposed.
BEGIN;

GRANT USAGE ON SCHEMA cornhill_school TO cornhill_auth_runtime;

GRANT SELECT (
  id, pupil_code, lin, first_name, middle_name, last_name,
  date_of_birth, class_id, admission_date, learner_type, status
) ON cornhill_school.learners TO cornhill_auth_runtime;

GRANT SELECT (
  id, class_code, display_name, section, level_order, stream, is_active
) ON cornhill_school.classes TO cornhill_auth_runtime;

GRANT SELECT (
  guardian_account_id, learner_id, access_status, approved_at, revoked_at
) ON cornhill_auth.guardian_learner_access TO cornhill_auth_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON cornhill_school.learners, cornhill_school.classes
  FROM cornhill_auth_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON cornhill_auth.guardian_learner_access
  FROM cornhill_auth_runtime;

COMMIT;
