-- Supporting indexes for the local authentication attempt store.
-- New isolated local PostgreSQL database only; no production Supabase use.

BEGIN;

CREATE INDEX login_attempts_identifier_failures_idx
    ON cornhill_auth.login_attempts
       (principal_type, identifier_fingerprint, attempted_at DESC)
    WHERE succeeded = false;

CREATE INDEX login_attempts_source_failures_idx
    ON cornhill_auth.login_attempts
       (principal_type, source_fingerprint, attempted_at DESC)
    WHERE source_fingerprint IS NOT NULL AND succeeded = false;

COMMIT;