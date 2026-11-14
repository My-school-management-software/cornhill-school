-- CORNHILL local staff, attendance, device-import and payroll foundation.
-- Additive migration for the isolated local database only. No biometric templates are stored.

BEGIN;

CREATE TABLE cornhill_school.staff_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_account_id uuid NOT NULL UNIQUE REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    staff_number text NOT NULL UNIQUE,
    legal_name text NOT NULL,
    preferred_name text,
    job_title text NOT NULL,
    department text,
    phone_e164 text,
    email text,
    employment_status text NOT NULL DEFAULT 'Active'
      CHECK (employment_status IN ('Active', 'On Leave', 'Suspended', 'Exited')),
    hired_on date,
    exited_on date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_number_format CHECK (staff_number ~ '^[A-Z0-9_-]{2,30}$'),
    CONSTRAINT staff_legal_name_length CHECK (length(trim(legal_name)) BETWEEN 2 AND 160),
    CONSTRAINT staff_job_title_length CHECK (length(trim(job_title)) BETWEEN 2 AND 100),
    CONSTRAINT staff_phone_ug_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+256[0-9]{9}$'),
    CONSTRAINT staff_email_length CHECK (email IS NULL OR length(email) <= 254),
    CONSTRAINT staff_employment_dates_valid CHECK (exited_on IS NULL OR (hired_on IS NOT NULL AND exited_on >= hired_on)),
    CONSTRAINT staff_exit_status_consistent CHECK (
      (employment_status = 'Exited' AND exited_on IS NOT NULL)
      OR employment_status <> 'Exited'
    )
);

CREATE TABLE cornhill_school.staff_employment_terms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    starts_on date NOT NULL,
    ends_on date,
    contract_type text NOT NULL CHECK (contract_type IN ('Permanent', 'Contract', 'Temporary', 'Part Time', 'Casual')),
    salary_basis text NOT NULL CHECK (salary_basis IN ('Monthly', 'Daily', 'Hourly', 'Fixed')),
    base_salary_ugx bigint NOT NULL CHECK (base_salary_ugx >= 0),
    payment_frequency text NOT NULL DEFAULT 'Monthly' CHECK (payment_frequency IN ('Monthly', 'Fortnightly', 'Weekly')),
    expected_minutes_per_day smallint NOT NULL DEFAULT 480 CHECK (expected_minutes_per_day BETWEEN 60 AND 960),
    working_days_per_week smallint NOT NULL DEFAULT 5 CHECK (working_days_per_week BETWEEN 1 AND 7),
    approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT employment_term_dates_valid CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX staff_employment_terms_staff_dates_idx
  ON cornhill_school.staff_employment_terms (staff_account_id, starts_on DESC);

CREATE TABLE cornhill_school.attendance_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code text NOT NULL UNIQUE,
    device_name text NOT NULL,
    manufacturer text,
    model text,
    serial_number text,
    connection_type text NOT NULL CHECK (connection_type IN ('USB', 'LAN', 'Manual Import')),
    device_location text,
    device_status text NOT NULL DEFAULT 'Planned' CHECK (device_status IN ('Planned', 'Active', 'Maintenance', 'Retired')),
    last_import_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_device_code_format CHECK (device_code ~ '^[A-Z0-9_-]{2,32}$'),
    CONSTRAINT attendance_device_name_length CHECK (length(trim(device_name)) BETWEEN 2 AND 100)
);

CREATE TABLE cornhill_school.attendance_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid REFERENCES cornhill_school.attendance_devices(id) ON DELETE RESTRICT,
    source_name text NOT NULL,
    source_checksum_sha256 varchar(64) NOT NULL,
    imported_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    rows_received integer NOT NULL DEFAULT 0 CHECK (rows_received >= 0),
    rows_accepted integer NOT NULL DEFAULT 0 CHECK (rows_accepted >= 0),
    rows_rejected integer NOT NULL DEFAULT 0 CHECK (rows_rejected >= 0),
    import_status text NOT NULL DEFAULT 'Pending' CHECK (import_status IN ('Pending', 'Processing', 'Completed', 'Failed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    error_summary text,
    CONSTRAINT attendance_import_checksum_valid CHECK (source_checksum_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT attendance_import_counts_valid CHECK (rows_accepted + rows_rejected <= rows_received),
    CONSTRAINT attendance_import_completion_valid CHECK (
      (import_status IN ('Completed', 'Failed') AND completed_at IS NOT NULL)
      OR (import_status IN ('Pending', 'Processing') AND completed_at IS NULL)
    ),
    UNIQUE (device_id, source_checksum_sha256)
);

CREATE TABLE cornhill_school.attendance_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id uuid REFERENCES cornhill_school.attendance_import_batches(id) ON DELETE RESTRICT,
    device_id uuid REFERENCES cornhill_school.attendance_devices(id) ON DELETE RESTRICT,
    staff_account_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    device_staff_identifier text,
    external_event_id text,
    event_type text NOT NULL CHECK (event_type IN ('Clock In', 'Clock Out', 'Break Start', 'Break End', 'Unknown')),
    occurred_at timestamptz NOT NULL,
    source_type text NOT NULL CHECK (source_type IN ('Device', 'Manual')),
    review_status text NOT NULL DEFAULT 'Pending' CHECK (review_status IN ('Pending', 'Verified', 'Rejected')),
    reviewed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_event_review_consistent CHECK (
      (review_status = 'Pending' AND reviewed_by_staff_id IS NULL AND reviewed_at IS NULL)
      OR (review_status IN ('Verified', 'Rejected') AND reviewed_by_staff_id IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT attendance_event_device_source_consistent CHECK (
      (source_type = 'Device' AND device_id IS NOT NULL)
      OR (source_type = 'Manual')
    )
);

CREATE UNIQUE INDEX attendance_external_event_unique
  ON cornhill_school.attendance_events (device_id, external_event_id)
  WHERE external_event_id IS NOT NULL;
CREATE INDEX attendance_events_staff_time_idx
  ON cornhill_school.attendance_events (staff_account_id, occurred_at DESC);
CREATE INDEX attendance_events_review_idx
  ON cornhill_school.attendance_events (review_status, occurred_at);

CREATE TABLE cornhill_school.attendance_days (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    work_date date NOT NULL,
    first_clock_in timestamptz,
    last_clock_out timestamptz,
    expected_minutes smallint NOT NULL DEFAULT 480 CHECK (expected_minutes BETWEEN 0 AND 960),
    worked_minutes smallint NOT NULL DEFAULT 0 CHECK (worked_minutes BETWEEN 0 AND 1440),
    attendance_status text NOT NULL CHECK (attendance_status IN ('Present', 'Absent', 'Late', 'Half Day', 'Leave', 'Rest Day', 'Pending Review')),
    calculation_source text NOT NULL DEFAULT 'Manual' CHECK (calculation_source IN ('Verified Device Events', 'Manual', 'Approved Adjustment')),
    verified_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    verified_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (staff_account_id, work_date),
    CONSTRAINT attendance_clock_order CHECK (last_clock_out IS NULL OR first_clock_in IS NULL OR last_clock_out >= first_clock_in),
    CONSTRAINT attendance_verification_consistent CHECK (
      (verified_by_staff_id IS NULL AND verified_at IS NULL)
      OR (verified_by_staff_id IS NOT NULL AND verified_at IS NOT NULL)
    )
);

CREATE TABLE cornhill_school.attendance_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_day_id uuid NOT NULL REFERENCES cornhill_school.attendance_days(id) ON DELETE RESTRICT,
    adjustment_type text NOT NULL CHECK (adjustment_type IN ('Clock Time', 'Status', 'Worked Minutes', 'Leave')),
    proposed_value jsonb NOT NULL CHECK (jsonb_typeof(proposed_value) = 'object'),
    reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
    requested_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    adjustment_status text NOT NULL DEFAULT 'Pending' CHECK (adjustment_status IN ('Pending', 'Approved', 'Rejected')),
    approved_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attendance_adjustment_separation CHECK (
      (adjustment_status = 'Pending' AND approved_by_staff_id IS NULL AND approved_at IS NULL)
      OR (adjustment_status IN ('Approved', 'Rejected') AND approved_by_staff_id IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CONSTRAINT attendance_adjustment_two_person CHECK (
      adjustment_status <> 'Approved' OR approved_by_staff_id <> requested_by_staff_id
    )
);

CREATE TABLE cornhill_school.payroll_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    period_code text NOT NULL UNIQUE,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    payment_date date,
    period_status text NOT NULL DEFAULT 'Open' CHECK (period_status IN ('Open', 'Closed', 'Archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payroll_period_dates_valid CHECK (ends_on >= starts_on),
    CONSTRAINT payroll_period_code_format CHECK (period_code ~ '^[A-Z0-9_-]{4,24}$')
);

CREATE TABLE cornhill_school.payroll_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_period_id uuid NOT NULL UNIQUE REFERENCES cornhill_school.payroll_periods(id) ON DELETE RESTRICT,
    run_status text NOT NULL DEFAULT 'Draft' CHECK (run_status IN ('Draft', 'Reviewed', 'Approved', 'Posted', 'Reversed')),
    prepared_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    reviewed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    approved_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    posted_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    status_reason text,
    prepared_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    approved_at timestamptz,
    posted_at timestamptz,
    reversed_at timestamptz,
    CONSTRAINT payroll_run_approval_separation CHECK (
      approved_by_staff_id IS NULL OR approved_by_staff_id <> prepared_by_staff_id
    ),
    CONSTRAINT payroll_run_status_metadata CHECK (
      (run_status = 'Draft' AND reviewed_by_staff_id IS NULL AND approved_by_staff_id IS NULL AND posted_by_staff_id IS NULL)
      OR (run_status = 'Reviewed' AND reviewed_by_staff_id IS NOT NULL AND approved_by_staff_id IS NULL AND posted_by_staff_id IS NULL)
      OR (run_status = 'Approved' AND reviewed_by_staff_id IS NOT NULL AND approved_by_staff_id IS NOT NULL AND posted_by_staff_id IS NULL)
      OR (run_status = 'Posted' AND reviewed_by_staff_id IS NOT NULL AND approved_by_staff_id IS NOT NULL AND posted_by_staff_id IS NOT NULL)
      OR (run_status = 'Reversed' AND reviewed_by_staff_id IS NOT NULL AND approved_by_staff_id IS NOT NULL AND posted_by_staff_id IS NOT NULL AND reversed_at IS NOT NULL)
    ),
    CONSTRAINT payroll_run_reason_required CHECK (
      run_status <> 'Reversed' OR length(trim(status_reason)) BETWEEN 5 AND 500
    )
);

CREATE FUNCTION cornhill_school.validate_payroll_run_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF NEW.run_status = OLD.run_status THEN
    RETURN NEW;
  END IF;
  IF OLD.run_status = 'Draft' AND NEW.run_status = 'Reviewed' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  ELSIF OLD.run_status = 'Reviewed' AND NEW.run_status = 'Approved' THEN
    IF NEW.approved_by_staff_id IS NULL OR NEW.approved_by_staff_id = NEW.prepared_by_staff_id THEN
      RAISE EXCEPTION 'Payroll approval must be performed by someone other than the preparer'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  ELSIF OLD.run_status = 'Approved' AND NEW.run_status = 'Posted' THEN
    NEW.posted_at := COALESCE(NEW.posted_at, now());
  ELSIF OLD.run_status = 'Posted' AND NEW.run_status = 'Reversed' THEN
    IF NEW.status_reason IS NULL OR length(trim(NEW.status_reason)) < 5 THEN
      RAISE EXCEPTION 'Payroll reversal requires an audit reason'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.reversed_at := COALESCE(NEW.reversed_at, now());
  ELSE
    RAISE EXCEPTION 'Invalid payroll status transition'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_run_status_transition
BEFORE UPDATE OF run_status ON cornhill_school.payroll_runs
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_payroll_run_transition();

CREATE TABLE cornhill_school.payroll_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id uuid NOT NULL REFERENCES cornhill_school.payroll_runs(id) ON DELETE RESTRICT,
    staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    base_salary_ugx bigint NOT NULL CHECK (base_salary_ugx >= 0),
    allowances_ugx bigint NOT NULL DEFAULT 0 CHECK (allowances_ugx >= 0),
    deductions_ugx bigint NOT NULL DEFAULT 0 CHECK (deductions_ugx >= 0),
    gross_pay_ugx bigint GENERATED ALWAYS AS (base_salary_ugx + allowances_ugx) STORED,
    net_pay_ugx bigint GENERATED ALWAYS AS (base_salary_ugx + allowances_ugx - deductions_ugx) STORED,
    currency char(3) NOT NULL DEFAULT 'UGX' CHECK (currency = 'UGX'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (payroll_run_id, staff_account_id),
    CONSTRAINT payroll_line_nonnegative_net CHECK (base_salary_ugx + allowances_ugx >= deductions_ugx)
);

CREATE FUNCTION cornhill_school.prevent_non_draft_payroll_line_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  target_run_id uuid;
  run_status text;
BEGIN
  target_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  SELECT pr.run_status INTO run_status
  FROM cornhill_school.payroll_runs pr
  WHERE pr.id = target_run_id
  FOR UPDATE;
  IF run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll lines can only be changed while the payroll run is a draft'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_line_draft_only
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.payroll_lines
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_non_draft_payroll_line_changes();

CREATE TABLE cornhill_school.payroll_line_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_line_id uuid NOT NULL REFERENCES cornhill_school.payroll_lines(id) ON DELETE RESTRICT,
    item_type text NOT NULL CHECK (item_type IN ('Allowance', 'Deduction')),
    item_code text NOT NULL,
    description text NOT NULL,
    amount_ugx bigint NOT NULL CHECK (amount_ugx > 0),
    source_attendance_adjustment_id uuid REFERENCES cornhill_school.attendance_adjustments(id) ON DELETE RESTRICT,
    created_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    approved_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payroll_item_approval_separation CHECK (approved_by_staff_id <> created_by_staff_id),
    CONSTRAINT payroll_item_code_format CHECK (item_code ~ '^[A-Z0-9_-]{2,32}$'),
    CONSTRAINT payroll_item_description_length CHECK (length(trim(description)) BETWEEN 3 AND 240)
);

CREATE FUNCTION cornhill_school.validate_payroll_line_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  adjustment_status text;
  run_status text;
BEGIN
  SELECT pr.run_status INTO run_status
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id = pl.payroll_run_id
  WHERE pl.id = NEW.payroll_line_id
  FOR UPDATE OF pr;
  IF run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll items can only be added to a draft payroll run'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.source_attendance_adjustment_id IS NOT NULL THEN
    SELECT adjustment_status INTO adjustment_status
    FROM cornhill_school.attendance_adjustments
    WHERE id = NEW.source_attendance_adjustment_id;
    IF adjustment_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'Attendance-related payroll adjustments require separate approval'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_line_item_approval
BEFORE INSERT OR UPDATE ON cornhill_school.payroll_line_items
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_payroll_line_item();

CREATE FUNCTION cornhill_school.prevent_payroll_item_delete_after_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  run_status text;
BEGIN
  SELECT pr.run_status INTO run_status
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id = pl.payroll_run_id
  WHERE pl.id = OLD.payroll_line_id
  FOR UPDATE OF pr;
  IF run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll items can only be removed while the payroll run is a draft'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER payroll_item_draft_only_delete
BEFORE DELETE ON cornhill_school.payroll_line_items
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_payroll_item_delete_after_draft();

CREATE FUNCTION cornhill_school.assert_payroll_line_item_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  target_line_id uuid;
  line_allowances bigint;
  line_deductions bigint;
  item_allowances bigint;
  item_deductions bigint;
BEGIN
  IF TG_TABLE_NAME = 'payroll_lines' THEN
    target_line_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    target_line_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_line_id ELSE NEW.payroll_line_id END;
  END IF;
  SELECT allowances_ugx, deductions_ugx
    INTO line_allowances, line_deductions
  FROM cornhill_school.payroll_lines WHERE id = target_line_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT
    COALESCE(sum(amount_ugx) FILTER (WHERE item_type = 'Allowance'), 0),
    COALESCE(sum(amount_ugx) FILTER (WHERE item_type = 'Deduction'), 0)
  INTO item_allowances, item_deductions
  FROM cornhill_school.payroll_line_items
  WHERE payroll_line_id = target_line_id;

  IF item_allowances <> line_allowances OR item_deductions <> line_deductions THEN
    RAISE EXCEPTION 'Payroll line totals must match their approved allowance and deduction items'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER payroll_line_item_totals_valid
AFTER INSERT OR UPDATE ON cornhill_school.payroll_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION cornhill_school.assert_payroll_line_item_totals();

CREATE CONSTRAINT TRIGGER payroll_item_totals_valid
AFTER INSERT OR UPDATE OR DELETE ON cornhill_school.payroll_line_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION cornhill_school.assert_payroll_line_item_totals();

CREATE TABLE cornhill_school.payroll_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id uuid NOT NULL REFERENCES cornhill_school.payroll_runs(id) ON DELETE RESTRICT,
    actor_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    event_code text NOT NULL CHECK (event_code IN (
      'payroll.prepared', 'payroll.reviewed', 'payroll.approved',
      'payroll.posted', 'payroll.reversed', 'payroll.adjusted'
    )),
    reason text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payroll_audit_reason_length CHECK (reason IS NULL OR length(reason) <= 500)
);

INSERT INTO cornhill_auth.permission_catalog (permission_code, category, description, high_risk)
VALUES
 ('staff.profile_manage', 'staff', 'Create and maintain local staff employment profiles.', true),
 ('staff.attendance_import', 'staff', 'Import and verify staff attendance device events.', true),
 ('staff.attendance_adjust', 'staff', 'Request, review and approve attendance corrections.', true),
 ('staff.payroll_approve', 'staff', 'Review and approve payroll prepared by another authorised staff member.', true)
ON CONFLICT (permission_code) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC;

COMMIT;
