# Local PostgreSQL Development Service

This is a disposable-development foundation for the CORNHILL migration. It is not the live school database.

## Requirements

- Docker Engine with Docker Compose v2, or Docker Desktop on Windows.
- A development computer with enough disk space for a PostgreSQL data volume.

Docker is optional at this stage. If it is not already installed, do not interrupt the working CORNHILL PWA or install software on the school computer without the school's normal approval.

## Prepare local settings

1. Copy `.env.example` to `.env` in this folder.
2. Replace `CORNHILL_DB_ADMIN_PASSWORD` with a newly generated, long random password.
3. Keep `.env` private. It is excluded by `.gitignore`; never commit it or paste its contents into chat.

## Start the database

From the `local-server` directory, run:

```powershell
docker compose up -d database
docker compose ps
docker compose logs --tail 50 database
```

The PostgreSQL container publishes port 54329 only on 127.0.0.1. It is not directly accessible from other computers or Android phones. The database data is stored in the named Docker volume `cornhill-local-postgres-data`.

The configured timezone is Africa/Kampala. Store timestamps consistently as timestamptz and convert them for display in the school application.

## Apply all local migrations

From this folder, after starting the database:

```powershell
npm install
$env:CORNHILL_ALLOW_LOCAL_MIGRATIONS = "true"
$env:CORNHILL_DB_TARGET = "local-development"
npm run db:migrate
Remove-Item Env:CORNHILL_ALLOW_LOCAL_MIGRATIONS
Remove-Item Env:CORNHILL_DB_TARGET
```

The runner discovers all numbered SQL migration files, applies them in numeric order, and records a SHA-256 checksum for each one. It refuses to start unless both explicit local-development flags are set. It validates the loopback database host, exact `cornhill_local` database name, and database password configuration. It uses a PostgreSQL advisory lock. If an already-applied migration file changes, it stops rather than silently reapplying it. Running the command again verifies checksums and leaves an up-to-date database unchanged.

Migration 001 creates the isolated staff/guardian identity and session tables. Migration 002 creates the permission catalog and staff class assignments. Migration 003 adds failed-login rate-limit indexes. Migration 004 creates the separate `cornhill_auth_runtime` NOLOGIN group and the `cornhill_auth_api` NOLOGIN role, with limited column-level database grants. Migration 005 creates the isolated `cornhill_school` schema for classes, learners, guardian contacts, enrolment periods, admission audit events and admission enquiries. It seeds Baby, Middle, Top and P.1–P.7; generates unique permanent `CH-YYYY-NNNNNN` pupil codes; prevents pupil-code changes; stores LIN separately with a uniqueness constraint; and adds admission-related permissions without assigning them to any staff role. It does not import live records or enable school-data routes.

The migration runner and test verifiers use the development administrator account from `.env`. The separate `cornhill_auth_api` role is created with NOLOGIN, no password, no superuser attributes and explicit column-level privileges. Sequence usage is granted only for generated authentication attempt and audit-event IDs. Do not enable LOGIN or set a runtime password until the API wiring, private credential storage and full integration tests have passed. The local API must use `CORNHILL_DB_RUNTIME_USER` and `CORNHILL_DB_RUNTIME_PASSWORD`, never the administrator account. Do not enable sign-in until HTTPS is configured and the HTTP authentication routes have been integrated and tested.

## Verify the installed schema

After all five migrations succeed, run:

```powershell
npm run db:verify
```

This checks the eleven identity/authorization tables, 17 seeded staff roles, 19 permission codes, zero role grants, both rate-limit indexes, schema isolation from PUBLIC and database constraints. Then run `npm run db:verify-auth` to exercise PostgreSQL authentication repositories, including concurrent throttling, default-deny permissions, class assignment revocation, guardian learner-link approval/revocation and atomic session creation/revocation. Finally run `npm run db:verify-runtime` to confirm the auth API role remains NOLOGIN, non-privileged and limited to the intended columns. Run `npm run db:verify-school` to verify the six local learner/admissions tables, ten seeded classes, generated and immutable pupil codes, LIN uniqueness, guardian constraints and single-active-enrolment rule.

## Stop and preserve data

```powershell
docker compose stop database
```

This stops the service but preserves the database volume.

Do not run `docker compose down -v`: the `-v` option deletes the named database volume and its contents.

## Current limits

- This container is for development and migration rehearsal only.
- The HTTPS authentication server factory and launcher exist but are not started; the health-only Node server remains separate.
- The SQL migrations are verified in the disposable GitHub Actions PostgreSQL integration environment; they have not yet been applied to the school computer's local PostgreSQL instance.
- The authentication API database roles exist but remain NOLOGIN; no runtime password has been provisioned.
- It is not configured for LAN access, remote access, backups or production operation. The HTTPS launcher is loopback-only.
- Do not import real learner, guardian, staff or finance records.

The next gate is to start this isolated database, apply all four migrations, and verify the constraints, permissions, repository behavior and restricted runtime role. Only after that should an administrator securely provision the runtime login, and only when HTTPS and the API integration are ready.
