-- CORNHILL make payroll audit history append-only.
-- Corrections are represented by new audit events, never by rewriting prior evidence.
BEGIN;

CREATE FUNCTION cornhill_school.prevent_payroll_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  RAISE EXCEPTION 'Payroll audit events are append-only and cannot be changed or deleted'
    USING ERRCODE = 'check_violation';
END;
$function$;

CREATE TRIGGER payroll_audit_events_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.payroll_audit_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_payroll_audit_event_mutation();

REVOKE ALL ON FUNCTION cornhill_school.prevent_payroll_audit_event_mutation() FROM PUBLIC;

COMMIT;
