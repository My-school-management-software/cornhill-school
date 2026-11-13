# CORNHILL Local-First / Self-Hosted Migration Plan

Status: discovery and design only. This document does not authorise a production cutover.

## Goals

- Operate the school system on a school-controlled computer and local network without requiring Vercel or Supabase subscriptions for normal school operations.
- Support Windows 10/11 administration computers and authorised Android devices.
- Keep records available during internet outages.
- Synchronise approved changes safely when connectivity returns.
- Preserve school data, role restrictions, parent/guardian isolation, audit history, receipts, and private files.
- Keep the current hosted system running until the replacement is fully tested and the school explicitly approves cutover.

## Verified discovery snapshot (2026-11-13)

The connected Supabase project reports:

- 123 public tables; all 123 have Row Level Security enabled.
- 26 RLS-enabled tables currently have no policies. These are not assumed to be public; investigate their grants and server-only access patterns before reproducing permissions.
- 267 foreign-key constraints.
- 181 routines/functions and 119 triggers (from the current information-schema inventory query).
- 6 public views.
- 13 authentication users and 13 identities.
- 5 private storage buckets:
  - `bursary-evidence`
  - `cornhill-private-evidence`
  - `learner-photos`
  - `parent-voice-notes`
  - `staff-media`
- Storage currently contains 7 objects across two buckets: 2 objects in `cornhill-private-evidence` and 5 in `staff-media`. The other three buckets currently report zero objects.
- The `supabase_realtime` publication currently lists `public.evidence_capture_requests`.
- 11 active Supabase Edge Functions were previously inventoried.

The repository already contains offline shell caching, encrypted IndexedDB draft storage, an offline account-authentication foundation, and an offline action queue. These are foundations only: the service worker keeps Supabase/auth/API and school records network-only, and the offline roadmap documents that many business workflows do not yet have safe transactional outbox handlers.

## Security interpretation

- RLS enabled with no policies is not equivalent to public access. Ordinary client access is generally denied by RLS, but effective access also depends on SQL grants, ownership, service-role paths, functions, and triggers.
- Never copy broad service-role privileges into browser code.
- Parent/guardian access must remain isolated to approved learner(s), with server-side verification and audit trails.
- Private files must remain private; use short-lived authorised downloads and preserve bucket-level MIME/size constraints.
- Preserve finance transaction atomicity, duplicate prevention, reversal controls, teacher class/subject scoping, staff employment checks, and all audit events.
- Do not migrate passwords, tokens, OAuth secrets, service-role keys, or private credentials into source control or client-side configuration.

## Target architecture to evaluate

1. **Local database:** school-controlled PostgreSQL with versioned schema migrations, constraints, indexes, backup/restore procedures, and a restricted application database role.
2. **Application API:** a school-controlled server-side API that owns authentication, authorisation, transactions, file access, and audit logging. Browser and Android clients must never connect with database administrator credentials.
3. **Authentication:** local account management with secure password hashing, session expiry, recovery and administrator-controlled role assignment. Preserve separate staff, teacher, and parent/guardian scopes.
4. **Private file service:** school-controlled file storage with generated object identifiers, access checks, upload validation, and encrypted backups.
5. **LAN access:** serve the existing responsive web/PWA interface from the school host over the local network; reserve remote access for a later separately secured stage.
6. **Offline client:** IndexedDB for approved drafts/outbox entries, per-user/device scoping, idempotency keys, conflict detection, and explicit pending/synced/failed states. Never silently queue or replay money movements without transaction-specific safeguards.
7. **Backups:** automatic local backups plus a separately stored encrypted copy; scheduled restore rehearsals and integrity checks.
8. **Optional remote access:** evaluate only after LAN operation is stable. Avoid assuming free third-party hosting, SMS, domains, or cloud storage will remain free.

## Migration phases and acceptance gates

### Phase A — complete dependency inventory
- Map every frontend Supabase client call and environment-variable name (never print secret values).
- Inventory all tables, columns, primary/foreign keys, indexes, constraints, policies, grants, functions, triggers, views, scheduled jobs, and realtime dependencies.
- Inventory all 11 Edge Functions and their callers.
- Inventory Vercel build settings, rewrites, headers, serverless functions, domains, and deployment assumptions.
- Identify every storage object and its database references; verify actual files by checksum during export.
- Classify the 26 no-policy tables as server-only, intentionally inaccessible, or requiring a reviewed policy.

### Phase B — local foundation
- Create a separate local development environment and migration branch.
- Build the local database schema from reviewed migrations.
- Build API health checks, authentication, role enforcement, audit logging, and private file service.
- Add synthetic test fixtures only; do not copy production learner data into an unsecured development environment.

### Phase C — data migration rehearsal
- Take a consistent, encrypted export using an approved secure process.
- Import into a separate test database.
- Compare table row counts, key relationships, sequence values, financial totals, learner-code uniqueness, and file checksums.
- Test backup restoration before any production cutover.

### Phase D — workflow replacement
- Replace Edge Functions one by one and test their callers.
- Rebuild authentication and parent portal access.
- Replace storage access and signed-file delivery.
- Replace realtime use with a local event mechanism or safe polling where appropriate.
- Implement workflow-specific offline sync with idempotency and conflict rules.

### Phase E — pilot and cutover
- Pilot on the main school computer and a small authorised LAN group.
- Test Windows and Android clients, multiple simultaneous users, internet loss/recovery, printer output, backups, and restore.
- Reconcile learner, finance, attendance, and academic records against the hosted source.
- Obtain explicit school approval before switching production.
- Keep the old system and a tested rollback path until the new system has completed an agreed observation period.

## Immediate next engineering tasks

1. Complete table-by-table grants/policy classification for the 26 no-policy tables.
2. Generate a full schema dependency catalogue, including foreign keys and routine/trigger definitions.
3. Trace the application’s Supabase client initialisation and calls; inspect repository source without exposing secrets.
4. Inspect the 11 Edge Function implementations and their dependencies.
5. Inspect Vercel configuration and identify build/runtime assumptions.
6. Produce a tested local proof-of-concept API and database in an isolated environment before moving real records.

## Non-negotiable safeguards

- No production writes during discovery.
- Do not disable, cancel, or delete Vercel/Supabase resources during migration preparation.
- Do not merge migration changes into the production branch or deploy production without explicit approval.
- Do not claim the system is independent until it can operate, authenticate users, save records, serve private files, back up, restore, and pass acceptance tests without Vercel or Supabase.
