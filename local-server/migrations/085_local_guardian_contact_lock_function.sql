-- CORNHILL guardian access: perform contact/learner row locks under the
-- migration owner so the application role does not need UPDATE privileges
-- on guardian_contacts or learners.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.lock_active_guardian_contact_for_access(
  p_contact_id uuid
)
RETURNS TABLE (
  learner_id uuid,
  guardian_name text,
  phone_e164 text,
  phone_last_four text,
  pupil_code text,
  learner_name text
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school
AS $function$
  SELECT
    gc.learner_id,
    gc.guardian_name,
    gc.phone_e164,
    right(gc.phone_e164, 4),
    l.pupil_code,
    concat_ws(' ', l.first_name, NULLIF(l.middle_name, ''), l.last_name)
  FROM cornhill_school.guardian_contacts gc
  INNER JOIN cornhill_school.learners l
    ON l.id = gc.learner_id
  WHERE gc.id = p_contact_id
    AND gc.is_active = true
    AND gc.phone_e164 IS NOT NULL
    AND l.status <> 'Archived'
  FOR UPDATE OF gc, l;
$function$;

REVOKE ALL ON FUNCTION
  cornhill_school.lock_active_guardian_contact_for_access(uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  cornhill_school.lock_active_guardian_contact_for_access(uuid)
  TO cornhill_auth_runtime;

COMMIT;
