-- CORNHILL local learner admissions foundation.
-- Additive schema for a NEW isolated local database only.
-- This does not read, alter, or copy any live school records.
-- Existing admission codes must be preserved verbatim during a later rehearsed import.

BEGIN;

CREATE SCHEMA IF NOT EXISTS cornhill_school;
REVOKE ALL ON SCHEMA cornhill_school FROM PUBLIC;

CREATE SEQUENCE cornhill_school.pupil_code_sequence
    AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE OR REPLACE FUNCTION cornhill_school.generate_pupil_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, cornhill_school
AS $function$
    SELECT 'CH-' ||
           to_char(timezone('Africa/Kampala', clock_timestamp()), 'YYYY') ||
           '-' ||
           lpad(nextval('cornhill_school.pupil_code_sequence'::regclass)::text, 6, '0');
$function$;

REVOKE ALL ON FUNCTION cornhill_school.generate_pupil_code() FROM PUBLIC;
REVOKE ALL ON SEQUENCE cornhill_school.pupil_code_sequence FROM PUBLIC;

CREATE TABLE cornhill_school.classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    section text NOT NULL CHECK (section IN ('Nursery', 'Primary')),
    level_order smallint NOT NULL CHECK (level_order BETWEEN 1 AND 10),
    stream text NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT class_code_format CHECK (class_code ~ '^[A-Z0-9_-]{2,24}$'),
    CONSTRAINT class_display_name_nonempty CHECK (length(trim(display_name)) BETWEEN 1 AND 60),
    CONSTRAINT class_stream_length CHECK (length(stream) <= 40),
    CONSTRAINT class_section_level_consistent CHECK (
      (section = 'Nursery' AND level_order BETWEEN 1 AND 3)
      OR (section = 'Primary' AND level_order BETWEEN 4 AND 10)
    ),
    UNIQUE (display_name, stream)
);

INSERT INTO cornhill_school.classes (class_code, display_name, section, level_order)
VALUES
 ('BABY', 'Baby', 'Nursery', 1),
 ('MIDDLE', 'Middle', 'Nursery', 2),
 ('TOP', 'Top', 'Nursery', 3),
 ('P1', 'P.1', 'Primary', 4),
 ('P2', 'P.2', 'Primary', 5),
 ('P3', 'P.3', 'Primary', 6),
 ('P4', 'P.4', 'Primary', 7),
 ('P5', 'P.5', 'Primary', 8),
 ('P6', 'P.6', 'Primary', 9),
 ('P7', 'P.7', 'Primary', 10)
ON CONFLICT (class_code) DO NOTHING;

CREATE TABLE cornhill_school.learners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_record_id uuid UNIQUE,
    pupil_code text NOT NULL UNIQUE DEFAULT cornhill_school.generate_pupil_code(),
    lin text UNIQUE,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    gender text NOT NULL CHECK (gender IN ('Male', 'Female')),
    date_of_birth date,
    birth_year integer CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2200),
    class_id uuid REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
    admission_date date NOT NULL DEFAULT (timezone('Africa/Kampala', now()))::date,
    admission_year smallint NOT NULL DEFAULT
      (extract(year FROM timezone('Africa/Kampala', now())))::smallint,
    learner_type text NOT NULL DEFAULT 'Day' CHECK (learner_type IN ('Day', 'Boarding')),
    previous_school text,
    p7_index_number text,
    status text NOT NULL DEFAULT 'Active'
      CHECK (status IN ('Active', 'Inactive', 'Transferred', 'Withdrawn', 'Graduated', 'Archived')),
    is_bursary boolean NOT NULL DEFAULT false,
    bursary_fee_ugx bigint NOT NULL DEFAULT 0 CHECK (bursary_fee_ugx >= 0),
    bursary_category text,
    bursary_reason text,
    takes_breakfast boolean NOT NULL DEFAULT false,
    takes_lunch boolean NOT NULL DEFAULT false,
    photo_storage_key text,
    admission_complete boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    archive_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT learner_first_name_length CHECK (length(trim(first_name)) BETWEEN 1 AND 80),
    CONSTRAINT learner_middle_name_length CHECK (middle_name IS NULL OR length(trim(middle_name)) <= 80),
    CONSTRAINT learner_last_name_length CHECK (length(trim(last_name)) BETWEEN 1 AND 80),
    CONSTRAINT learner_lin_format CHECK (lin IS NULL OR length(trim(lin)) BETWEEN 1 AND 40),
    CONSTRAINT learner_index_format CHECK (p7_index_number IS NULL OR length(trim(p7_index_number)) <= 40),
    CONSTRAINT learner_bursary_consistency CHECK (is_bursary OR bursary_fee_ugx = 0),
    CONSTRAINT learner_archive_consistency CHECK (
      (status = 'Archived' AND archived_at IS NOT NULL)
      OR (status <> 'Archived')
    )
);

CREATE INDEX learners_class_status_idx
  ON cornhill_school.learners (class_id, status, last_name, first_name);
CREATE INDEX learners_name_search_idx
  ON cornhill_school.learners (lower(last_name), lower(first_name));
CREATE INDEX learners_lin_idx ON cornhill_school.learners (lin) WHERE lin IS NOT NULL;

CREATE FUNCTION cornhill_school.prevent_pupil_code_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF NEW.pupil_code IS DISTINCT FROM OLD.pupil_code THEN
    RAISE EXCEPTION 'Permanent pupil code cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER learners_pupil_code_immutable
BEFORE UPDATE OF pupil_code ON cornhill_school.learners
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_pupil_code_change();

CREATE TABLE cornhill_school.guardian_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    guardian_name text NOT NULL,
    relationship text,
    phone_e164 text,
    whatsapp_e164 text,
    email text,
    is_primary boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sms_opt_in boolean NOT NULL DEFAULT false,
    whatsapp_opt_in boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT guardian_name_length CHECK (length(trim(guardian_name)) BETWEEN 2 AND 140),
    CONSTRAINT guardian_phone_ug_format CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\\+256[0-9]{9}$'),
    CONSTRAINT guardian_whatsapp_ug_format CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\\+256[0-9]{9}$'),
    CONSTRAINT guardian_email_length CHECK (email IS NULL OR length(email) <= 254)
);

CREATE UNIQUE INDEX one_active_primary_guardian_per_learner
  ON cornhill_school.guardian_contacts (learner_id)
  WHERE is_active = true AND is_primary = true;

CREATE TABLE cornhill_school.enrolment_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    admission_date date NOT NULL,
    exit_date date,
    class_id uuid REFERENCES cornhill_school.classes(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'Active'
      CHECK (status IN ('Active', 'Withdrawn', 'Transferred', 'Completed')),
    exit_reason text,
    previous_period_id uuid REFERENCES cornhill_school.enrolment_periods(id) ON DELETE RESTRICT,
    created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT enrolment_exit_after_admission CHECK (exit_date IS NULL OR exit_date >= admission_date),
    CONSTRAINT enrolment_status_exit_consistent CHECK (
      (status = 'Active' AND exit_date IS NULL)
      OR (status <> 'Active' AND exit_date IS NOT NULL)
    )
);

CREATE UNIQUE INDEX one_active_enrolment_per_learner
  ON cornhill_school.enrolment_periods (learner_id)
  WHERE status = 'Active';

CREATE TABLE cornhill_school.admission_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    event_code text NOT NULL CHECK (event_code IN (
      'admitted', 'profile_updated', 'class_assigned', 'status_changed',
      'archived', 'restored', 're_admitted'
    )),
    actor_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    reason text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admission_events_learner_time_idx
  ON cornhill_school.admission_events (learner_id, occurred_at DESC);

CREATE TABLE cornhill_school.admission_enquiries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_name text NOT NULL CHECK (length(trim(learner_name)) BETWEEN 2 AND 140),
    class_applied text NOT NULL CHECK (length(trim(class_applied)) BETWEEN 2 AND 40),
    guardian_name text NOT NULL CHECK (length(trim(guardian_name)) BETWEEN 2 AND 140),
    guardian_phone text NOT NULL CHECK (length(regexp_replace(guardian_phone, '[^0-9+]', '', 'g')) BETWEEN 7 AND 18),
    guardian_email text CHECK (guardian_email IS NULL OR length(guardian_email) <= 254),
    contact_preference text NOT NULL DEFAULT 'Phone'
      CHECK (contact_preference IN ('Phone', 'SMS', 'Email')),
    message text NOT NULL DEFAULT '' CHECK (length(message) <= 1200),
    status text NOT NULL DEFAULT 'Pending'
      CHECK (status IN ('Pending', 'Contacted', 'Visit scheduled', 'Approved for admission', 'Registered', 'Not proceeding', 'Closed')),
    review_note text CHECK (review_note IS NULL OR length(review_note) <= 1200),
    reviewed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    reviewed_at timestamptz,
    learner_id uuid REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    registered_at timestamptz
);

CREATE INDEX admission_enquiries_status_time_idx
  ON cornhill_school.admission_enquiries (status, created_at DESC);

INSERT INTO cornhill_auth.permission_catalog (permission_code, category, description, high_risk)
VALUES
 ('admissions.enquiries_read', 'admissions', 'View and process school admission enquiries.', false),
 ('admissions.register_learner', 'admissions', 'Register a learner and issue a permanent pupil code.', true),
 ('admissions.archive_learner', 'admissions', 'Archive or restore a learner with an audit reason.', true),
 ('learners.guardians_manage', 'learners', 'Manage learner guardian contacts and communication consent.', true),
 ('learners.lin_manage', 'learners', 'Record or correct Ministry learner identification numbers.', true)
ON CONFLICT (permission_code) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC;

COMMIT;
