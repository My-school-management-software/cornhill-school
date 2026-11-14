# Native PostgreSQL Development Service (Windows)

This is an isolated local migration/rehearsal database. It is not the live school database. The Windows installer uses the PostgreSQL 17 Windows service already installed on the computer; Docker Desktop is not required.

## Requirements

- Windows 10 version 2004 or newer, or Windows 11.
- Node.js 22 or newer and npm.
- PostgreSQL 17 Windows installation with Command Line Tools (`psql.exe` and `createdb.exe`) at `C:\Program Files\PostgreSQL\17\bin`.
- PostgreSQL service `postgresql-x64-17` running on localhost port 5432.

## Windows installer

From the repository's `local-server` directory, run:

```powershell
.\windows\Install-CORNHILL-Local.ps1 -RunTests
```

It installs pinned npm dependencies, creates or preserves a private `.env`, prompts securely for the PostgreSQL `postgres` password, creates a separate `cornhill_local_admin` login and an isolated `cornhill_local` database, applies numbered local migrations and runs all five database verifiers. The administrator password is not printed or written into command history. Generated local secrets are stored only in the ignored `.env` file.

The installer refuses to continue if a database named `cornhill_local` already exists. It will not overwrite or reset a database whose contents it has not inspected. Back up and review that database before any separate recovery procedure.

## Manual environment settings

The local PostgreSQL connection uses host `127.0.0.1`, port `5432`, database `cornhill_local`, and migration user `cornhill_local_admin`. Keep `.env` private. It is excluded by `.gitignore`; never commit it or paste its contents into chat. The authentication runtime role `cornhill_auth_api` and finance runtime role `cornhill_finance_api` remain NOLOGIN. The finance API stays disabled while `CORNHILL_DB_FINANCE_RUNTIME_PASSWORD` in the private `.env` is a placeholder. Do not activate either runtime role until API integration, HTTPS, private credential provisioning and full integration tests have passed.

## Migration and verification scope

The runner discovers all numbered SQL files present in `migrations`, applies them in numeric order, and records a SHA-256 checksum for each. It requires both explicit local-development flags, validates the loopback host and exact database name, and uses a PostgreSQL advisory lock. A changed already-applied migration causes a hard stop rather than a silent reapply.

The current numbered sequence is migrations 001-018. It includes local identity/session and authorization, learners/admissions, academics, UGX finance and payment posting/recovery, staff attendance/payroll governance, and the private financial evidence metadata/review foundation with actor-scoped file lookup. The current migration and PostgreSQL CI checks do not certify full parity with the hosted school system. The twelve files are **not yet certified as a complete copy of the hosted CORNHILL system**. The hosted project inventory still has to be reconciled object-by-object, including all source tables/columns, constraints, indexes, policies, routines, triggers, views, storage objects, edge functions, auth behavior, integrations and application call sites. Any provider-managed feature that cannot be migrated must be documented and safely replaced rather than silently omitted.

After migration, the installer runs `npm run db:verify`, `npm run db:verify-auth`, `npm run db:verify-runtime`, `npm run db:verify-school` and `npm run db:verify-finance`. A successful run proves only that the current local migrations and their checks pass. It does not prove that the full local school application, production data migration, LAN access, offline sync, backups, Android access or production security are ready.

## Stop and preserve data

Stop PostgreSQL only when you intend to shut down the local database:

```powershell
Stop-Service postgresql-x64-17
```

Start it again with:

```powershell
Start-Service postgresql-x64-17
```

Do not delete the PostgreSQL data directory or uninstall PostgreSQL as a troubleshooting step. Back up and verify local data before maintenance.

## Current limits

- The local Node server remains a health/status scaffold; the full school UI and API are not yet connected.
- The local HTTPS server includes authenticated staff, finance and (when separately configured) private evidence API routes. It remains loopback-only and is not enabled for school use or LAN/Android access.
- Authentication and finance runtime database credentials are not provisioned by the installer; runtime roles remain NOLOGIN until deliberately provisioned. A placeholder finance secret keeps finance HTTP routes disabled. The evidence API additionally requires CORNHILL_PRIVATE_EVIDENCE_PATH to point to an absolute private directory outside the repository. On Windows, startup applies an ACL that removes inherited permissions and grants full access only to the service account and SYSTEM; startup fails closed if that ACL cannot be applied.
- The database listens only on loopback and is not configured for LAN/Android access.
- Offline data synchronization, production backups/restore and real-data migration remain pending.
- Do not import real learner, guardian, staff, finance, attendance or payroll records yet.
- Do not disable the hosted CORNHILL service until feature parity, data reconciliation, security, backup/restore and acceptance testing pass and the school explicitly approves cutover.
