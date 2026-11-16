-- Least-privilege column grants for the authenticated learner profile workflow.
-- The HTTP handler separately enforces learners.manage and learners.lin_manage.
-- Permanent pupil_code, class_id, status and admission identity remain immutable here.
BEGIN;

GRANT UPDATE (
  first_name,
  middle_name,
  last_name,
  gender,
  date_of_birth,
  lin,
  learner_type,
  previous_school,
  p7_index_number,
  updated_at
) ON cornhill_school.learners TO cornhill_auth_runtime;

GRANT SELECT (id, class_id)
  ON cornhill_school.learners TO cornhill_auth_runtime;

COMMIT;
