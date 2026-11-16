-- Preserve source-system identity and historical admission-code aliases for controlled import.
BEGIN;
CREATE TABLE cornhill_school.learner_code_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
 old_code text NOT NULL CHECK (length(trim(old_code)) BETWEEN 1 AND 80),
 new_code text NOT NULL CHECK (length(trim(new_code)) BETWEEN 1 AND 80),
 code_normalized text NOT NULL UNIQUE CHECK (length(trim(code_normalized)) BETWEEN 1 AND 80),
 changed_at timestamptz NOT NULL,
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
 CONSTRAINT learner_alias_not_current_code CHECK (old_code <> new_code)
);
CREATE INDEX learner_code_aliases_learner_idx ON cornhill_school.learner_code_aliases (learner_id,changed_at);
REVOKE ALL ON cornhill_school.learner_code_aliases FROM PUBLIC;
COMMIT;
