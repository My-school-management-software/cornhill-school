# CORNHILL Local Identity and Session Design

Status: isolated database schema, server-side authorization helpers, Argon2id adapter and PostgreSQL authentication repositories are implemented as development foundations. They are not connected to the running school application.

## Separation of principals

- Staff accounts and guardian accounts are separate tables.
- Staff role assignments and staff role-to-permission grants are separate mappings.
- The permission catalog is seeded, but role-to-permission grants intentionally start empty.
- Staff class assignments are separately recorded and checked in addition to role permissions.
- Guardian access is a separate approved mapping to individual learner UUIDs.
- A guardian session cannot be represented as a staff session, or vice versa.
- The guardian API must require both an active guardian account and an approved guardian-to-learner mapping for every learner-specific request. A learner code alone is never sufficient.

## Credential and session handling

- The Argon2id adapter uses the pinned `@node-rs/argon2` package and an OWASP baseline policy of 19,456 KiB memory, two passes and one lane.
- Staff passwords and guardian PINs are stored only as Argon2id encoded hashes.
- Session bearer and CSRF tokens are independent 256-bit opaque values; only SHA-256 hashes are stored.
- The session cookie is host-only, Secure, HttpOnly, Path=/ and SameSite=Strict. The Secure flag is not disabled for local development.
- State-changing requests, including logout, require the CSRF token.
- The API must enforce account status, expiry and revocation on every authenticated request.
- PostgreSQL sign-in throttling serializes attempts with transaction-scoped advisory locks on both account and source fingerprints. New attempts are recorded as failures until credential verification succeeds.
- Identifier and source fingerprints are keyed HMACs, not raw phone numbers, usernames or IP addresses. The HMAC secret must be a persistent private configuration value.

## Authorisation

- Browser code does not receive database credentials and never connects directly to PostgreSQL.
- The local API must use the dedicated `cornhill_auth_api` role, inheriting the NOLOGIN `cornhill_auth_runtime` privilege group. It has column-level privileges only and cannot change role grants or guardian links. No table-wide generic CRUD endpoint is permitted.
- Both roles remain NOLOGIN until a private password-provisioning step is approved. The role has only the sequence usage required for generated login-attempt and audit event IDs. The app must never connect using the database administrator account.
- The permission catalog includes specific learner, academics, finance, staff, guardian and system capabilities.
- No role permissions are granted by default. A school-approved permission matrix is required before accounts can perform protected operations.
- Role names alone never authorise a workflow.
- Staff class-specific access requires a separate active class assignment verified against the database. Explicit role permission grants are loaded separately from role names.
- Parent/guardian routes are a separate API surface. The PostgreSQL repository checks the active guardian account and exact approved guardian-to-learner mapping for each learner-specific request. A learner code alone is never sufficient.
- High-risk actions (finance posting/reversal, marks publication, staff access changes, guardian approvals and payroll) require server-side permission checks and audit events.

## Audit and privacy

- Audit records capture event codes, outcome, actor/target identifiers and a correlation ID.
- Never log passwords, PINs, session tokens, OTPs, raw authentication headers, private learner documents or payment credentials.
- Authentication attempt records contain keyed fingerprints, not raw identifiers or source addresses.
- Audit detail JSON must be allowlisted and minimised; it must not be a dump of request bodies.
- Retention and archival rules must be agreed before enabling real school data.

## Migration safety

- Migration files 001–003 are for a new local PostgreSQL database only. None has been run against Supabase or any production database.
- Legacy Supabase Auth user UUIDs can be recorded for controlled mapping, but the actual user export/import is a separate approved migration stage.
- Learner and class foreign keys are intentionally deferred until local learner/class schemas and UUID mappings have been validated.
- The local HTTP scaffold still has no login routes or school records. It remains loopback-only. The runtime DB role remains NOLOGIN and no runtime password is stored in source control.

## Next implementation gates

1. Run migrations 001–003 against disposable PostgreSQL 17 and confirm the full auth repository integration verifier passes.
2. Add a private, persistent HMAC fingerprint secret to local runtime configuration.
3. Wire Argon2id, auth repositories, cookies and CSRF into a loopback-only HTTP authentication API.
4. Design and test the least-privilege runtime DB account and the school-approved role-permission matrix.
5. Add guardian-approved-learner repository methods, full HTTP/API integration tests and HTTPS before LAN exposure.
