-- CORNHILL local identity foundation.
-- This migration is for a NEW, isolated local PostgreSQL database only.
-- Do not run against the live Supabase project.
-- No Supabase-specific roles or extensions are assumed.

BEGIN;

CREATE SCHEMA IF NOT EXISTS cornhill_auth;

REVOKE ALL ON SCHEMA cornhill_auth FROM PUBLIC;

CREATE TABLE cornhill_auth.staff_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_auth_user_id uuid UNIQUE,
    username text NOT NULL,
    username_normalized text NOT NULL UNIQUE,
    email text,
    email_normalized text UNIQUE,
    password_hash text NOT NULL,
    account_status text NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending', 'active', 'suspended', 'disabled')),
    must_change_password boolean NOT NULL DEFAULT true,
    password_changed_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_password_hash_argon2id
        CHECK (password_hash LIKE '$argon2id$%'),
    CONSTRAINT staff_username_nonempty CHECK (length(trim(username_normalized)) > 0),
    CONSTRAINT staff_email_normalized_nonempty
        CHECK (email_normalized IS NULL OR length(trim(email_normalized)) > 0)
);

CREATE TABLE cornhill_auth.staff_roles (
    role_code text PRIMARY KEY,
    display_name text NOT NULL,
    is_assignable boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_role_code_format CHECK (role_code ~ '^[a-z][a-z0-9_]{1,49}$')
);

INSERT INTO cornhill_auth.staff_roles (role_code, display_name) VALUES
    ('director', 'Director'),
    ('headteacher', 'Headteacher'),
    ('deputy_headteacher', 'Deputy Headteacher'),
    ('director_of_studies', 'Director of Studies'),
    ('bursar', 'Bursar'),
    ('deputy_bursar', 'Deputy Bursar'),
    ('teacher', 'Teacher'),
    ('class_teacher', 'Class Teacher'),
    ('upper_primary_teacher', 'Upper Primary Teacher'),
    ('lower_primary_teacher', 'Lower Primary Teacher'),
    ('nursery_head', 'Nursery Head'),
    ('matron', 'Matron'),
    ('patron', 'Patron'),
    ('senior_woman', 'Senior Woman'),
    ('senior_man', 'Senior Man'),
    ('store_manager', 'Store Manager'),
    ('cook', 'Cook')
ON CONFLICT (role_code) DO NOTHING;

CREATE TABLE cornhill_auth.staff_role_assignments (
    staff_account_id uuid NOT NULL
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    role_code text NOT NULL
        REFERENCES cornhill_auth.staff_roles(role_code) ON DELETE RESTRICT,
    assigned_by uuid
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_account_id, role_code)
);

CREATE TABLE cornhill_auth.guardian_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_auth_user_id uuid UNIQUE,
    guardian_name text NOT NULL,
    phone_e164 text NOT NULL UNIQUE,
    pin_hash text NOT NULL,
    account_status text NOT NULL DEFAULT 'pending'
        CHECK (account_status IN ('pending', 'active', 'suspended', 'disabled')),
    pin_changed_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT guardian_pin_hash_argon2id CHECK (pin_hash LIKE '$argon2id$%'),
    CONSTRAINT guardian_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

-- learner_id is intentionally a UUID without a foreign key in this foundation
-- migration. Add the FK only after the local learner table and its UUID mapping
-- have been validated in the separate data-migration rehearsal.
CREATE TABLE cornhill_auth.guardian_learner_access (
    guardian_account_id uuid NOT NULL
        REFERENCES cornhill_auth.guardian_accounts(id) ON DELETE RESTRICT,
    learner_id uuid NOT NULL,
    access_status text NOT NULL DEFAULT 'pending'
        CHECK (access_status IN ('pending', 'approved', 'revoked')),
    approved_by_staff_id uuid
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    approved_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (guardian_account_id, learner_id),
    CONSTRAINT guardian_access_approval_consistent CHECK (
        (access_status = 'approved' AND approved_by_staff_id IS NOT NULL AND approved_at IS NOT NULL)
        OR access_status <> 'approved'
    ),
    CONSTRAINT guardian_access_revocation_consistent CHECK (
        (access_status = 'revoked' AND revoked_at IS NOT NULL)
        OR access_status <> 'revoked'
    )
);

CREATE INDEX guardian_learner_access_learner_idx
    ON cornhill_auth.guardian_learner_access (learner_id, access_status);

CREATE TABLE cornhill_auth.auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_type text NOT NULL CHECK (principal_type IN ('staff', 'guardian')),
    staff_account_id uuid
        REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    guardian_account_id uuid
        REFERENCES cornhill_auth.guardian_accounts(id) ON DELETE RESTRICT,
    token_hash varchar(64) NOT NULL UNIQUE
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    csrf_token_hash varchar(64)
        CHECK (csrf_token_hash IS NULL OR csrf_token_hash ~ '^[0-9a-f]{64}$'),
    device_label text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT session_principal_matches CHECK (
        (principal_type = 'staff' AND staff_account_id IS NOT NULL AND guardian_account_id IS NULL)
        OR
        (principal_type = 'guardian' AND guardian_account_id IS NOT NULL AND staff_account_id IS NULL)
    ),
    CONSTRAINT session_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_staff_active_idx
    ON cornhill_auth.auth_sessions (staff_account_id, expires_at)
    WHERE principal_type = 'staff' AND revoked_at IS NULL;

CREATE INDEX auth_sessions_guardian_active_idx
    ON cornhill_auth.auth_sessions (guardian_account_id, expires_at)
    WHERE principal_type = 'guardian' AND revoked_at IS NULL;

CREATE TABLE cornhill_auth.login_attempts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    principal_type text NOT NULL CHECK (principal_type IN ('staff', 'guardian')),
    identifier_fingerprint varchar(64) NOT NULL
        CHECK (identifier_fingerprint ~ '^[0-9a-f]{64}$'),
    succeeded boolean NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    source_fingerprint varchar(64)
        CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE INDEX login_attempts_rate_limit_idx
    ON cornhill_auth.login_attempts
       (principal_type, identifier_fingerprint, attempted_at DESC);

CREATE TABLE cornhill_auth.security_audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_type text CHECK (actor_type IN ('staff', 'guardian', 'system')),
    actor_id uuid,
    event_code text NOT NULL,
    target_type text,
    target_id uuid,
    outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
    correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_event_code_nonempty CHECK (length(trim(event_code)) > 0),
    CONSTRAINT audit_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX security_audit_events_time_idx
    ON cornhill_auth.security_audit_events (occurred_at DESC);

CREATE INDEX security_audit_events_actor_idx
    ON cornhill_auth.security_audit_events (actor_type, actor_id, occurred_at DESC);

-- No application role grants are made here. The local API will connect using
-- a dedicated least-privilege database role, added only after route design.
-- Browser clients must never connect directly to this schema.

COMMIT;
