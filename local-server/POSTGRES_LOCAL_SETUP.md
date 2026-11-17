# Native PostgreSQL Development Service (Windows)

This is an isolated local migration/rehearsal database. It is not the live school database. The Windows installer uses the PostgreSQL 17 Windows service already installed on the computer; Docker Desktop is not required.

## Requirements

- Windows 10 version 2004 or newer, or Windows 11.
- Node.js 22 or newer and npm.
- PostgreSQL 17 Windows installation with Command Line Tools (`psql.exe` and `createdb.exe`) at `C:\Program Files\PostgreSQL\17\bin`.
- PostgreSQL service `postgresql-x64-17` running on localhost port 5432.

## First PC visit — staged setup

Clone the exact development branch on the Windows computer (Git for Windows is required):

```powershell
git clone --branch feat/cornhill-integration-batch-20261115 https://github.com/My-school-management-software/cornhill-school.git
cd .\cornhill-school\local-server
```

Install Node.js 22 or newer and PostgreSQL 17 for Windows, including **Command Line Tools**. In PowerShell, confirm:

```powershell
node --version
npm --version
Get-Service postgresql-x64-17
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' --version
```

The Node version must be 22 or newer, and the PostgreSQL service must be running. Then run the safe first stage:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\windows\Install-CORNHILL-Local.ps1 -SkipDatabase -RunTests
```

This stage installs pinned Node dependencies, creates the ignored private `.env` file if absent, and runs the Windows test suite. **It does not create a database or apply migrations.** Once those checks pass and PostgreSQL 17 is installed and running, run the installer again:

```powershell
.\windows\Install-CORNHILL-Local.ps1 -RunTests
```

That second stage asks for the local PostgreSQL administrator password, creates or safely resumes only the isolated `cornhill_local` database, applies migrations 001–095 and runs the database verifiers. Never paste the PostgreSQL password or `.env` contents into chat. If any command fails, stop and share only the error text with passwords, tokens and private paths removed.

## Windows installer

From the repository's `local-server` directory, run:

```powershell
.\windows\Install-CORNHILL-Local.ps1 -RunTests
```

It installs pinned npm dependencies, creates or preserves a private `.env`, prompts securely for the PostgreSQL `postgres` password, creates a separate `cornhill_local_admin` login and an isolated `cornhill_local` database, applies numbered local migrations and runs all five database verifiers. The administrator password is not printed or written into command history. Generated local secrets are stored only in the ignored `.env` file.

On a clean test computer, the installer creates `cornhill_local`. If a database with that name already exists and is owned by `cornhill_local_admin`, the installer creates and verifies a private backup, then resumes checksum-verified migrations without resetting the database. It stops if the existing database has a different owner. Because resuming may apply unapplied migrations, run this only on a clean disposable test computer; never point it at the school's database.

## Manual environment settings

The local PostgreSQL connection uses host `127.0.0.1`, port `5432`, database `cornhill_local`, and migration user `cornhill_local_admin`. Keep `.env` private. It is excluded by `.gitignore`; never commit it or paste its contents into chat. The installer generates the authentication runtime secret and provisions `cornhill_auth_api` as a restricted login. The finance API remains NOLOGIN while `CORNHILL_DB_FINANCE_RUNTIME_PASSWORD` is a placeholder. Do not enable finance routes until HTTPS, private credential provisioning and full integration tests have passed.

## Migration and verification scope

The runner discovers all numbered SQL files present in `migrations`, applies them in numeric order, and records a SHA-256 checksum for each. It requires both explicit local-development flags, validates the loopback host and exact database name, and uses a PostgreSQL advisory lock. A changed already-applied migration causes a hard stop rather than a silent reapply.

The current numbered sequence is migrations 001–095. Coverage includes local identity and authorization; learner admissions, Nursery and Primary subject structures, marks, immutable report cards and class progression; UGX finance and payment history; staff profiles, attendance and leave; and payroll records. These migrations are **not yet certified as a complete copy of the hosted CORNHILL system**. The hosted project inventory still has to be reconciled object-by-object, including all source tables/columns, constraints, indexes, policies, routines, triggers, views, storage objects, edge functions, auth behavior, integrations and application call sites. Any provider-managed feature that cannot be migrated must be documented and safely replaced rather than silently omitted.

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

- The local Node server includes authenticated staff and partial finance workflows (learner fee payments, expense requests, bank transactions and approval queues). It is not yet the complete school UI/API and remains disabled for real school use pending runtime provisioning and full verification.
- The local HTTPS server includes authenticated staff, finance and (when separately configured) private evidence API routes. It remains loopback-only and is not enabled for school use or LAN/Android access.
- Authentication and finance runtime database credentials are not provisioned by the installer; runtime roles remain NOLOGIN until deliberately provisioned. A placeholder finance secret keeps finance HTTP routes disabled. The evidence API additionally requires CORNHILL_PRIVATE_EVIDENCE_PATH to point to an absolute private directory outside the repository. On Windows, startup applies an ACL that removes inherited permissions and grants full access only to the service account and SYSTEM; startup fails closed if that ACL cannot be applied.
- The database listens only on loopback and is not configured for LAN/Android access.
- Offline data synchronization, production backups/restore and real-data migration remain pending.
- Do not import real learner, guardian, staff, finance, attendance or payroll records yet.
- Do not disable the hosted CORNHILL service until feature parity, data reconciliation, security, backup/restore and acceptance testing pass and the school explicitly approves cutover.


## One-batch desktop update (existing installation)

After the first local database foundation has been installed, use the integrated desktop updater from the repository's `local-server` directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\windows\Update-CORNHILL-Desktop.ps1
```

The updater checks that the correct development branch is active and the source working tree is clean, downloads updates using fast-forward-only Git, installs pinned dependencies, runs the Windows test suite, applies only unapplied checksum-verified local migrations, and runs database/authentication/school/finance verification. It preserves the existing `cornhill_local` database and stops rather than overwriting local source edits or switching to a remote database.

The update links the School Office, Bursar Desk, Academics and Staff/Leadership workspaces. It checks whether the initial Director account is already configured; when it is not, the updater offers the one-time hidden-password Director setup. If trusted localhost HTTPS has not yet been configured, it offers to create the local certificate. Add `-Launch` to open the local server window and browser after the checks pass.

After the update is complete, the local service can be started from `local-server` using `npm run start:auth`, then opened at `https://localhost:4174`. The server remains loopback-only; this batch does not enable LAN access, multi-device synchronization or offline sync.

## Owner acceptance path

The installer runs the Node.js and SQL steps itself; the owner does not need to type Node.js commands or SQL. The owner still needs to install Git for Windows, Node.js 22 and PostgreSQL 17, open PowerShell in the `local-server` folder, run the installer script, and enter the local PostgreSQL administrator password at its hidden prompt. This is not yet a one-click installer.

For acceptance, use a clean Windows 10 and a clean Windows 11 virtual machine with a disposable PostgreSQL 17 database. After the installer completes, run `windows/Update-CORNHILL-Desktop.ps1 -Launch` from PowerShell. Complete the first Director setup and trusted localhost HTTPS setup with synthetic credentials. The script should open `https://localhost:4174/app`; use only synthetic learner, staff, academic and finance records. Record Pass, Fail or Not run for every item in [the Windows acceptance checklist](windows/CORNHILL-Installation-Acceptance.md). This procedure has not been executed on a clean Windows VM yet.
