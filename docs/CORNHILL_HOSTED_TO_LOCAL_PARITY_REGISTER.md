# CORNHILL Hosted-to-Local Parity Register

Status date: 2026-11-14  
Branch: `feat/local-first-self-hosted-migration-20261113`  
Purpose: prevent any hosted schema, workflow, permission, file, integration or record class from being silently omitted during the self-hosted conversion.

## Status vocabulary

- `NOT INVENTORIED`: source definition or behavior has not yet been collected.
- `INVENTORIED`: source definition is captured and named in the detailed register.
- `MAPPED`: local replacement design and destination are documented.
- `IMPLEMENTED`: local code/schema exists.
- `VERIFIED`: automated and/or manual tests prove expected behavior.
- `EXCEPTION`: provider-managed behavior cannot be copied directly; approved replacement and rationale are documented.
- `BLOCKED`: dependency or missing evidence prevents safe completion.

A migration is not complete merely because a SQL file exists. Every row must reach VERIFIED or a documented, approved EXCEPTION before production cutover.

## Source baseline (read-only discovery)

The current discovery snapshot records:

| Source object class | Known source count | Current local status |
|---|---:|---|
| Public tables | 123 | NOT INVENTORIED table-by-table; migrations 001-008 are a new local foundation, not proven schema parity |
| Tables with at least one RLS policy | 97 | NOT INVENTORIED policy-by-policy |
| RLS-enabled tables without policies | 26 | NOT CLASSIFIED; preserve deny-by-default/server-only behavior until grants and callers are reviewed |
| Row Level Security enabled | 123 | Source fact captured; local API authorization mapping remains incomplete |
| Foreign-key constraints | 267 | NOT INVENTORIED definition-by-definition |
| Routines/functions | 181 | NOT INVENTORIED definition-by-definition |
| SECURITY DEFINER routines | 147 | NOT REVIEWED body-by-body for privilege, ownership and input checks |
| Triggers | 119 | NOT INVENTORIED definition-by-definition |
| Public views | 6 | NOT INVENTORIED definition-by-definition; source views use security_invoker |
| Auth users / identities | 13 / 13 | NOT MAPPED; credentials/tokens must not be copied as plaintext or assumed portable |
| Private storage buckets | 5 | NOT MAPPED bucket-by-bucket |
| Storage objects | 7 | NOT EXPORTED or checksum-verified |
| Active Edge Functions | 11 | NOT INVENTORIED implementation-by-implementation |
| Realtime publication tables | 1 known (`public.evidence_capture_requests`) | NOT REPLACED |
| Main page Supabase table-query call sites | ~260 | NOT ROUTE-MAPPED |
| Main page Auth call sites | 43 | NOT ROUTE-MAPPED |
| Main page Storage call sites | 13 | NOT ROUTE-MAPPED |
| Main page Edge Function calls | 6 (4 invoke + 2 direct HTTP) | NOT ROUTE-MAPPED |
| Vercel path rewrites | 61 | NOT REPLACED / ROUTE-TESTED |
| Vercel static build rules | 4 | NOT REPLACED / BUILD-TESTED |

Counts are discovery facts, not proof that every object has been extracted. Re-run metadata inventory and reconcile changes immediately before data export and cutover.

## Detailed inventory registers

### A. Database tables — all 123

Create one named entry per source table. For each table capture:

- exact schema and table name;
- every column (type, nullability, default, generated/identity behavior, collation);
- primary key, unique constraints, check constraints and exclusion constraints;
- all foreign keys (referenced table/column, update/delete action, deferrability);
- indexes (definition, predicate, included columns);
- RLS enabled/forced state, every policy's command/role/USING/WITH CHECK;
- SQL grants, ownership, comments, partitions and dependencies;
- triggers, routines, views and application call sites that depend on it;
- data classification, local destination, migration order and validation query;
- local migration file, tests and final parity evidence.

**Progress:** 0/123 source tables individually reconciled in this register. Do not infer table names or mark rows complete from aggregate counts.

### B. Security and database behavior

| Inventory item | Source baseline | Required local evidence | Status |
|---|---:|---|---|
| RLS table settings | 123 enabled | Every local table has reviewed equivalent server-side authorization; no accidental broad CRUD | NOT VERIFIED |
| RLS policies | 253 | Every policy translated into explicit role/resource/action checks or documented exception | NOT INVENTORIED |
| Policy-less tables | 26 | Grants and callers classified; no public exposure introduced | NOT CLASSIFIED |
| Foreign keys | 267 | Every relationship, delete/update action and deferred constraint reconciled | NOT INVENTORIED |
| Routines | 181 | Definition, owner, grants, transaction behavior and callers mapped | NOT INVENTORIED |
| SECURITY DEFINER routines | 147 | Each function's privilege boundary, search_path, input checks and side effects reviewed | NOT REVIEWED |
| Triggers | 119 | Every trigger event, timing, function, ordering and side effect mapped | NOT INVENTORIED |
| Views | 6 | Definition and security_invoker behavior reproduced or safely replaced | NOT INVENTORIED |
| Sequences, enums, domains, extensions | To be enumerated | Definitions, ownership, values and privileges captured | NOT INVENTORIED |
| Scheduled jobs / cron | To be enumerated | Every schedule, target and failure/retry behavior replaced | NOT INVENTORIED |
| Realtime/publications | 1 known table | Every subscription/caller replaced with local events or tested polling | NOT INVENTORIED |
| Grants / ownership / default privileges | To be enumerated | Least-privilege local role matrix tested | NOT INVENTORIED |

### C. Authentication and identity

Inventory every auth user, identity provider, app metadata dependency, email/phone verification state, recovery flow, MFA factor, session behavior, token expiry, invite flow, password reset, disable/delete behavior and audit dependency.

Do not export password hashes or tokens unless a documented, secure, verified portability method is available. Otherwise require a safe password reset/re-enrolment process and record it as an explicit migration exception. Never migrate secrets into Git or browser code.

Current local foundation: migrations 001-004 implement local identity/session foundations, permission catalogue, login throttling and a NOLOGIN runtime role. This is not yet complete authentication parity. Status: IMPLEMENTED FOUNDATION / NOT VERIFIED AGAINST ALL SOURCE FLOWS.

### D. Private storage and documents

Source buckets to reconcile:

- `bursary-evidence`
- `cornhill-private-evidence`
- `learner-photos`
- `parent-voice-notes`
- `staff-media`

For every bucket capture private/public status, allowed MIME types, size limits, path conventions, policies, signed URL rules, metadata, references and lifecycle. For every object export through an approved secure process and compare SHA-256 checksums after import. Preserve private access boundaries. Current known source object count is seven; zero-object buckets still require configuration parity.

Local destination must be a private file store outside the public static directory, with authorised API delivery and encrypted backup/restore. Status: NOT IMPLEMENTED.

### E. Edge Functions and external integrations

Create one entry for each of the 11 active Edge Functions, recording source name, source code revision, caller pages, request/response schema, auth requirements, database/storage access, environment variables (names only; never values), external APIs, retries, idempotency and audit side effects.

Also inventory Google OAuth/Drive, Cloudflare R2, SMS/MTN/Airtel, password breach checking, email delivery and any other provider dependencies. Decide whether each becomes local, optional online, or a documented exception. Status: NOT INVENTORIED FUNCTION-BY-FUNCTION.

### F. Frontend and hosting call sites

Trace every Supabase client initialization and call in all HTML, JavaScript, modules and worker files. Record page/file, call site, source table/function/bucket, operation, user role, required scope, response shape, local API route, offline behavior and automated test.

Known sample counts in the main page are not the full repository count. Also reconcile all 61 Vercel rewrites, four static build rules, manifests, MIME types, security headers, CSP, service-worker scope, PWA installation, Windows kiosk launcher, Tauri configuration and Android access.

The replacement must not expose a generic arbitrary-table CRUD API. Each route must enforce explicit resource, action, role and learner/class scope.

### G. Offline and synchronization

For each business action classify: online-only, safe local draft, queued/idempotent mutation, or prohibited while offline. Define stable operation IDs, user/device ownership, validation, duplicate prevention, conflict resolution, audit events and retry policy.

Financial receipts, payment allocations, banking, expense approvals, bursary changes, payroll posting, marks publication, official learner identity changes, guardian PINs and evidence approvals require explicit workflow-specific safeguards before offline replay. The existing shell cache and encrypted draft/outbox foundations do not prove full offline operation.

### H. Data migration and reconciliation

Before importing production data:

1. Generate a consistent encrypted source export using an approved secure process.
2. Restore it into a separate isolated rehearsal database.
3. Compare row counts for every table, primary/foreign-key integrity, unique values, sequence positions, null distributions and required business invariants.
4. Reconcile learner permanent pupil codes and LIN uniqueness.
5. Reconcile finance totals, outstanding balances, bursary obligations, payment allocations and receipt history.
6. Reconcile staff, attendance, payroll, academic marks and report publication history.
7. Compare every private file checksum and database reference.
8. Test backup restoration to a clean machine and record elapsed recovery time.
9. Obtain school acceptance before any production cutover.

No real learner, guardian, staff or finance data is to be loaded into the current development database.

## Current local migration sequence

| Migration | Prepared scope | Status |
|---|---|---|
| 001 | Local identity/session foundation | IMPLEMENTED; source parity pending |
| 002 | Permission catalogue and staff class assignments | IMPLEMENTED; source parity pending |
| 003 | Failed-login throttling indexes | IMPLEMENTED; source parity pending |
| 004 | Restricted auth runtime database role | IMPLEMENTED; source parity pending |
| 005 | Learners and admissions | IMPLEMENTED; source parity pending |
| 006 | Academic years, terms, subjects, assessments and marks | IMPLEMENTED; source parity pending |
| 007 | UGX fees, bursaries, payment allocations, receipts and guardian-consent notification outbox | IMPLEMENTED; source parity pending |
| 008 | Staff, attendance device import, attendance adjustments and payroll foundation | IMPLEMENTED; source parity pending |
| 009 | Attendance policy settings, work schedules, salary agreements, calendar exceptions, Director-reviewed incidents and special staff sessions | IMPLEMENTED FOUNDATION; source parity pending |

The sequence is not closed. Additional numbered migrations must be added as the source inventory identifies missing tables, constraints, routines, storage metadata or local-only requirements. Never edit a migration that has already been applied; add a new forward migration.

## Cutover gate

Production cutover remains BLOCKED until every applicable source register is VERIFIED or an approved EXCEPTION, data reconciliation and restore rehearsals pass, local authentication and authorization are proven, private files are protected, the Windows/Android/LAN workflows pass, offline behavior is tested, and the school explicitly approves the change. Keep Vercel/Supabase intact until that gate passes.
