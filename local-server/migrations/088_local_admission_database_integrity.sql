-- Enforce admission invariants at the database boundary, including direct SQL writes.
-- Existing permanent pupil codes and learner records are preserved.
BEGIN;

ALTER TABLE cornhill_school.learners
  ADD CONSTRAINT learner_dob_not_after_admission
  CHECK (date_of_birth IS NULL OR date_of_birth <= admission_date);

ALTER TABLE cornhill_school.learners
  ADD CONSTRAINT learner_lin_trimmed_nonempty
  CHECK (lin IS NULL OR (lin = btrim(lin) AND length(lin) BETWEEN 1 AND 40));

CREATE FUNCTION cornhill_school.require_active_class_for_admission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE selected_class_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
    RETURN NEW;
  END IF;

  SELECT is_active
    INTO selected_class_active
  FROM cornhill_school.classes
  WHERE id = NEW.class_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admission class does not exist'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF selected_class_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'New admissions require an active class'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.require_active_class_for_admission() FROM PUBLIC;

CREATE TRIGGER learners_require_active_class_for_admission
BEFORE INSERT OR UPDATE OF class_id ON cornhill_school.learners
FOR EACH ROW
EXECUTE FUNCTION cornhill_school.require_active_class_for_admission();

COMMIT;
