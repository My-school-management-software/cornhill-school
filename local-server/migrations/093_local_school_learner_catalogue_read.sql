-- Least-privilege read access for the authenticated School Office learner register.
-- The HTTP layer still enforces learners.read and class-assignment scope.
-- Grant only the fields selected by the learner-list query and its class join.
BEGIN;

GRANT SELECT (
  id,
  pupil_code,
  lin,
  first_name,
  middle_name,
  last_name,
  gender,
  date_of_birth,
  p7_index_number,
  learner_type,
  previous_school,
  class_id,
  admission_date,
  status
) ON cornhill_school.learners TO cornhill_auth_runtime;

GRANT SELECT (id, display_name)
  ON cornhill_school.classes TO cornhill_auth_runtime;

COMMIT;
