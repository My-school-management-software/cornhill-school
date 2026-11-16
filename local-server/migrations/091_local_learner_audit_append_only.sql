-- Preserve the learner admission/profile event history as append-only evidence.
-- Profile updates will append an event in the same transaction as the learner change.
BEGIN;

CREATE FUNCTION cornhill_school.prevent_admission_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  RAISE EXCEPTION 'Learner audit events are append-only'
    USING ERRCODE = 'read_only_sql_transaction';
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.prevent_admission_event_mutation() FROM PUBLIC;

CREATE TRIGGER admission_events_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.admission_events
FOR EACH ROW
EXECUTE FUNCTION cornhill_school.prevent_admission_event_mutation();

COMMIT;
