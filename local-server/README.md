# CORNHILL Local Server — Initial Scaffold

This folder contains the isolated local-server foundation for the move away from hosted Vercel/Supabase dependencies.

## What is included

- A Node.js health-only HTTP server and local status page.
- Automated tests for health routes, prototype warnings, unavailable routes and rejected write methods.
- Three additive local PostgreSQL migrations: identity/session tables, authorisation catalog and class scope, and authentication rate-limit indexes.
- A permission catalog with no default role grants.
- Staff-to-class assignment records, guardian learner-scope checks and deny-by-default authorization helpers.
- An Argon2id adapter pinned to `@node-rs/argon2@2.2.2`.
- Staff/guardian authentication service contracts, opaque session and CSRF tokens, and secure cookie helpers.
- PostgreSQL account, session, audit and transaction-locked login-attempt repositories.
- A disposable PostgreSQL integration verifier for concurrent login throttling and session create/revoke.
- Loopback-only database connection configuration and an ordered checksum-tracked migration runner.
- GitHub Actions checks for Ubuntu/PostgreSQL integration and Windows unit tests.

## Run the health-only scaffold

Use Node.js 22 or later.

From this folder:

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm start`.
4. Open http://127.0.0.1:4173 in the same computer.
5. Press Ctrl+C to stop the server.

The HTTP application intentionally remains health-only; the authentication modules are not yet wired into request routes.

## Database migration status

The SQL under migrations/ is for a brand-new local PostgreSQL database only. It has not yet been executed or verified against a running PostgreSQL instance in the development environment. It must pass the disposable PostgreSQL integration workflow before it is considered executable.

These files are not for the live Supabase project. Do not run them against production.

Migration 001 creates the isolated staff/guardian identity and session tables. Migration 002 creates the permission catalog and staff class assignments, with role permissions intentionally empty. Migration 003 adds indexes for account- and source-based failed-login throttling. No production role grants or runtime database account are created yet.

See [POSTGRES_LOCAL_SETUP.md](POSTGRES_LOCAL_SETUP.md) for the isolated PostgreSQL 17 development service and safe migration procedure.

## Important safety boundary

This is not yet the replacement school management system. It has no production login routes, learner/staff data or school workflows. The home page warns users not to enter real school information.

The server intentionally binds to loopback only. Do not change it to 0.0.0.0 or expose it to the school LAN. LAN operation must wait for wired authentication, role enforcement, HTTPS, backup/restore and the security acceptance tests.

The existing live CORNHILL PWA remains unchanged and continues to use its existing hosted services. This scaffold does not switch, migrate or copy any production data.
