-- CORNHILL local learner roster read API.
-- Read-only learner identity fields are granted to the private auth runtime.
-- Application routes enforce learners.read and assigned-class boundaries.
BEGIN;

GRANT SELECT (
  id, pupil_code, lin, first_name, middle_name, last_name, gender,
  date_of_birth, class_id, admission_date, status
) ON cornhill_school.learners TO cornhill_auth_runtime;

COMMIT;
