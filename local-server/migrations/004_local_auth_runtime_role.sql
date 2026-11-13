-- CORNHILL dedicated authentication database role.
-- Intended only for the isolated local PostgreSQL database.
-- Both roles remain NOLOGIN until a private password is set on the local host.
-- This migration must never be run against the live Supabase project.

BEGIN;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cornhill_auth_runtime') THEN
        EXECUTE 'CREATE ROLE cornhill_auth_runtime NOLOGIN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'cornhill_auth_api') THEN
        EXECUTE 'CREATE ROLE cornhill_auth_api NOLOGIN INHERIT';
    END IF;
END
$roles$;

ALTER ROLE cornhill_auth_runtime
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

ALTER ROLE cornhill_auth_api
    NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT cornhill_auth_runtime TO cornhill_auth_api;
GRANT CONNECT ON DATABASE cornhill_local TO cornhill_auth_runtime;
REVOKE TEMPORARY ON DATABASE cornhill_local FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;

REVOKE ALL ON SCHEMA cornhill_auth FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
GRANT USAGE ON SCHEMA cornhill_auth TO cornhill_auth_runtime;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_auth
    FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cornhill_auth
    FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;

-- Staff credential lookup and last-login bookkeeping.
GRANT SELECT (id, username, username_normalized, password_hash, account_status)
    ON cornhill_auth.staff_accounts TO cornhill_auth_runtime;
GRANT UPDATE (last_login_at, updated_at)
    ON cornhill_auth.staff_accounts TO cornhill_auth_runtime;

-- Guardian PIN lookup and last-login bookkeeping.
GRANT SELECT (id, guardian_name, phone_e164, pin_hash, account_status)
    ON cornhill_auth.guardian_accounts TO cornhill_auth_runtime;
GRANT UPDATE (last_login_at, updated_at)
    ON cornhill_auth.guardian_accounts TO cornhill_auth_runtime;

-- Read-only role and class scope information. No permission grants can be
-- created or altered by the application authentication role.
GRANT SELECT (role_code, display_name, is_assignable)
    ON cornhill_auth.staff_roles TO cornhill_auth_runtime;
GRANT SELECT (staff_account_id, role_code)
    ON cornhill_auth.staff_role_assignments TO cornhill_auth_runtime;
GRANT SELECT (role_code, permission_code)
    ON cornhill_auth.staff_role_permissions TO cornhill_auth_runtime;
GRANT SELECT (permission_code, category, description, high_risk)
    ON cornhill_auth.permission_catalog TO cornhill_auth_runtime;
GRANT SELECT (staff_account_id, class_id, assignment_type, is_active)
    ON cornhill_auth.staff_class_assignments TO cornhill_auth_runtime;

-- Guardian scope may be read but never approved, revoked, inserted or changed
-- by the authentication API role.
GRANT SELECT (guardian_account_id, learner_id, access_status)
    ON cornhill_auth.guardian_learner_access TO cornhill_auth_runtime;

-- Session rows: create a session, read session metadata, revoke it. No delete.
GRANT SELECT (
    id, principal_type, staff_account_id, guardian_account_id, token_hash,
    csrf_token_hash, device_label, created_at, last_seen_at, expires_at, revoked_at
) ON cornhill_auth.auth_sessions TO cornhill_auth_runtime;
GRANT INSERT (
    principal_type, staff_account_id, guardian_account_id, token_hash,
    csrf_token_hash, created_at, last_seen_at, expires_at
) ON cornhill_auth.auth_sessions TO cornhill_auth_runtime;
GRANT UPDATE (revoked_at)
    ON cornhill_auth.auth_sessions TO cornhill_auth_runtime;

-- Login attempt throttling: read the rate-limit window, insert a new attempt,
-- and complete it by changing only its succeeded flag.
GRANT SELECT (
    id, principal_type, identifier_fingerprint, source_fingerprint,
    succeeded, attempted_at
) ON cornhill_auth.login_attempts TO cornhill_auth_runtime;
GRANT INSERT (
    principal_type, identifier_fingerprint, source_fingerprint,
    succeeded, attempted_at
) ON cornhill_auth.login_attempts TO cornhill_auth_runtime;
GRANT UPDATE (succeeded)
    ON cornhill_auth.login_attempts TO cornhill_auth_runtime;

GRANT INSERT (
    actor_type, actor_id, event_code, outcome, correlation_id, details
) ON cornhill_auth.security_audit_events TO cornhill_auth_runtime;

GRANT USAGE, SELECT ON SEQUENCE cornhill_auth.login_attempts_id_seq
    TO cornhill_auth_runtime;
GRANT USAGE, SELECT ON SEQUENCE cornhill_auth.security_audit_events_id_seq
    TO cornhill_auth_runtime;

-- Explicitly deny all mutation of the role/permission catalog and guardian
-- approval links. These remain controlled by a separate trusted admin flow.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON cornhill_auth.staff_roles,
       cornhill_auth.staff_role_assignments,
       cornhill_auth.staff_role_permissions,
       cornhill_auth.permission_catalog,
       cornhill_auth.staff_class_assignments,
       cornhill_auth.guardian_learner_access
    FROM cornhill_auth_runtime;

COMMIT;