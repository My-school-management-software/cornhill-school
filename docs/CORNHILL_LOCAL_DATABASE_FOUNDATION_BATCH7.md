# CORNHILL Local Database Foundation — Batch 7

Date: 2026-11-13
Branch: feat/local-first-self-hosted-migration-20261113

## Added

- `compose.yaml`: PostgreSQL 17 development database service.
- `.env.example`: configuration template with a placeholder only.
- `.gitignore`: excludes local environment secrets, database exports and backup folders.
- `POSTGRES_LOCAL_SETUP.md`: Windows/PowerShell setup and safe stop instructions.
- README link to the database setup guide.

The PostgreSQL port is published only on `127.0.0.1:54329`; it is not exposed to the school LAN. A named persistent volume stores database files. The compose configuration requires a locally supplied password and has no committed password value.

## Verification

| Check | Result |
|---|---|
| Identity SQL schema assertions | 7 passed, 0 failed |
| Auth security primitive runtime tests | 10 passed, 0 failed |
| Compose YAML structure and loopback port review | Passed |
| Persistent volume configuration | Passed |
| Environment template contains placeholder, not a real password | Passed |
| Local .env and backup ignore rules present | Passed |

The 10 runtime tests were run with Node.js 22.16.0 in an isolated local test harness matching the committed security-primitives module and test cases. The seven identity checks inspect the exact committed SQL source.

## Not yet verified

Docker and Docker Compose are not installed in this development environment. Therefore:
- The PostgreSQL container has not been started.
- The SQL migration has not been applied to PostgreSQL.
- PostgreSQL constraint behaviour and role grants have not been integration-tested.
- The Node server is not connected to PostgreSQL.
- No API database user has been created.

The setup guide explains how to run the disposable database on a development PC. Do not run `docker compose down -v`, because that deletes the local database volume.

## Safety boundary

This is a development database only. It is not open to other devices and contains no CORNHILL production records. The live PWA and hosted Vercel/Supabase services remain unchanged. No migration or cutover has occurred.
