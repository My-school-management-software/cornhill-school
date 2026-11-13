# CORNHILL Local Server — Initial Scaffold

This folder contains the first isolated local-server component for the move away from hosted Vercel/Supabase dependencies.

## What is included

- A dependency-free Node.js health-only server.
- A local status page.
- A read-only health endpoint at /api/v1/health.
- Automated tests for the health endpoint, prototype warning, unavailable routes and rejected write methods.
- A draft PostgreSQL identity foundation under migrations/001_local_identity_foundation.sql.
- Loopback-only PostgreSQL connection configuration and a guarded, checksum-tracked migration runner.
- A disposable PostgreSQL schema verifier and a GitHub Actions integration workflow.
- Identity/session security design notes.

## Run the health-only scaffold

Use Node.js 22 or later.

From this folder:

1. Run npm test.
2. Run npm start.
3. Open http://127.0.0.1:4173 in the same computer.
4. Open http://127.0.0.1:4173/api/v1/health to inspect the health response.
5. Press Ctrl+C in the terminal to stop the server.

You can select another local port with CORNHILL_LOCAL_PORT, for example 4180. The server still binds only to 127.0.0.1.

## Database migration status

The SQL under migrations/ is a design-stage migration for a brand-new local PostgreSQL database. It has not been run because a PostgreSQL test instance is not available in this development environment. It must be validated against a disposable PostgreSQL instance before it is considered executable.

It is not for the live Supabase project. Do not run it against production.

## Important safety boundary

This is not yet the school management system. It has no database connection, authentication, learner/staff data, finance or school workflows. The home page warns users not to enter real school data.

The server intentionally binds to loopback only. Do not change it to 0.0.0.0 or expose it to the school LAN. LAN operation must wait for local authentication, role enforcement, HTTPS and the security/backup acceptance tests.

The existing live CORNHILL PWA remains unchanged and continues to use its existing hosted services. This scaffold does not switch, migrate or copy any production data.


## PostgreSQL development database

See [POSTGRES_LOCAL_SETUP.md](POSTGRES_LOCAL_SETUP.md) for the loopback-only PostgreSQL 17 development service. It is optional and is not connected to the health-only server yet.
