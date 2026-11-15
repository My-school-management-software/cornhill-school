-- CORNHILL local attendance governance and special-session foundation.
-- Forward-only migration. Director decisions are recorded; payroll deductions are never automatic.
BEGIN;

CREATE TABLE cornhill_school.staff_salary_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  salary_basis text NOT NULL CHECK (salary_basis IN ('Monthly','Yearly','Daily','Hourly','Fixed')),
  base_salary_ugx bigint NOT NULL CHECK (base_salary_ugx >= 0),
  daily_rate_ugx bigint CHECK (daily_rate_ugx IS NULL OR daily_rate_ugx >= 0),
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_agreement_dates_valid CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX staff_salary_agreements_effective_idx
  ON cornhill_school.staff_salary_agreements(staff_account_id,effective_from DESC);

CREATE TABLE cornhill_school.staff_work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_code text NOT NULL UNIQUE,
  schedule_name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  saturday_start_time time,
  saturday_end_time time,
  grace_minutes smallint NOT NULL DEFAULT 15 CHECK (grace_minutes BETWEEN 0 AND 180),
  weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_code_format CHECK (schedule_code ~ '^[A-Z0-9_-]{2,30}$'),
  CONSTRAINT schedule_name_length CHECK (length(trim(schedule_name)) BETWEEN 2 AND 100),
  CONSTRAINT schedule_weekdays_valid CHECK (
    cardinality(weekdays) BETWEEN 1 AND 7
    AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT schedule_saturday_times_valid CHECK (
    (saturday_start_time IS NULL AND saturday_end_time IS NULL)
    OR (saturday_start_time IS NOT NULL AND saturday_end_time IS NOT NULL AND saturday_end_time > saturday_start_time)
  )
);

CREATE TABLE cornhill_school.staff_attendance_schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  schedule_id uuid NOT NULL REFERENCES cornhill_school.staff_work_schedules(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  saturday_required boolean NOT NULL DEFAULT false,
  assigned_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_assignment_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX staff_schedule_assignments_staff_idx
  ON cornhill_school.staff_attendance_schedule_assignments(staff_account_id,starts_on DESC);

CREATE TABLE cornhill_school.staff_attendance_policy_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  review_window_minutes integer NOT NULL DEFAULT 120 CHECK (review_window_minutes BETWEEN 60 AND 360),
  sunday_paid_rest_day boolean NOT NULL DEFAULT true,
  saturday_start_time time NOT NULL DEFAULT '08:00',
  saturday_end_time time NOT NULL DEFAULT '15:00',
  prep_enabled boolean NOT NULL DEFAULT false,
  prep_deduction_ugx bigint NOT NULL DEFAULT 0 CHECK (prep_deduction_ugx >= 0),
  updated_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_policy_saturday_hours_valid CHECK (saturday_end_time > saturday_start_time)
);
INSERT INTO cornhill_school.staff_attendance_policy_settings(id) VALUES (true);

CREATE TABLE cornhill_school.staff_attendance_calendar_exceptions (
  attendance_date date PRIMARY KEY,
  exception_type text NOT NULL CHECK (exception_type IN ('public_holiday','school_closed','special_working_day')),
  is_working_day boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cornhill_school.staff_attendance_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_day_id uuid NOT NULL REFERENCES cornhill_school.attendance_days(id) ON DELETE RESTRICT,
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  incident_type text NOT NULL CHECK (incident_type IN ('missed_clock_in','late_clock_in','missed_clock_out','early_clock_out')),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Excused','Deduction Approved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  review_deadline_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  headteacher_statement text,
  headteacher_statement_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  headteacher_statement_at timestamptz,
  director_decision text CHECK (director_decision IS NULL OR director_decision IN ('excused','deduct')),
  director_decision_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  director_decision_at timestamptz,
  approved_deduction_ugx bigint NOT NULL DEFAULT 0 CHECK (approved_deduction_ugx >= 0),
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_statement_metadata CHECK (
    (headteacher_statement IS NULL AND headteacher_statement_by IS NULL AND headteacher_statement_at IS NULL)
    OR (length(trim(headteacher_statement)) BETWEEN 8 AND 1500 AND headteacher_statement_by IS NOT NULL AND headteacher_statement_at IS NOT NULL)
  ),
  CONSTRAINT incident_decision_metadata CHECK (
    (director_decision IS NULL AND director_decision_by IS NULL AND director_decision_at IS NULL
      AND status = 'Pending' AND approved_deduction_ugx = 0)
    OR (director_decision IS NOT NULL AND director_decision_by IS NOT NULL AND director_decision_at IS NOT NULL
      AND status IN ('Excused','Deduction Approved'))
  ),
  CONSTRAINT incident_decision_amount_consistent CHECK (
    (director_decision = 'deduct' AND status = 'Deduction Approved' AND approved_deduction_ugx > 0)
    OR (director_decision = 'excused' AND status = 'Excused' AND approved_deduction_ugx = 0)
    OR (director_decision IS NULL AND approved_deduction_ugx = 0)
  ),
  UNIQUE (attendance_day_id,incident_type)
);
CREATE INDEX attendance_incidents_pending_deadline_idx
  ON cornhill_school.staff_attendance_incidents(review_deadline_at)
  WHERE status = 'Pending' AND director_decision IS NULL;

CREATE FUNCTION cornhill_school.guard_attendance_incident_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.director_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Attendance incidents must be created pending and undecided'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.director_decision IS NOT NULL THEN
    RAISE EXCEPTION 'A decided attendance incident is immutable; use a separately audited correction workflow'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.director_decision IS NOT NULL THEN
    NEW.director_decision_at := now();
    IF now() < NEW.review_deadline_at THEN
      RAISE EXCEPTION 'The attendance review window has not ended'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.director_decision = 'deduct' AND NULLIF(btrim(NEW.headteacher_statement),'') IS NULL THEN
      RAISE EXCEPTION 'A Headteacher or DOS statement is required before a deduction decision'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.director_decision = 'deduct' AND NEW.approved_deduction_ugx >
      COALESCE((
        SELECT a.daily_rate_ugx
        FROM cornhill_school.staff_salary_agreements a
        WHERE a.staff_account_id = NEW.staff_account_id
          AND a.is_active
          AND a.effective_from <= NEW.attendance_date
          AND (a.effective_to IS NULL OR a.effective_to >= NEW.attendance_date)
        ORDER BY a.effective_from DESC,a.created_at DESC
        LIMIT 1
      ),0) THEN
      RAISE EXCEPTION 'Approved attendance deduction exceeds the configured daily rate'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER attendance_incident_decision_guard
BEFORE INSERT OR UPDATE ON cornhill_school.staff_attendance_incidents
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_attendance_incident_decision();

CREATE TABLE cornhill_school.staff_prep_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_date date NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
  start_time time NOT NULL,
  end_time time NOT NULL,
  class_name text NOT NULL CHECK (length(trim(class_name)) BETWEEN 1 AND 60),
  notes text,
  approval_status text NOT NULL DEFAULT 'Draft' CHECK (approval_status IN ('Draft','Approved','Cancelled')),
  is_published boolean NOT NULL DEFAULT false,
  director_approved_by uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  director_approved_at timestamptz,
  created_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_session_time_valid CHECK (end_time > start_time),
  CONSTRAINT prep_session_approval_metadata CHECK (
    (approval_status = 'Draft' AND is_published = false AND director_approved_by IS NULL AND director_approved_at IS NULL)
    OR (approval_status IN ('Approved','Cancelled') AND director_approved_by IS NOT NULL AND director_approved_at IS NOT NULL)
  )
);
CREATE INDEX staff_prep_sessions_date_idx ON cornhill_school.staff_prep_sessions(prep_date,start_time);

CREATE TABLE cornhill_school.staff_prep_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_session_id uuid NOT NULL REFERENCES cornhill_school.staff_prep_sessions(id) ON DELETE RESTRICT,
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  assigned_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prep_session_id,staff_account_id)
);
CREATE INDEX staff_prep_assignments_staff_idx
  ON cornhill_school.staff_prep_assignments(staff_account_id,prep_session_id);

CREATE TABLE cornhill_school.staff_scheduled_session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cornhill_school.staff_prep_sessions(id) ON DELETE RESTRICT,
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  clock_in_source text CHECK (clock_in_source IS NULL OR clock_in_source IN ('director_kiosk','manual_import')),
  clock_out_source text CHECK (clock_out_source IS NULL OR clock_out_source IN ('director_kiosk','manual_import')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_session_clock_order CHECK (clock_out_at IS NULL OR (clock_in_at IS NOT NULL AND clock_out_at >= clock_in_at)),
  CONSTRAINT scheduled_session_clock_source CHECK (
    (clock_in_at IS NULL AND clock_in_source IS NULL OR clock_in_at IS NOT NULL AND clock_in_source IS NOT NULL)
    AND (clock_out_at IS NULL AND clock_out_source IS NULL OR clock_out_at IS NOT NULL AND clock_out_source IS NOT NULL)
  ),
  UNIQUE(session_id,staff_account_id)
);

INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('staff.attendance_policy_manage','staff','Manage attendance schedules, calendar rules and review windows.',true),
 ('staff.attendance_incident_decide','staff','Record Director-approved attendance incident decisions.',true),
 ('staff.prep_session_manage','staff','Create and manage special staff preparation sessions.',true)
ON CONFLICT(permission_code) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC;
COMMIT;
