# CORNHILL Local Identity and Session Design

Status: database schema and server-side authorization/token helper foundations only; not connected to the running application.

## Separation of principals

- Staff accounts and guardian accounts are separate tables.
- Staff role assignments and staff role-to-permission grants are separate mappings.
- The permission catalog is seeded, but role-to-permission grants intentionally start empty.
- Staff class assignments are separately recorded and checked in addition to role permissions.
- Guardian access is a separate approved mapping to individual learner UUIDs.
- A guardian session cannot be represented as a staff session, or vice versa.
- The guardian API must require both an active guardian account and an approved guardian-to-learner mapping for every learner-specific request. A learner code alone is never sufficient.

## Credential and session handling

- Staff passwords and guardian PINs are constrained to Argon2id encoded hashes, never plaintext.
- A production Argon2id adapter has not yet been implemented or selected.
- Session bearer and CSRF tokens are generated as independent 256-bit opaque values; only SHA-256 hashes are intended to be stored.
- The raw session token must be returned once in a secure cookie and must never be written to logs.
- Cookies must be HttpOnly, Secure, SameSite, host-only and short-lived; the API must implement CSRF protection for state-changing cookie-authenticated requests.
- The API must enforce account status, expiry and revocation on every authenticated request.
- Login rate limiting must be enforced server-side using recent failed attempts; client-side throttling is not a security control.
- Identifier and source fingerprints in login_attempts must be keyed HMACs, not raw phone numbers, usernames or IP addresses.

## Authorisation

- Browser code does not receive database credentials and never connects directly to PostgreSQL.
- The local API must use a dedicated least-privilege database role. No table-wide generic CRUD endpoint is permitted.
- The permission catalog includes specific learner, academics, finance, staff, guardian and system capabilities.
- No role permissions are granted by default. A school-approved permission matrix is required before accounts can perform protected operations.
- Role names alone never authorise a workflow.
- Staff class-specific access requires a separate active class assignment.
- Parent/guardian routes are a separate API surface and may return only approved information for the learner(s) mapped to that guardian.
- High-risk actions (finance posting/reversal, marks publication, staff access changes, guardian approvals and payroll) require server-side permission checks and audit events.

## Audit and privacy

- Audit records capture event codes, outcome, actor/target identifiers and a correlation ID.
- Never log passwords, PINs, session tokens, OTPs, raw authentication headers, private learner documents or full payment credentials.
- Audit detail JSON must be allowlisted and minimised; it must not be a dump of request bodies.
- Retention and archival rules must be agreed before enabling real school data.

## Migration safety

- The SQL files under migrations/ are for a new local PostgreSQL database only. Neither has been run against Supabase or any production database.
- Legacy Supabase Auth user UUIDs can be recorded for controlled mapping, but the actual user export/import is a separate approved migration stage.
- Learner and class foreign keys are intentionally deferred until local learner/class schemas and UUID mappings have been validated.
- The current scaffold still has no login routes or school records. It remains loopback-only.

## Next implementation gates

1. Run migrations 001 and 002 against disposable PostgreSQL 17 and verify all eleven tables, constraints, 17 roles, 14 permission codes, zero role grants and no PUBLIC schema access.
2. Implement and test a vetted Argon2id password/PIN adapter, server-side login throttling, secure cookie handling and CSRF validation.
3. Implement repository methods that check approved guardian links and staff class assignments directly in PostgreSQL.
4. Agree a least-privilege permission matrix and only then design runtime database grants.
5. Add full HTTP/API integration tests before LAN exposure.
