# CORNHILL Local Server — Initial Scaffold

This folder contains the isolated local-server foundation for the move away from hosted Vercel/Supabase dependencies.

## What is included

- A Node.js health-only HTTP server and local status page.
- A separate loopback-only HTTPS server and explicit `npm run start:auth` launcher; it is not started automatically.
- Automated tests for health routes, prototype warnings, unavailable routes and rejected write methods.
- Four additive local PostgreSQL migrations: identity/session tables, authorisation catalog and class scope, authentication rate-limit indexes, and a NOLOGIN least-privilege auth API database role.
- A permission catalog with no default role grants.
- Staff-to-class assignment records, guardian learner-scope checks and deny-by-default authorization helpers.
- An Argon2id adapter pinned to `@node-rs/argon2@2.2.2`.
- Staff/guardian authentication service, Argon2id adapter, session/CSRF tokens, secure cookie helpers, and an HTTPS-only authentication HTTP route handler.
- A local authentication runtime factory that verifies it connects as `cornhill_auth_api`, never the database administrator.
- PostgreSQL account, session, audit and transaction-locked login-attempt repositories.
- PostgreSQL permission, staff class-scope and guardian approved-learner-scope repositories.
- A disposable PostgreSQL integration verifier for concurrent login throttling, role grants, class/guardian scope and session create/revoke.
- A database-role verifier that checks exact column-level privileges and ensures the runtime role remains NOLOGIN.
- Loopback-only database connection configuration and an ordered checksum-tracked migration runner.
- GitHub Actions checks for Ubuntu/PostgreSQL integration and Windows unit tests.

Authentication routes are defined in `src/security/auth-http-handler.mjs` and are served only by the separate TLS server in `src/https-server.mjs`. The launcher refuses non-loopback bindings and checks the external certificate hostname/validity and private-key file permissions. The existing health-only HTTP server remains unchanged. The HTTPS launcher is not ready for live sign-in until all four PostgreSQL migrations, role/password provisioning, certificate trust and full integration tests are complete.

## Run the health-only scaffold

Use Node.js 22 or later.

From this folder:

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm start`.
4. Open http://127.0.0.1:4173 in the same computer.
5. Press Ctrl+C to stop the server.

The HTTP application intentionally remains health-only. Do not run `npm run start:auth` yet: the runtime DB login is deliberately disabled and the certificate/private runtime configuration has not been provisioned. When those gates pass, the separate command will serve HTTPS on loopback only.

## Database migration status

The SQL under migrations/ is for a brand-new local PostgreSQL database only. It has not yet been executed or verified against a running PostgreSQL instance in the development environment. It must pass the disposable PostgreSQL integration workflow before it is considered executable.

These files are not for the live Supabase project. Do not run them against production.

Migration 001 creates the isolated staff/guardian identity and session tables. Migration 002 creates the permission catalog and staff class assignments, with role permissions intentionally empty. Migration 003 adds indexes for account- and source-based failed-login throttling. Migration 004 creates a separate authentication runtime group and API role with column-level privileges only. Both roles remain NOLOGIN with no password set.

See [POSTGRES_LOCAL_SETUP.md](POSTGRES_LOCAL_SETUP.md) for the isolated PostgreSQL 17 development service and safe migration procedure.

## Important safety boundary

This is not yet the replacement school management system. It has no enabled production login routes, learner/staff data or school workflows. The route handler and runtime factory are foundations only and are not wired to the health-only server. The home page warns users not to enter real school information.

The server intentionally binds to loopback only. Do not change it to 0.0.0.0 or expose it to the school LAN. LAN operation must wait for wired authentication, role enforcement, HTTPS, backup/restore and the security acceptance tests.

The existing live CORNHILL PWA remains unchanged and continues to use its existing hosted services. This scaffold does not switch, migrate or copy any production data.
