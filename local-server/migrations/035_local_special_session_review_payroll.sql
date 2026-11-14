-- CORNHILL special-session attendance review and approved payroll linkage.
-- Supports Director-configured evening preps, morning winters and Saturday studies.
-- Missing punches create review incidents only; no deduction is automatic.
BEGIN;

ALTER TABLE cornhill_school.staff_prep_sessions
  ADD COLUMN session_type text NOT NULL DEFAULT 'Evening Prep'
    CHECK (session_type IN ('Evening Prep','Morning Winter','Saturday Studies')),
  ADD COLUMN deduction_amount_ugx bigint NOT NULL DEFAULT 0
    CHECK (deduction_amount_ugx >= 0);

ALTER TABLE cornhill_school.staff_scheduled_session_attendance
  ADD COLUMN attendance_status text NOT NULL DEFAULT 'Scheduled'
    CHECK (attendance_status IN ('Scheduled','Present','Missed Clock In','Missed Clock Out','Excused','Deduction Approved'));

CREATE FUNCTION cornhill_school.ensure_special_session_attendance_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  INSERT INTO cornhill_school.staff_scheduled_session_attendance(session_id, staff_account_id)
  VALUES (NEW.prep_session_id, NEW.staff_account_id)
  ON CONFLICT (session_id, staff_account_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER special_session_assignment_attendance_row
AFTER INSERT ON cornhill_school.staff_prep_assignments
FOR EACH ROW EXECUTE FUNCTION cornhill_school.ensure_special_session_attendance_row();

INSERT INTO cornhill_school.staff_scheduled_session_attendance(session_id, staff_account_id)
SELECT prep_session_id, staff_account_id
FROM cornhill_school.staff_prep_assignments
ON CONFLICT (session_id, staff_account_id) DO NOTHING;

CREATE TABLE cornhill_school.staff_special_session_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_attendance_id uuid NOT NULL REFERENCES cornhill_school.staff_scheduled_session_attendance(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES cornhill_school.staff_prep_sessions(id) ON DELETE RESTRICT,
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  incident_type text NOT NULL CHECK (incident_type IN ('missed_clock_in','missed_clock_out')),
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Excused','Deduction Approved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  review_deadline_at timestamptz NOT NULL,
  headteacher_statement text,
  headteacher_statement_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  headteacher_statement_at timestamptz,
  director_decision text CHECK (director_decision IS NULL OR director_decision IN ('excused','deduct')),
  director_decision_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  director_decision_at timestamptz,
  approved_deduction_ugx bigint NOT NULL DEFAULT 0 CHECK (approved_deduction_ugx >= 0),
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT special_session_incident_review_deadline CHECK (review_deadline_at > detected_at - interval '1 minute'),
  CONSTRAINT special_session_incident_statement_metadata CHECK (
    (headteacher_statement IS NULL AND headteacher_statement_by IS NULL AND headteacher_statement_at IS NULL)
    OR (length(trim(headteacher_statement)) BETWEEN 8 AND 1500
      AND headteacher_statement_by IS NOT NULL AND headteacher_statement_at IS NOT NULL)
  ),
  CONSTRAINT special_session_incident_decision_metadata CHECK (
    (director_decision IS NULL AND director_decision_by IS NULL AND director_decision_at IS NULL
      AND status = 'Pending' AND approved_deduction_ugx = 0)
    OR (director_decision IS NOT NULL AND director_decision_by IS NOT NULL AND director_decision_at IS NOT NULL
      AND status IN ('Excused','Deduction Approved'))
  ),
  CONSTRAINT special_session_incident_decision_amount CHECK (
    (director_decision = 'deduct' AND status = 'Deduction Approved' AND approved_deduction_ugx > 0)
    OR (director_decision = 'excused' AND status = 'Excused' AND approved_deduction_ugx = 0)
    OR (director_decision IS NULL AND approved_deduction_ugx = 0)
  ),
  UNIQUE (session_attendance_id, incident_type)
);

CREATE INDEX special_session_incidents_pending_idx
  ON cornhill_school.staff_special_session_incidents(review_deadline_at)
  WHERE status = 'Pending' AND director_decision IS NULL;

CREATE FUNCTION cornhill_school.guard_special_session_incident_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  configured_deduction bigint;
  expected_staff_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.director_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Special-session incidents must be created pending and undecided'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.director_decision IS NOT NULL THEN
    RAISE EXCEPTION 'A decided special-session incident is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT sa.staff_account_id, ps.deduction_amount_ugx
    INTO expected_staff_id, configured_deduction
  FROM cornhill_school.staff_scheduled_session_attendance sa
  JOIN cornhill_school.staff_prep_sessions ps ON ps.id = sa.session_id
  WHERE sa.id = NEW.session_attendance_id
    AND sa.session_id = NEW.session_id
    AND ps.approval_status = 'Approved'
    AND ps.is_published = true;

  IF expected_staff_id IS NULL OR expected_staff_id <> NEW.staff_account_id THEN
    RAISE EXCEPTION 'Incident must belong to an assigned staff member in an approved and published session'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.director_decision IS NOT NULL THEN
    IF now() < NEW.review_deadline_at THEN
      RAISE EXCEPTION 'The special-session review window has not ended'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(btrim(NEW.headteacher_statement),'') IS NULL THEN
      RAISE EXCEPTION 'A Headteacher or DOS explanation is required before the Director decides'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.director_decision = 'deduct'
      AND (configured_deduction IS NULL OR configured_deduction <= 0
        OR NEW.approved_deduction_ugx <> configured_deduction) THEN
      RAISE EXCEPTION 'The approved deduction must match the Director-configured session amount'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.director_decision = 'excused' AND NEW.approved_deduction_ugx <> 0 THEN
      RAISE EXCEPTION 'An excused session cannot carry a salary deduction'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.director_decision_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER special_session_incident_decision_guard
BEFORE INSERT OR UPDATE ON cornhill_school.staff_special_session_incidents
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_special_session_incident_decision();

CREATE FUNCTION cornhill_school.detect_special_session_attendance_incidents(p_as_of timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  inserted_count integer := 0;
  affected_count integer := 0;
BEGIN
  INSERT INTO cornhill_school.staff_special_session_incidents
    (session_attendance_id, session_id, staff_account_id, incident_type, detected_at, review_deadline_at)
  SELECT sa.id, sa.session_id, sa.staff_account_id, 'missed_clock_in',
         p_as_of, ((ps.prep_date + ps.start_time) AT TIME ZONE 'Africa/Kampala') + interval '2 hours'
  FROM cornhill_school.staff_scheduled_session_attendance sa
  JOIN cornhill_school.staff_prep_sessions ps ON ps.id = sa.session_id
  WHERE ps.approval_status = 'Approved' AND ps.is_published = true
    AND sa.clock_in_at IS NULL
    AND p_as_of >= ((ps.prep_date + ps.start_time) AT TIME ZONE 'Africa/Kampala')
  ON CONFLICT (session_attendance_id, incident_type) DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  INSERT INTO cornhill_school.staff_special_session_incidents
    (session_attendance_id, session_id, staff_account_id, incident_type, detected_at, review_deadline_at)
  SELECT sa.id, sa.session_id, sa.staff_account_id, 'missed_clock_out',
         p_as_of, ((ps.prep_date + ps.end_time) AT TIME ZONE 'Africa/Kampala') + interval '2 hours'
  FROM cornhill_school.staff_scheduled_session_attendance sa
  JOIN cornhill_school.staff_prep_sessions ps ON ps.id = sa.session_id
  WHERE ps.approval_status = 'Approved' AND ps.is_published = true
    AND sa.clock_in_at IS NOT NULL AND sa.clock_out_at IS NULL
    AND p_as_of >= ((ps.prep_date + ps.end_time) AT TIME ZONE 'Africa/Kampala')
  ON CONFLICT (session_attendance_id, incident_type) DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  RETURN inserted_count;
END;
$function$;

CREATE TABLE cornhill_school.staff_special_session_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES cornhill_school.staff_special_session_incidents(id) ON DELETE RESTRICT,
  actor_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  event_code text NOT NULL CHECK (event_code IN ('incident.detected','explanation.submitted','decision.excused','decision.deduction_approved')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION cornhill_school.audit_special_session_incident_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO cornhill_school.staff_special_session_incident_events
      (incident_id, actor_staff_id, event_code, details)
    VALUES (NEW.id, NEW.staff_account_id, 'incident.detected',
      jsonb_build_object('incident_type', NEW.incident_type, 'review_deadline_at', NEW.review_deadline_at));
    RETURN NEW;
  END IF;
  IF NEW.headteacher_statement IS DISTINCT FROM OLD.headteacher_statement
    AND NEW.headteacher_statement IS NOT NULL THEN
    INSERT INTO cornhill_school.staff_special_session_incident_events
      (incident_id, actor_staff_id, event_code, details)
    VALUES (NEW.id, NEW.headteacher_statement_by, 'explanation.submitted',
      jsonb_build_object('statement', NEW.headteacher_statement));
  END IF;
  IF OLD.director_decision IS NULL AND NEW.director_decision IS NOT NULL THEN
    INSERT INTO cornhill_school.staff_special_session_incident_events
      (incident_id, actor_staff_id, event_code, details)
    VALUES (NEW.id, NEW.director_decision_by,
      CASE WHEN NEW.director_decision = 'excused' THEN 'decision.excused' ELSE 'decision.deduction_approved' END,
      jsonb_build_object('decision', NEW.director_decision, 'approved_deduction_ugx', NEW.approved_deduction_ugx));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER special_session_incident_audit
AFTER INSERT OR UPDATE ON cornhill_school.staff_special_session_incidents
FOR EACH ROW EXECUTE FUNCTION cornhill_school.audit_special_session_incident_changes();

CREATE FUNCTION cornhill_school.prevent_special_session_incident_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  RAISE EXCEPTION 'Special-session incident history is append-only'
    USING ERRCODE = 'check_violation';
END;
$function$;

CREATE TRIGGER special_session_incident_events_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.staff_special_session_incident_events
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_special_session_incident_event_mutation();

ALTER TABLE cornhill_school.payroll_line_items
  ADD COLUMN source_special_session_incident_id uuid
    REFERENCES cornhill_school.staff_special_session_incidents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_item_single_attendance_source CHECK (
    source_attendance_adjustment_id IS NULL OR source_special_session_incident_id IS NULL
  );

CREATE UNIQUE INDEX payroll_item_special_session_incident_unique
  ON cornhill_school.payroll_line_items(source_special_session_incident_id)
  WHERE source_special_session_incident_id IS NOT NULL;

CREATE OR REPLACE FUNCTION cornhill_school.validate_payroll_line_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  linked_adjustment_status text;
  run_status text;
  incident_staff_id uuid;
  incident_status text;
  incident_decision_by uuid;
  incident_deduction bigint;
  payroll_staff_id uuid;
BEGIN
  SELECT pr.run_status, pl.staff_account_id
    INTO run_status, payroll_staff_id
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id = pl.payroll_run_id
  WHERE pl.id = NEW.payroll_line_id
  FOR UPDATE OF pr;
  IF run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll items can only be added to a draft payroll run'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.source_attendance_adjustment_id IS NOT NULL THEN
    SELECT a.adjustment_status INTO linked_adjustment_status
    FROM cornhill_school.attendance_adjustments a
    WHERE a.id = NEW.source_attendance_adjustment_id;
    IF linked_adjustment_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'Attendance-related payroll adjustments require separate approval'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.source_special_session_incident_id IS NOT NULL THEN
    SELECT i.staff_account_id, i.status, i.director_decision_by, i.approved_deduction_ugx
      INTO incident_staff_id, incident_status, incident_decision_by, incident_deduction
    FROM cornhill_school.staff_special_session_incidents i
    WHERE i.id = NEW.source_special_session_incident_id
    FOR UPDATE;
    IF incident_status IS DISTINCT FROM 'Deduction Approved'
      OR incident_staff_id IS DISTINCT FROM payroll_staff_id
      OR NEW.item_type <> 'Deduction'
      OR NEW.amount_ugx <> incident_deduction
      OR NEW.approved_by_staff_id IS DISTINCT FROM incident_decision_by THEN
      RAISE EXCEPTION 'Payroll deduction must match the Director-approved special-session incident and staff member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('staff.special_session_review','staff','Submit Headteacher or DOS explanations for special-session attendance incidents.',true),
 ('staff.special_session_payroll_link','staff','Link Director-approved special-session deductions to draft payroll.',true)
ON CONFLICT(permission_code) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC;

COMMIT;
