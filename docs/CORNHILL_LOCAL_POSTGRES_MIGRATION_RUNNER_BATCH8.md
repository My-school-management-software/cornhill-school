# CORNHILL Local PostgreSQL Migration Runner — Batch 8

Date: 2026-11-13
Branch: feat/local-first-self-hosted-migration-20261113

## Implemented

- Loopback-only database configuration validation.
- PostgreSQL connection settings with bounded pool size/timeouts.
- Explicit migration opt-in flags and exact `cornhill_local` database-name guard.
- PostgreSQL advisory lock to prevent concurrent migration runs.
- SHA-256 migration checksums and a migration ledger.
- Repeat-run behavior: an already applied migration is skipped only when its checksum still matches.
- Destructive-operation guard for the current migration runner.
- Schema verification for eight identity tables, 17 staff roles, PUBLIC schema isolation and database constraints.
- GitHub Actions workflow with a disposable PostgreSQL 17 service to run the Node test suite, apply the migration, run it a second time, and verify the resulting database.

## Test results

**20 Node.js tests passed, 0 failed, 0 skipped** using Node.js v22.16.0. The tested modules and test cases were copied from the committed branch into an isolated temporary test harness. The tests cover configuration validation, loopback-only host rules, password length, migration checksums, transaction wrappers, destructive-operation rejection, ledger consistency and schema-verifier coverage.

The PostgreSQL integration workflow has been added, but its GitHub Actions run has not yet been confirmed. Therefore the SQL migration itself is still **not reported as executed or PostgreSQL-verified** in this batch.

## Safety controls

- The runner requires both `CORNHILL_ALLOW_LOCAL_MIGRATIONS=true` and `CORNHILL_DB_TARGET=local-development`.
- The configured host must be loopback.
- The database name must be exactly `cornhill_local`.
- The runner refuses to reapply a migration whose recorded checksum differs from the current file.
- No connection to Supabase or Vercel is made.
- No school records are copied or changed.
- The application server remains health-only and loopback-bound.

## Next gate

Confirm the GitHub Actions PostgreSQL integration run succeeds. Then create a separate least-privilege database role for the future application API; the current migration runner uses the local development administrator account and must not be reused as the runtime account.
