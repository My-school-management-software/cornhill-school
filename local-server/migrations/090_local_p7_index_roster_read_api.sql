-- CORNHILL P.7 index number read access for the learner register.
-- Kept separate so already-applied migration 075 checksums remain immutable.
BEGIN;

GRANT SELECT (p7_index_number)
  ON cornhill_school.learners TO cornhill_auth_runtime;

COMMIT;
