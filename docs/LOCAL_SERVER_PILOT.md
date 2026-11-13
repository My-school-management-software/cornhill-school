# CORNHILL local-server pilot — 13 November 2026

## Decision

Run a reversible pilot of a school-local CORNHILL installation before considering any move away from the existing Vercel + managed Supabase deployment.

The pilot is **not** production and must use synthetic/test records only. The existing production Supabase project `yemhortbudwbcrzsoozk` and current website must remain untouched. The separate `cornhill-restore-rehearsal` project is an empty isolated cloud test project; it is not a local server and must not be described as a completed restore.

## Target architecture

- One dedicated computer on the school LAN hosts the application and a self-hosted Supabase stack (Postgres, Auth, REST, Realtime and Storage as required by CORNHILL).
- Office Windows computers and authorised Android phones access it over the school Wi-Fi/LAN.
- The server uses a reserved LAN address; no router port-forwarding or public exposure during the pilot.
- A UPS protects the server and network equipment from short power interruptions.
- Encrypted backups are copied to two rotating external drives and a separate off-site location. The backup encryption key is held separately from the backup files.
- Vercel + managed Supabase remain available as the fallback while the local pilot is evaluated.

## Hardware readiness gate

Supabase's current Docker self-hosting guide lists 4 GB RAM, 2 CPU cores and 40 GB SSD as minimum requirements, with 8 GB+ RAM, 4 CPU cores+ and 80 GB+ SSD recommended. These are platform minimums, not a guarantee that the complete CORNHILL workload will be fast enough. The pilot must measure actual resource use with representative synthetic data and multiple devices.

Run `windows/Check-CORNHILL-Host-Readiness.ps1` on the proposed Windows host. It is read-only: it reports Windows version, memory, CPU, available system-drive space, Docker availability and WSL status. It does not install software, change settings, access credentials or start containers.

If the host is below minimum, do not try to force a full stack onto it. Use it only as a client/test device and evaluate a dedicated server computer. For a permanent school server, prefer dedicated hardware that is not also used as an everyday office workstation.

## Important platform distinction

Supabase CLI's local development stack is for development/testing and is not hardened for production. The pilot should evaluate the official self-hosted Docker Compose deployment, pinned to a documented release. Do not expose a local development stack to school users or the internet.

Self-hosting transfers responsibility for operating-system updates, database maintenance, security hardening, service monitoring, backups, recovery, and uptime to the school/operator. Managed Supabase features such as managed backups and point-in-time recovery are not automatically included.

## Application changes required before a meaningful pilot

1. Audit every CORNHILL entry point and linked workspace for backend URL/key configuration.
2. Introduce one controlled runtime configuration so the same application build can point to the local Supabase endpoint or the existing managed endpoint without editing individual pages by hand.
3. Keep secret/service-role keys out of browser code. Browser clients may use only the appropriate publishable/anon key with RLS enforced.
4. Apply the complete, ordered database migration set to an isolated local database; do not copy production secrets or real learner/staff records into the pilot.
5. Review Edge Functions, scheduled jobs, Storage buckets/policies, Auth redirect URLs, extensions, and cron tasks for self-hosted compatibility. Some managed-platform features require replacements or manual setup.
6. Implement and test safe offline transaction queues workflow by workflow. Existing encrypted form drafts and cached application shell do not make payments, marks, attendance or payroll safely offline-capable.
7. Provide explicit backup, restore, and rollback scripts/runbooks before any live data is considered.

## Pilot test sequence and acceptance gates

### Gate 1 — host readiness
- Record host CPU, RAM, SSD capacity/free space, Windows build, Docker Desktop status and WSL status.
- Confirm a dedicated, stable LAN connection and UPS availability.
- Stop if minimum host requirements are not met.

### Gate 2 — isolated backend
- Install the official self-hosted Docker Compose stack on the pilot host.
- Generate unique secrets locally. Never commit `.env`, private keys, database passwords or service-role keys.
- Bind access to the LAN only during the pilot; do not configure public DNS, port forwarding or external access.
- Confirm all required services report healthy.

### Gate 3 — schema and application compatibility
- Apply migrations in order to a fresh empty test database.
- Record migration failures; do not skip or improvise around them.
- Test staff sign-in, role checks, RLS, learner lookup, class/marks, finance test posting, attendance, Storage uploads and realtime features using synthetic test accounts and records.
- Confirm no production URL, production key, live SMS/mobile-money provider or real school record is used.

### Gate 4 — local-network and offline tests
- Test at least 10 simultaneous browser sessions across Windows and Android devices.
- Disconnect the internet while leaving the school LAN active. Confirm the local application and local database remain usable.
- Disconnect the LAN/server separately and confirm the app clearly reports unavailability rather than claiming a transaction succeeded.
- Reconnect and test only explicitly supported sync workflows for duplicate prevention and conflict handling.
- Restart the server and router; verify automatic recovery and data persistence.

### Gate 5 — recovery
- Create an encrypted database and Storage backup.
- Restore it to a second isolated test instance.
- Compare table counts, file counts, key relationships, and test login/workflows.
- Record recovery time and any data loss window.
- Repeat the restore drill before authorising any production cutover.

## Go/no-go criteria

The local pilot is a GO only when all required services are healthy, the migration set applies cleanly, security/role tests pass, 10+ device tests pass, LAN operation works without internet, backup restoration succeeds, and the school has an assigned person responsible for updates and monitoring.

A single desktop computer with no tested backup, UPS or replacement plan is **not** sufficient for a five-year continuity claim. No production cutover is authorised by this document.

## Current status

- [x] Existing CORNHILL offline app-shell and encrypted local-draft foundation located.
- [x] Existing boundary documented: authoritative school records and most transactions still require the server.
- [x] Separate empty Supabase restore-rehearsal project identified; it is not a local deployment.
- [x] Reversible pilot branch created.
- [ ] Proposed host hardware inspected.
- [ ] Official self-hosted Supabase stack installed on dedicated pilot host.
- [ ] Full migration set applied and tested locally.
- [ ] Application backend configuration made switchable.
- [ ] Multi-device, offline, backup and restore acceptance gates passed.
- [ ] Production cutover approved (not currently authorised).
