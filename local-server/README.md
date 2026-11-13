# CORNHILL Local Server — Initial Scaffold

This folder contains the isolated local-server foundation for the move away from hosted Vercel/Supabase dependencies.

## What is included

- A dependency-free Node.js health-only server.
- A local status page and read-only health endpoint.
- Automated tests for health routes, prototype warnings, unavailable routes and rejected write methods.
- A draft PostgreSQL identity foundation under migrations/001_local_identity_foundation.sql.
- An additive authorization foundation under migrations/002_local_authorization_foundation.sql.
- A permission catalog with no default role grants.
- Staff-to-class assignment records, guardian learner-scope checks and deny-by-default authorization helpers.
- Opaque session/CSRF token generation utilities.
- Loopback-only PostgreSQL connection configuration and a migration runner that applies all numbered SQL files in order with per-file checksums.
- A disposable PostgreSQL schema verifier and a GitHub Actions integration workflow.
- Security design notes for account separation, authorisation, audit and migration gates.

## Run the health-only scaffold

Use Node.js 22 or later.

From this folder:

1. Run npm test.
2. Run npm start.
3. Open http://127.0.0.1:4173 in the same computer.
4. Open http://127.0.0.1:4173/api/v1/health to inspect the health response.
5. Press Ctrl+C to stop the server.

You can select another local port with CORNHILL_LOCAL_PORT, for example 4180. The server still binds only to 127.0.0.1.

## Database migration status

The SQL under migrations/ is for a brand-new local PostgreSQL database only. It has not yet been executed or verified against a running PostgreSQL instance in this development environment. It must be validated against a disposable PostgreSQL instance before it is considered executable.

These files are not for the live Supabase project. Do not run them against production.

Migration 001 creates the isolated staff/guardian identity and session tables. Migration 002 creates the permission catalog and staff class assignments. It deliberately creates no role-to-permission grants and no application database grants. A school-approved permission matrix is required before protected workflows can be enabled.

See [POSTGRES_LOCAL_SETUP.md](POSTGRES_LOCAL_SETUP.md) for the isolated PostgreSQL 17 development service and safe migration procedure.

## Important safety boundary

This is not yet the replacement school management system. It has no live database connection, production login routes, learner/staff data or school workflows. The home page warns users not to enter real school data.

The server intentionally binds to loopback only. Do not change it to 0.0.0.0 or expose it to the school LAN. LAN operation must wait for a real authentication implementation, role enforcement, HTTPS, backup/restore and the security acceptance tests.

The existing live CORNHILL PWA remains unchanged and continues to use its existing hosted services. This scaffold does not switch, migrate or copy any production data.
