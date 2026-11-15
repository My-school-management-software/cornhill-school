-- Permit provisional learner records without a class assignment.
-- A class is required and checked only when one is supplied.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.require_active_class_for_admission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE selected_class_active boolean;
BEGIN
  IF NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

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

COMMIT;
