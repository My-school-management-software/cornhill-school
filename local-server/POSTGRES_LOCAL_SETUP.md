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

Migration 001 creates the isolated staff/guardian identity and session tables. Migration 002 creates the permission catalog and staff class assignments. It deliberately creates no role-to-permission grants and no application database grants. It does not create staff or guardian logins, import records, or enable the application API.

The database connection currently uses the development administrator account from `.env`. Before any school data is introduced, a separate least-privilege runtime account must be designed and tested. The current migrations do not create one.

## Verify the installed schema

After both migrations succeed, run:

```powershell
npm run db:verify
```

This checks the expected eleven identity/authorization tables, 17 seeded staff roles, 14 permission codes, zero role grants, schema isolation from PUBLIC, and database constraints.

## Stop and preserve data

```powershell
docker compose stop database
```

This stops the service but preserves the database volume.

Do not run `docker compose down -v`: the `-v` option deletes the named database volume and its contents.

## Current limits

- This container is for development and migration rehearsal only.
- It has no connection to the local Node server yet.
- The SQL migrations have not yet been applied or verified against a running PostgreSQL instance.
- No API database role or restricted grants have been created.
- It is not configured for LAN access, remote access, backups or production operation.
- Do not import real learner, guardian, staff or finance records.

The next gate is to start this isolated database, apply both migrations, and verify the constraints and permissions. Only after that should the API connect using a separate least-privilege database account.
