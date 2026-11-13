# CORNHILL Local Identity Foundation — Batch 5 Review

Date: 2026-11-13
Branch: feat/local-first-self-hosted-migration-20261113

## Added to the isolated local-server project

- `migrations/001_local_identity_foundation.sql`
- `IDENTITY_SECURITY_DESIGN.md`
- `test/identity-migration.test.mjs`

The schema creates a separate `cornhill_auth` namespace for:
- Staff accounts and controlled staff role assignments.
- Separate guardian accounts.
- Explicit guardian-to-learner approval mappings.
- Separate staff and guardian sessions.
- Login-attempt fingerprints for server-side throttling.
- Correlated security audit events.

Credential columns accept Argon2id encoded hashes only. Session token hashes are stored instead of raw bearer tokens. Guardian sessions cannot be represented as staff sessions. The learner foreign key is deliberately deferred until the local learner UUID mapping is validated.

## Review checks

Eight source-level assertions were run against the exact committed SQL and test file:

| Check | Result |
|---|---|
| Isolated schema and transaction boundaries | PASS |
| Argon2id-only password and PIN hash constraints | PASS |
| Guardian access approval metadata | PASS |
| Staff/guardian session separation | PASS |
| Session expiry, login-attempt index and audit correlation | PASS |
| No public/browser grants | PASS |
| Learner FK safely deferred | PASS |
| Seven automated test cases present | PASS |

Result: 8 PASS, 0 FAIL.

## What has not yet been tested

This development environment has Node.js 22 but does not have PostgreSQL or Docker installed. Therefore the SQL has **not** been executed against a PostgreSQL instance, and the new Node test file has not yet been run with `npm test` in a local checkout. These source-level checks do not replace PostgreSQL migration testing.

Next verification gate:
1. Create a disposable PostgreSQL 17 test instance on a development machine.
2. Apply this migration only to that disposable database.
3. Test valid and invalid inserts against every CHECK and foreign-key constraint.
4. Confirm the API database role receives only the exact grants needed.
5. Run the Node test suite and add database integration tests.

## Safety boundary

No database was created or modified by this batch. The SQL has not been run against Supabase. No user credentials or school data were exported. The live CORNHILL PWA remains unchanged. The local server remains loopback-only and health-only; it has no login implementation or database connection yet.
