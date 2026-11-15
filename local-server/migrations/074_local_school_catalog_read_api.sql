-- CORNHILL local school catalogue read API.
-- Grants the authentication runtime read-only access to non-personal class/subject metadata.
-- No learner, guardian, marks, finance or staff records are exposed by this grant.
BEGIN;

GRANT USAGE ON SCHEMA cornhill_school TO cornhill_auth_runtime;
GRANT SELECT (id, class_code, display_name, section, level_order, stream, is_active)
  ON cornhill_school.classes TO cornhill_auth_runtime;
GRANT SELECT (id, subject_code, subject_name, subject_group, is_active)
  ON cornhill_school.subjects TO cornhill_auth_runtime;
GRANT SELECT (id, class_id, subject_id, display_order, is_compulsory, is_active)
  ON cornhill_school.class_subjects TO cornhill_auth_runtime;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON cornhill_school.classes, cornhill_school.subjects, cornhill_school.class_subjects
  FROM cornhill_auth_runtime;

COMMIT;
