-- CORNHILL academic year and term setup, attribution and audit.
-- Additive migration: does not rewrite existing academic periods or marks.
BEGIN;
ALTER TABLE cornhill_school.academic_years
  ADD COLUMN created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT;
ALTER TABLE cornhill_school.academic_terms
  ADD COLUMN created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT;
CREATE TABLE cornhill_school.academic_period_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN ('academic_year', 'academic_term')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action = 'INSERT'),
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX academic_period_audit_entity_time_idx
 ON cornhill_school.academic_period_audit_events(entity_type,entity_id,occurred_at DESC);
CREATE INDEX academic_period_audit_actor_time_idx
 ON cornhill_school.academic_period_audit_events(actor_staff_id,occurred_at DESC);
CREATE OR REPLACE FUNCTION cornhill_school.record_academic_period_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school AS $function$
BEGIN
 INSERT INTO cornhill_school.academic_period_audit_events(actor_staff_id,entity_type,entity_id,action,after_state)
 VALUES(NEW.created_by_staff_id,
   CASE WHEN TG_TABLE_NAME='academic_years' THEN 'academic_year' ELSE 'academic_term' END,
   NEW.id,'INSERT',to_jsonb(NEW));
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION cornhill_school.prevent_academic_period_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school AS $function$
BEGIN
 RAISE EXCEPTION 'Academic period audit events are append-only and cannot be changed or deleted'
 USING ERRCODE='check_violation';
END;
$function$;
CREATE TRIGGER academic_years_audit_capture AFTER INSERT ON cornhill_school.academic_years
FOR EACH ROW EXECUTE FUNCTION cornhill_school.record_academic_period_audit_event();
CREATE TRIGGER academic_terms_audit_capture AFTER INSERT ON cornhill_school.academic_terms
FOR EACH ROW EXECUTE FUNCTION cornhill_school.record_academic_period_audit_event();
CREATE TRIGGER academic_period_audit_events_append_only
BEFORE UPDATE OR DELETE ON cornhill_school.academic_period_audit_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_academic_period_audit_mutation();
CREATE OR REPLACE FUNCTION cornhill_school.guard_academic_term_year_dates()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school AS $function$
DECLARE year_starts_on date; year_ends_on date; year_status text;
BEGIN
 SELECT starts_on,ends_on,status INTO year_starts_on,year_ends_on,year_status
 FROM cornhill_school.academic_years WHERE id=NEW.academic_year_id FOR KEY SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Academic year was not found' USING ERRCODE='foreign_key_violation';
 END IF;
 IF NEW.starts_on < year_starts_on OR NEW.ends_on > year_ends_on THEN
  RAISE EXCEPTION 'Academic term dates must fall within the selected academic year' USING ERRCODE='check_violation';
 END IF;
 IF NEW.status='Active' AND year_status <> 'Active' THEN
  RAISE EXCEPTION 'An active academic term requires an active academic year' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END;
$function$;
CREATE TRIGGER academic_term_year_dates_guard BEFORE INSERT ON cornhill_school.academic_terms
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_academic_term_year_dates();
REVOKE ALL ON TABLE cornhill_school.academic_period_audit_events FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.record_academic_period_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.prevent_academic_period_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_academic_term_year_dates() FROM PUBLIC;
GRANT INSERT (year_label,starts_on,ends_on,status,created_by_staff_id)
 ON cornhill_school.academic_years TO cornhill_auth_runtime;
GRANT INSERT (academic_year_id,term_number,term_name,starts_on,ends_on,status,created_by_staff_id)
 ON cornhill_school.academic_terms TO cornhill_auth_runtime;
GRANT SELECT ON cornhill_school.academic_period_audit_events TO cornhill_auth_runtime;
COMMIT;
