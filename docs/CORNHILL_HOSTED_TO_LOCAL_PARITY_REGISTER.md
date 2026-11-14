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


### Read-only Edge Function and Auth security review (2026-11-14)

Selected active Edge Function source was retrieved for static review. No function was deployed, changed, invoked with business data, or otherwise modified.

| Function reviewed | Observed control | Remaining review |
|---|---|---|
| `parent-portal-api` | JWT gateway verification is disabled, but the handler implements its own opaque bearer-session check: 256-bit random token, SHA-256 token-hash lookup, expiry/revocation checks, and active guardian-contact-to-learner linkage. CORS is restricted to named/approved Vercel origins. | Review every action branch, PIN/OTP verification and throttling, session creation/revocation, response field allow-lists, staff-only branches, and report/fee gating. Confirm no learner can be selected outside the linked guardian session. |
| `staff-access-code` | JWT gateway verification is disabled, but source contains its own Director-session verification, IP-derived HMAC rate-limit call, and a 429 response when the rate-limit check fails. | Review all role/title authorization, access-code lifecycle, session issuance, reset flows, and audit coverage. Confirm rate-limit secret configuration and fail-closed behavior. |
| `class-teacher-code` | JWT verification enabled; source verifies the caller's authenticated user and requires the Admin role before creating/resetting class teacher accounts. | Review account enumeration, password/code handling, class assignment uniqueness, transaction/partial-failure behavior and audit events. |

The other selected functions (`google-drive-backup`, `bursar-account-web`, and `r2-storage-gateway`) were retrieved for review, but this pass did not complete a full line-by-line authorization assessment. Their JWT settings alone do not establish whether they are secure or insecure.

**Supabase Security Advisor snapshot (read-only):**
- Advisor reported that leaked-password protection is disabled. This is a hardening recommendation for the hosted Auth configuration; no setting was changed.
- Advisor reported that authenticated users can execute numerous SECURITY DEFINER routines through RPC. This includes privileged business operations such as payment posting, learner promotion and report-card workflow functions. These are not automatically vulnerabilities, but each routine must be checked for internal role/scope checks, fixed search_path, ownership, input validation, and least-privilege EXECUTE grants. Do not blindly revoke execution or switch all routines to SECURITY INVOKER; that could break intended workflows.
- Advisor recommendations are a review queue, not proof that an exploit has occurred.

**Local parity rule:** reproduce the intended business authorization in explicit local server routes and role/resource/scope checks. Do not expose service-role credentials, generic RPC execution, or arbitrary-table CRUD to browsers. Keep parent access strictly limited to the learner(s) linked to the verified guardian session.

### Read-only metadata audit update (2026-11-14)

A second metadata-only pass was run against the hosted project. No learner, guardian, staff, payment, message or other business rows were selected.

| Metadata item | Verified result | Interpretation |
|---|---:|---|
| Public tables | 123 | RLS enabled on all 123 |
| Tables with RLS policies | 97 | 26 RLS-enabled tables have no policies; grants and callers still need classification |
| RLS policies | 253 | Policy definitions captured in aggregate; full per-policy translation remains pending |
| Non-internal triggers | 76 across 43 tables | The earlier inventory recorded 119 triggers; this is a count-definition discrepancy to reconcile (likely internal-trigger inclusion). Do not replace the earlier figure until reconciled |
| Public routines | 181 | 147 are SECURITY DEFINER; all 147 require body/owner/search_path/grant review |
| Public views | 6 | Definitions and security_invoker behavior still need review |
| Private storage buckets | 5 | Names confirmed; object-level and policy parity pending |

**Edge Function inventory (11 active):**

| Function | JWT verification | Source version |
|---|---:|---:|
| `staff-invite` | Yes | 14 |
| `class-teacher-code` | Yes | 15 |
| `google-drive-backup` | No | 31 |
| `parent-portal-api` | No | 19 |
| `staff-employment-status` | Yes | 2 |
| `staff-access-code` | No | 3 |
| `bursar-account-admin` | Yes | 5 |
| `bursar-account-web` | No | 5 |
| `staff-account-activation` | No | 7 |
| `r2-storage-gateway` | Yes | 4 |
| `usage-analytics` | No | 2 |

JWT=false is not automatically a vulnerability: each such function must be checked for its own authentication, authorization, webhook or other trust boundary before local replacement.

**Policy review flags for manual source-code review (not confirmed vulnerabilities):**
- `class_login_directory` has a SELECT policy for `anon` and `authenticated` with an unrestricted `USING (true)`. Inspect its columns, grants, actual purpose and callers before designing the local equivalent; never expose class credentials or private learner/staff information through a public directory.
- `school_admission_enquiries` permits anonymous INSERT only when submitted as a pending enquiry with review fields unset. Preserve this narrow intake behavior only if the corresponding public form is retained, with validation and abuse controls.
- Several reference-data policies use `USING (true)` for authenticated users (for example academic years/terms, subjects and grade bands). Confirm that the tables contain only intended non-sensitive reference data.
- The 26 policy-less RLS tables remain deny-by-default for ordinary roles unless grants or privileged server paths provide access. Inventory those grants and callers before porting behavior.

This pass improves metadata coverage but does not mark any source table, policy, routine, trigger, Edge Function or storage bucket as locally reconciled. Existing source counts are retained where definitions differ until a precise reconciliation is completed.

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

**Source table-name inventory (read-only metadata snapshot, 2026-11-14):** all 123 names were retrieved from the hosted project's public schema. RLS is enabled on all 123. This establishes names and RLS-enabled state only; it does not reconcile columns, policies, constraints, indexes, routines, triggers, grants, data semantics or callers. No table rows or personal records were read for this inventory.

| # | Source table | Name/RLS status |
|---:|---|---|
| 1 | `public.user_profiles` | INVENTORIED — RLS enabled |
| 2 | `public.school_classes` | INVENTORIED — RLS enabled |
| 3 | `public.students` | INVENTORIED — RLS enabled |
| 4 | `public.staff_attendance_device_users` | INVENTORIED — RLS enabled |
| 5 | `public.staff_attendance_import_batches` | INVENTORIED — RLS enabled |
| 6 | `public.staff_attendance_events` | INVENTORIED — RLS enabled |
| 7 | `public.staff_attendance_adjustments` | INVENTORIED — RLS enabled |
| 8 | `public.academic_years` | INVENTORIED — RLS enabled |
| 9 | `public.academic_terms` | INVENTORIED — RLS enabled |
| 10 | `public.subjects` | INVENTORIED — RLS enabled |
| 11 | `public.class_subjects` | INVENTORIED — RLS enabled |
| 12 | `public.assessments` | INVENTORIED — RLS enabled |
| 13 | `public.assessment_scores` | INVENTORIED — RLS enabled |
| 14 | `public.fee_items` | INVENTORIED — RLS enabled |
| 15 | `public.fee_schedules` | INVENTORIED — RLS enabled |
| 16 | `public.learner_charges` | INVENTORIED — RLS enabled |
| 17 | `public.school_payments` | INVENTORIED — RLS enabled |
| 18 | `public.payment_allocations` | INVENTORIED — RLS enabled |
| 19 | `public.academic_grade_bands` | INVENTORIED — RLS enabled |
| 20 | `public.report_card_publications` | INVENTORIED — RLS enabled |
| 21 | `public.staff_work_schedules` | INVENTORIED — RLS enabled |
| 22 | `public.staff_attendance_schedule_assignments` | INVENTORIED — RLS enabled |
| 23 | `public.school_sms_outbox` | INVENTORIED — RLS enabled |
| 24 | `public.staff_communication_posts` | INVENTORIED — RLS enabled |
| 25 | `public.staff_communication_comments` | INVENTORIED — RLS enabled |
| 26 | `public.staff_communication_reactions` | INVENTORIED — RLS enabled |
| 27 | `public.school_position_catalogue` | INVENTORIED — RLS enabled |
| 28 | `public.school_curriculum_subjects` | INVENTORIED — RLS enabled |
| 29 | `public.inventory_categories` | INVENTORIED — RLS enabled |
| 30 | `public.inventory_items` | INVENTORIED — RLS enabled |
| 31 | `public.inventory_movements` | INVENTORIED — RLS enabled |
| 32 | `public.daily_collection_records` | INVENTORIED — RLS enabled |
| 33 | `public.expense_categories` | INVENTORIED — RLS enabled |
| 34 | `public.staff_salary_agreements` | INVENTORIED — RLS enabled |
| 35 | `public.payroll_periods` | INVENTORIED — RLS enabled |
| 36 | `public.payroll_items` | INVENTORIED — RLS enabled |
| 37 | `public.school_expenses` | INVENTORIED — RLS enabled |
| 38 | `public.staff_attendance_alerts` | INVENTORIED — RLS enabled |
| 39 | `public.staff_attendance_deduction_settings` | INVENTORIED — RLS enabled |
| 40 | `public.staff_attendance_incidents` | INVENTORIED — RLS enabled |
| 41 | `public.staff_salary_advances` | INVENTORIED — RLS enabled |
| 42 | `public.student_class_history` | INVENTORIED — RLS enabled |
| 43 | `public.student_status_history` | INVENTORIED — RLS enabled |
| 44 | `public.uneb_subject_grade_bands` | INVENTORIED — RLS enabled |
| 45 | `public.class_login_directory` | INVENTORIED — RLS enabled |
| 46 | `public.class_teacher_access` | INVENTORIED — RLS enabled |
| 47 | `public.staff_direct_messages` | INVENTORIED — RLS enabled |
| 48 | `public.staff_call_signals` | INVENTORIED — RLS enabled |
| 49 | `public.staff_media_messages` | INVENTORIED — RLS enabled |
| 50 | `public.google_drive_backup_connections` | INVENTORIED — RLS enabled |
| 51 | `public.google_drive_backup_oauth_states` | INVENTORIED — RLS enabled |
| 52 | `public.google_drive_backup_runs` | INVENTORIED — RLS enabled |
| 53 | `public.google_drive_backup_settings` | INVENTORIED — RLS enabled |
| 54 | `public.learner_bursary_awards` | INVENTORIED — RLS enabled |
| 55 | `public.communication_templates` | INVENTORIED — RLS enabled |
| 56 | `public.communication_outbox` | INVENTORIED — RLS enabled |
| 57 | `public.communication_delivery_events` | INVENTORIED — RLS enabled |
| 58 | `public.communication_provider_settings` | INVENTORIED — RLS enabled |
| 59 | `public.parent_guardian_contacts` | INVENTORIED — RLS enabled |
| 60 | `public.parent_contact_change_log` | INVENTORIED — RLS enabled |
| 61 | `public.learner_conduct_reports` | INVENTORIED — RLS enabled |
| 62 | `public.learner_enrolment_periods` | INVENTORIED — RLS enabled |
| 63 | `public.google_drive_backup_validations` | INVENTORIED — RLS enabled |
| 64 | `public.guardian_pin_audit` | INVENTORIED — RLS enabled |
| 65 | `public.parent_portal_sessions` | INVENTORIED — RLS enabled |
| 66 | `public.parent_school_messages` | INVENTORIED — RLS enabled |
| 67 | `public.parent_school_message_events` | INVENTORIED — RLS enabled |
| 68 | `public.class_subject_teacher_history` | INVENTORIED — RLS enabled |
| 69 | `public.parent_report_access_audit` | INVENTORIED — RLS enabled |
| 70 | `public.school_public_contact_settings` | INVENTORIED — RLS enabled |
| 71 | `public.learner_archive_audit` | INVENTORIED — RLS enabled |
| 72 | `public.school_notifications` | INVENTORIED — RLS enabled |
| 73 | `public.learner_code_aliases` | INVENTORIED — RLS enabled |
| 74 | `public.learner_code_change_audit` | INVENTORIED — RLS enabled |
| 75 | `public.school_bursary_review_audit` | INVENTORIED — RLS enabled |
| 76 | `public.academic_teacher_directory` | INVENTORIED — RLS enabled |
| 77 | `public.class_teacher_directory_assignments` | INVENTORIED — RLS enabled |
| 78 | `public.class_teacher_directory_assignment_history` | INVENTORIED — RLS enabled |
| 79 | `public.school_staff_directory` | INVENTORIED — RLS enabled |
| 80 | `public.school_notification_user_state` | INVENTORIED — RLS enabled |
| 81 | `public.evidence_capture_devices` | INVENTORIED — RLS enabled |
| 82 | `public.evidence_capture_requests` | INVENTORIED — RLS enabled |
| 83 | `public.evidence_capture_files` | INVENTORIED — RLS enabled |
| 84 | `public.evidence_capture_reviews` | INVENTORIED — RLS enabled |
| 85 | `public.school_bank_accounts` | INVENTORIED — RLS enabled |
| 86 | `public.school_bank_transactions` | INVENTORIED — RLS enabled |
| 87 | `public.school_bank_transaction_events` | INVENTORIED — RLS enabled |
| 88 | `public.school_finance_operator_limits` | INVENTORIED — RLS enabled |
| 89 | `public.school_expense_requests` | INVENTORIED — RLS enabled |
| 90 | `public.school_expense_request_events` | INVENTORIED — RLS enabled |
| 91 | `public.school_apps` | INVENTORIED — RLS enabled |
| 92 | `public.school_admission_enquiries` | INVENTORIED — RLS enabled |
| 93 | `public.school_hr_leave_requests` | INVENTORIED — RLS enabled |
| 94 | `public.school_learning_resources` | INVENTORIED — RLS enabled |
| 95 | `public.school_library_books` | INVENTORIED — RLS enabled |
| 96 | `public.school_library_loans` | INVENTORIED — RLS enabled |
| 97 | `public.school_transport_routes` | INVENTORIED — RLS enabled |
| 98 | `public.school_transport_assignments` | INVENTORIED — RLS enabled |
| 99 | `public.school_welfare_cases` | INVENTORIED — RLS enabled |
| 100 | `public.school_provider_integrations` | INVENTORIED — RLS enabled |
| 101 | `public.school_visitor_log` | INVENTORIED — RLS enabled |
| 102 | `public.school_assets` | INVENTORIED — RLS enabled |
| 103 | `public.school_asset_maintenance` | INVENTORIED — RLS enabled |
| 104 | `public.school_staff_notices` | INVENTORIED — RLS enabled |
| 105 | `public.school_calendar_events` | INVENTORIED — RLS enabled |
| 106 | `public.school_record_index` | INVENTORIED — RLS enabled |
| 107 | `public.school_document_template_settings` | INVENTORIED — RLS enabled |
| 108 | `public.report_card_review_workflows` | INVENTORIED — RLS enabled |
| 109 | `public.report_card_review_events` | INVENTORIED — RLS enabled |
| 110 | `public.staff_access_codes` | INVENTORIED — RLS enabled |
| 111 | `public.staff_access_code_login_attempts` | INVENTORIED — RLS enabled |
| 112 | `public.staff_access_code_audit` | INVENTORIED — RLS enabled |
| 113 | `public.bursar_account_enrollments` | INVENTORIED — RLS enabled |
| 114 | `public.bursar_account_enrollment_events` | INVENTORIED — RLS enabled |
| 115 | `public.staff_activation_codes` | INVENTORIED — RLS enabled |
| 116 | `public.staff_activation_code_audit` | INVENTORIED — RLS enabled |
| 117 | `public.staff_attendance_policy_settings` | INVENTORIED — RLS enabled |
| 118 | `public.staff_attendance_calendar_exceptions` | INVENTORIED — RLS enabled |
| 119 | `public.staff_prep_sessions` | INVENTORIED — RLS enabled |
| 120 | `public.staff_prep_assignments` | INVENTORIED — RLS enabled |
| 121 | `public.staff_scheduled_session_attendance` | INVENTORIED — RLS enabled |
| 122 | `public.staff_scheduled_session_incidents` | INVENTORIED — RLS enabled |
| 123 | `public.school_usage_events` | INVENTORIED — RLS enabled |

**Progress clarification:** 123/123 source table names inventoried; 0/123 tables individually reconciled to a local destination. Keep the reconciliation count at zero until every table's full definition, policy behavior, dependencies, data classification, migration and tests have been checked.

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


### Additional Edge Function static review — staff, backup, bursar and evidence (2026-11-14)

This review retrieved source for five more active functions. It was static inspection only: no endpoint was called, no configuration changed, and no hosted records were modified.

| Function | Controls observed in source | Follow-up findings / unresolved risks |
|---|---|---|
| `bursar-account-admin` | Verifies the bearer token with Supabase Auth; reads the caller's profile and requires active `Admin`; invitation management actions require Director-level authorization; validates employee category/title, email and UUID; prevents duplicate active enrollments; requires email verification and Director approval before activation; records enrollment events; uses an RPC for final account activation. | CORS origin allow-list is not an authorization boundary. Review enrollment uniqueness constraints and concurrent invitation races, event-write failure handling, rejected/delivery-failed reissue lifecycle, the activation RPC body/grants, and whether every state transition is atomic. Confirm all profile and directory linking remains single-record and role-scoped. |
| `staff-employment-status` | Verifies the Auth bearer token and requires an active Admin; protects the Director from changing their own status; restricts targets to Teacher/Staff; validates status/date; requires the correct linked teacher or employee directory record before reactivation; updates profile status before applying an Auth ban for suspension; synchronizes the role-appropriate directory; reactivates the profile last. | CORS currently allows `*`. This is not by itself an authorization bypass because the handler verifies the bearer token and role, but it is broader than necessary. No dedicated employment-status audit event is written in this handler. Review concurrent changes, partial-failure recovery and whether all sensitive local/API routes re-check active status and session validity. Auth bans do not revoke already-issued JWTs; the source comments rely on RLS/profile checks to deny access after suspension, so verify every privileged path actually enforces that check. |
| `staff-account-activation` | Implements Director verification for management actions; uses 18-character random activation codes stored as HMAC hashes; one-time seven-day expiry; IP/user-agent-derived HMAC rate limiting with fail-closed 429; conditional single-use code claim; verifies active/unlinked employee record and role/title; creates staff Auth identity and links directory; issues separate personal codes for selected leadership roles; writes audit records. | Audit insert results are ignored in several issue/revoke/redeem paths, so successful changes can occur without a corresponding audit row. Review rollback and recovery for every partial failure, atomicity of code claim plus account creation/linking, leadership sign-in code issuance failure (the current flow can continue without a code), and bursar enrollment transitions. Email collision detection currently reads only the first 1,000 Auth users; acceptable for the current small inventory only if it is replaced with a complete/paginated or database-enforced uniqueness check before growth. Verify the activation page's hosted JavaScript dependency and CSP/integrity strategy for the local replacement. |
| `google-drive-backup` | Manual connect/backup actions require a verified active Admin; OAuth state is random, hashed, expires after ten minutes and is consumed on callback; callback checks the initiating administrator is still active; dedicated school Google account is enforced; refresh token is encrypted with AES-256-GCM using a configured 32-byte key; backup is encrypted and decrypt-verified before upload; backup run success/failure is audited; scheduled backup uses a separate RPC-verified scheduler token. | CORS is wildcard. Scheduler token verification and settings updates need review for rotation, replay/race behavior and strict RPC grants. The backup is an explicit allow-list of tables, not a full database backup: private communication tables are represented as empty datasets, Storage objects and Auth accounts are excluded, and tables absent from the list are omitted. Confirm this scope is clearly presented to administrators and that a restore procedure validates the manifest and handles these exclusions. Inspect OAuth token replacement/error paths and database write failures when reconnecting. |
| `r2-storage-gateway` | Requires an active staff profile and verifies the Auth token plus active session through `cornhill_auth_session_is_active`; restricts roles; restricts evidence actions to pending, unexpired requests and requester/assigned staff; uses short-lived signed URLs; validates UUID/path prefix, allowed MIME declaration and size; verifies uploaded object HEAD metadata; limits normal staff downloads to files they uploaded; admin-only usage scan. | Preview-origin regex is broader than a strict production-origin list and should be constrained in local configuration. Upload verification checks reported content type and length, not file magic/signature; add server-side file-content validation before treating evidence as trusted. Confirm admin download access is intended, evidence request/file linkage is revalidated on download, and all storage objects are reconciled on backup/restore. |

**Security interpretation:** these observations are code-review findings, not proof of exploitation. CORS does not replace authentication or authorization. Conversely, the presence of bearer-token checks does not prove every action is correctly scoped. No broad policy changes, blanket RPC revocations, or hosted fixes should be made from this review alone.

**Local implementation requirements derived from this pass:**
1. Every staff state change and account lifecycle action must write a durable audit event in the same transaction where possible; audit failure must be explicit and recoverable.
2. Staff suspension must immediately deny access on every local server route, not merely prevent a future login.
3. Activation/invitation code redemption must be single-use under concurrent requests and must not leave orphan Auth identities or unlinked profiles.
4. Backup UI and restore tooling must disclose exactly which tables, files, Auth identities and communication records are included or excluded.
5. Evidence upload validation must verify actual file content, not only client-provided MIME metadata.
6. CORS allow-lists are defense-in-depth only; every API route must independently authenticate and authorize the requested operation.

**Review progress:** selected static source reviews now include `parent-portal-api`, `staff-access-code`, `class-teacher-code`, `bursar-account-admin`, `staff-employment-status`, `staff-account-activation`, `google-drive-backup`, and `r2-storage-gateway`. The remaining active functions `staff-invite`, `bursar-account-web`, and `usage-analytics` still require full review. This does not change the overall 0/123 source-table reconciliation status.


### Final three active Edge Function reviews (2026-11-14)

Static source inspection completed for the remaining three active functions. No hosted endpoint was invoked and no hosted settings or records were changed.

| Function | Controls observed | Findings and required follow-up |
|---|---|---|
| `staff-invite` | JWT verification is enabled at the gateway and the handler independently calls Auth `getUser`; requires an active profile with role `Admin`; restricts invitation role to Teacher/Staff; requires an existing active, unlinked staff-directory record; prevents generic invitations for bursar titles; checks teaching/non-teaching category and exact employee name; attempts to reconcile the teacher directory before linking. | The handler's error message says “Director”, but its authorization check only tests `role === Admin` and active status; it does not independently verify Director job title or linked Director staff record. Confirm whether every Admin is necessarily the Director; otherwise tighten this before local port. CORS is wildcard. No dedicated invitation audit event is written. Several post-invite writes (profile upsert, employee link, teacher-directory link/create) can fail after the Auth invitation has already been sent, leaving partial state; add a recoverable state machine/transactional local workflow and explicit repair/audit events. Teacher-directory matching by exact full name is ambiguous and can select the wrong person when names are duplicated; prefer a stable directory ID relationship. |
| `bursar-account-web` | This is a static setup page only; it contains no server-side account mutation logic. It delegates status, verification and activation to `bursar-account-admin`; uses Supabase Auth invitation/recovery sessions, a dedicated browser storage key, 12-character minimum password UI, generic reset confirmation, no-store response headers, frame denial, no-referrer and a restrictive CSP. | The page loads Supabase JS from a third-party CDN without Subresource Integrity or a self-hosted pinned bundle; package supply-chain/availability is a local deployment concern. The publishable Supabase key is intentionally public, but must never be confused with a service-role secret. The page points users to hosted Vercel/Supabase URLs and must be rewritten to local routes/configuration. Password length is also enforced server-side only if the Auth policy is configured; verify that configuration and server-side setup-state checks in `bursar-account-admin`. |
| `usage-analytics` | Gateway JWT verification is disabled, but the handler has an explicit origin allow-list (Cornhill Vercel hosts and localhost), request-size cap, event/workspace/device allow-lists, no-store responses, active-staff token verification, guardian opaque-session hash/expiry/revocation and active-contact linkage, and Director-only report authorization. Visitor/session/actor identifiers are HMAC-pseudonymized; raw request bodies and tokens are deliberately not logged. Reports are capped to 90 days and end no later than Kampala today. | Public anonymous tracking has no visible per-IP/device rate limit or durable abuse quota; add bounded ingestion/rate limiting in the local service. The HMAC key falls back to the Supabase service key when a dedicated analytics key is absent; local deployment should require a dedicated analytics HMAC secret and key rotation. Date checks use a format regex plus JavaScript Date parsing; validate real calendar dates strictly. Review the report RPC's owner, fixed search_path, grants and internal date/aggregation scope. Confirm parent-portal events never include learner names, codes, phone numbers or report/payment content. The origin allow-list is a browser control, not an authentication boundary. |

**Additional local parity requirements:**
- Staff invitations must authorize the actual Director role, bind to a stable employee record, and produce an auditable invitation/link lifecycle with safe retry and repair.
- The bursar setup page must be served locally with pinned/self-hosted dependencies and local Auth/API URLs; no privileged secret may enter browser code.
- Analytics must collect only minimal operational events, use a dedicated secret, apply ingestion quotas, strictly validate dates and never collect identifiable learner/guardian content.

**Edge Function review status:** all 11 active function source files have now received a static review pass at least once. This is not equivalent to runtime penetration testing, full branch coverage, RPC review, or local parity verification. The previously noted deeper review items remain open, especially the complete `bursar-account-admin` state machine, every `parent-portal-api` action, staff code authorization/audit, and storage/backup behavior.

**Overall parity remains unchanged:** 0/123 source tables individually reconciled; 253 RLS policies, 181 routines and 119 reported triggers are not yet reconciled definition-by-definition. The separate non-internal trigger count of 76 still needs exact reconciliation.


### Public schema — first complete structural inventory (2026-11-14)

A fresh verbose catalog read returned **123 public tables**, all with RLS enabled. The inventory below records table names and broad functional groupings from the live schema catalog. It is a structural inventory, not a reconciliation of each table's full DDL, policies, grants, triggers, indexes, or data semantics.

- **Identity & core (9):** school_sms_outbox, school_position_catalogue, inventory_categories, inventory_items, inventory_movements, daily_collection_records, school_hr_leave_requests, school_provider_integrations, school_record_index
- **Learners & academics (37):** school_classes, students, academic_years, academic_terms, subjects, class_subjects, assessments, assessment_scores, learner_charges, academic_grade_bands, report_card_publications, school_curriculum_subjects, student_class_history, student_status_history, uneb_subject_grade_bands, class_login_directory, class_teacher_access, learner_bursary_awards, parent_guardian_contacts, parent_contact_change_log, learner_conduct_reports, learner_enrolment_periods, guardian_pin_audit, parent_portal_sessions, parent_school_messages, parent_school_message_events, class_subject_teacher_history, parent_report_access_audit, learner_archive_audit, learner_code_aliases, learner_code_change_audit, academic_teacher_directory, class_teacher_directory_assignments, class_teacher_directory_assignment_history, school_admission_enquiries, report_card_review_workflows, report_card_review_events
- **Finance & banking (15):** fee_items, fee_schedules, school_payments, payment_allocations, expense_categories, school_expenses, school_bursary_review_audit, school_bank_accounts, school_bank_transactions, school_bank_transaction_events, school_finance_operator_limits, school_expense_requests, school_expense_request_events, bursar_account_enrollments, bursar_account_enrollment_events
- **Staff & HR (32):** staff_attendance_device_users, staff_attendance_import_batches, staff_attendance_events, staff_attendance_adjustments, staff_work_schedules, staff_attendance_schedule_assignments, staff_communication_posts, staff_communication_comments, staff_communication_reactions, staff_salary_agreements, payroll_periods, payroll_items, staff_attendance_alerts, staff_attendance_deduction_settings, staff_attendance_incidents, staff_salary_advances, staff_direct_messages, staff_call_signals, staff_media_messages, school_staff_directory, school_staff_notices, staff_access_codes, staff_access_code_login_attempts, staff_access_code_audit, staff_activation_codes, staff_activation_code_audit, staff_attendance_policy_settings, staff_attendance_calendar_exceptions, staff_prep_sessions, staff_prep_assignments, staff_scheduled_session_attendance, staff_scheduled_session_incidents
- **Communication (6):** communication_templates, communication_outbox, communication_delivery_events, communication_provider_settings, school_notifications, school_notification_user_state
- **Evidence & files (11):** user_profiles, google_drive_backup_connections, google_drive_backup_oauth_states, google_drive_backup_runs, google_drive_backup_settings, google_drive_backup_validations, evidence_capture_devices, evidence_capture_requests, evidence_capture_files, evidence_capture_reviews, school_document_template_settings
- **Operations & other (13):** school_public_contact_settings, school_apps, school_learning_resources, school_library_books, school_library_loans, school_transport_routes, school_transport_assignments, school_welfare_cases, school_visitor_log, school_assets, school_asset_maintenance, school_calendar_events, school_usage_events

**Catalog-level observations from this pass**
- Every listed public table reported RLS enabled.
- The verbose catalog included columns, data types, defaults/check constraints where exposed, primary keys, and foreign-key references. Those definitions still need a table-by-table comparison against the local migrations.
- Major learner/academic records include `students`, `learner_enrolment_periods`, `learner_code_aliases`, `learner_code_change_audit`, guardian contacts/PIN/session tables, assessments/scores, report-card workflow and publication tables, and class/teacher assignment history.
- Finance is broader than fee collection: fee schedules/charges, payments/allocations, expenses and approvals, bank accounts/transactions/events, operator limits, bursary awards/reviews, bursar enrollment, and SMS/communication outboxes.
- Staff operations include employee directory, access/activation codes and audit, attendance imports/events/adjustments/schedules/incidents, salary agreements/advances, payroll, leave, communication, and special-session governance.
- Other modules include inventory, evidence capture, backup connections/runs/validation, document templates, library, transport, welfare, visitor log, assets/maintenance, calendar, learning resources, school apps, notifications, provider integrations and analytics.
- The catalog reports existing records in the hosted system; no row contents were retrieved by this structural inventory step.

**Immediate parity risks exposed by the structure**
1. Hosted learner identity is more mature than the local foundation: `students` includes permanent admission identifiers, LIN, P7 index, bursary and proration attributes, guardian contact preferences, photo path and archive metadata; additional alias/change-audit and enrolment-period tables exist. Map each field and uniqueness rule before importing learner records.
2. Parent access is a separate security domain: guardian contacts, PIN/recovery state, hashed portal sessions, messages and report-access audit must remain isolated from staff administration and scoped to linked learner IDs.
3. Hosted finance has a multi-stage expense/bank approval workflow and separate bursar enrollment lifecycle beyond the local fee/payment foundation. Do not flatten these into generic expense or payment CRUD.
4. Attendance has two generations of structures (daily attendance and special scheduled-session attendance), plus import/device identity and Director/headteacher review paths. Reconcile semantics before choosing canonical local tables.
5. Hosted backup, evidence and provider integration tables contain credentials, token ciphertexts, hashes or private file references. These fields require secret/key migration design and must never be copied into browser-accessible tables or logs.

**Next reconciliation batch:** extract and compare per-table column definitions, PK/unique/check constraints, foreign keys and indexes for identity + learner + academic tables first; then inspect RLS policy expressions and grants for the same tables. Mark each table individually only after both schema and authorization semantics match. Overall reconciled count remains **0/123** at this stage.


### Identity, learner and academic policy review — first tranche (2026-11-14)

Read-only catalog and policy inspection covered the core identity, learner, guardian, admissions, teacher-assignment, assessment and report-card tables. Local migration source files 001, 005 and 006 were also compared. No hosted rows were read or changed in this policy pass.

**Authorization patterns observed**
- `students`: Admin and academic-leader read paths; assigned class teachers read their class; service-role titles (transport, library, matron, senior staff and school nurse) have a separate active-learner identity read path. Admin-only write policy.
- `assessment_scores`: teachers can insert/update only where the assessment is assigned to them and the learner belongs to the assessment class; academic leaders/Admin can read broader results.
- `assessments`: Admin/DOS management, academic-leader read, and assigned-subject teacher read.
- `class_subjects`: Admin/DOS management; teachers can read only active-dated assignments with at least one explicit capability (marks, reports or parent messaging), including linked teacher-directory identity.
- `school_classes`: Admin management; academic leaders and assigned class teachers read; selected service roles have limited class-name access.
- `parent_guardian_contacts`: Admin-only direct table management policy. Parent portal access is expected to use server-side scoped sessions rather than direct broad table access.
- `report_card_publications`: Admin-only management, with `approved_by = auth.uid()` on writes. Review workflow/events are readable by academic leaders.
- `learner_charges`: Admin create/read and finance-operator read. Creation binds `created_by` to the current Auth user.
- `learner_enrolment_periods`: finance-operator and Admin read policies; no direct write policy appeared in this policy query, so inspect grants and server-side mutation paths before mapping.
- `school_admission_enquiries`: anonymous insert is constrained to pending/unreviewed records; authenticated applicants can insert and read only their own pending enquiries; Admin reviews and reads.
- Academic year, term, subject and grade-band reference data are readable to authenticated users; management is restricted to Admin/DOS helper predicates.
- `user_profiles`: users read their own profile; Admin can read all and update staff profiles.

**Local schema comparison — known gaps/translation work**
- Hosted learner table is `public.students`; local destination is `cornhill_school.learners`. The local design adds a generated permanent `pupil_code`, immutable-code trigger, source UUID mapping, class/status indexes and strict name/LIN/bursary/archive constraints. Hosted `admission_number` must be mapped to the permanent pupil code only after inspecting actual values and confirming it is stable; do not regenerate or overwrite existing codes during import.
- Hosted learner attributes not yet represented one-for-one in migration 005 include alternate guardian details, guardian relationship/email, guardian WhatsApp consent, bursary approver/timestamp, bursary support notes, admission-proration fields and detailed archive actor/previous status. Several are represented in separate local guardian/admission/audit structures rather than on the learner row; create explicit field mapping or additive migration before import.
- Hosted `parent_guardian_contacts` includes PIN/recovery hashes, failed-attempt and lockout state. Local `guardian_contacts` has basic contacts/consent but does not yet carry those hosted PIN lifecycle fields. Local guardian authentication is separately modelled in `cornhill_auth`; map identities/session security deliberately and never copy hashes blindly across different password/PIN schemes.
- Hosted `learner_enrolment_periods` has academic year and term references, re-admission reason and exit metadata. Local `enrolment_periods` currently has class and status history but lacks the same academic-year/term relationship and re-admission reason.
- Hosted academics use `academic_years`, `academic_terms`, `subjects`, `class_subjects`, `assessments`, and `assessment_scores`; local equivalents are `academic_years`, `academic_terms`, `subjects`, `class_subjects`, `assessments`, and `learner_marks`. The local design uses staff-account IDs, term numbers, class-subject composite integrity and per-mark max scores; hosted fields and IDs need explicit mapping.
- Hosted curriculum grouping and UNEB grading (`school_curriculum_subjects`, `uneb_subject_grade_bands`) and teacher/class assignment history require dedicated local destinations or documented derivation; they are not fully represented by migration 006's initial subject/class mapping.
- Hosted report-card review workflow has DOS, Headteacher and Director approval stages and immutable event history. Local migration 006 currently creates assessments/marks only; report-card review, publication, snapshots, approval history, fee-gated guardian access and published report artifact handling remain unimplemented locally.

**Security and migration cautions**
1. Preserve teacher subject-level capabilities and class membership checks; a generic “teacher can edit marks” permission is insufficient.
2. Preserve separation between Admin, DOS, academic viewer, class teacher, subject teacher and finance operator. Local role permissions must encode scope, not just broad titles.
3. Treat guardian PIN/recovery state and portal session hashes as sensitive authentication material. Reissue credentials or migrate only through a separately reviewed compatible verifier; never log or expose them.
4. Anonymous admission enquiry creation needs input limits, abuse/rate controls and pending-only constraints in the local API.
5. Do not infer that RLS-enabled tables with no policy are safe to expose: inspect table grants and server-side access paths. In particular, session/audit/history tables may be intentionally server-only.

**Status for this tranche:** schema and policy findings recorded, but none of these tables is marked reconciled. Need complete per-table unique/check/index/trigger/grant comparison and local authorization route tests. Overall remains **0/123 reconciled**.


## AI-assisted development safety and technical governance requirements (2026-11-14)

**Decision recorded:** CORNHILL will follow an AI-assisted, local-first development model. The school owner may describe required business behavior in ordinary language; AI-assisted development may translate those requirements into code, tests and documentation. The owner is not required to write or understand source code to request changes or review plain-language change reports.

This is an architecture and governance requirement, **not a claim that the controls below have already been implemented**.

### Non-negotiable safety boundaries

1. **No direct AI editing of the live production application or production database.** Development and testing occur in a separate working copy and isolated development database.
2. **No automatic release.** AI may prepare a change and report its evidence; a release must pass the defined checks and receive the required human approval.
3. **Least privilege.** AI development credentials must not possess unrestricted production database, backup deletion, user administration or financial-record privileges.
4. **Protected business data.** Learner identities/codes/LIN, guardian access, marks/report cards, payments/allocations/receipts, bursary balances, staff attendance, salary/payroll, permissions and audit history require explicit migration and review controls.
5. **Traceability.** Every proposed change must identify its request, purpose, author/agent, affected files, relevant database migrations, tests, reviewer, approver, release version and outcome.
6. **Recoverability.** A release must have a verified pre-release backup and a documented recovery plan. Code rollback and database recovery are separate operations; a code revert must never be assumed to reverse a database migration.
7. **No destructive shortcuts.** No automatic table drops, bulk record deletion, production data reset, credential replacement or permission broadening as part of an ordinary feature change.

### Required change lifecycle

| Stage | Required behavior | Gate |
|---|---|---|
| Request | Record the owner's requested outcome and acceptance criteria in plain language. | Confirm scope before implementation when ambiguity could affect records, money, access or policy. |
| Inspect | Read the existing code, dependencies, tests and relevant schema before editing. | Identify impacted modules and protected components. |
| Develop | Make the smallest coherent change in an isolated branch/workspace. | Never edit the live installation. |
| Verify | Run formatting/lint, type/build checks where applicable, automated tests, migration checks and security-specific tests. | Failed or skipped critical checks block release and are reported plainly. |
| Review | Produce a human-readable change summary, file list, risk notes, test evidence and migration/backup plan. | Supervisor review for material changes. |
| Approve | Require designated release approval, separate from the AI authoring identity. | CTO/authorised release approver; additional school approval for sensitive business-policy changes. |
| Release | Apply a signed/versioned release through a controlled updater, with health checks. | Backup verified; compatibility and migration preconditions met. |
| Observe/recover | Record result, monitor health and provide a tested rollback/restore procedure. | Stop rollout and recover safely on failed health checks. |

### Required technical roles and separation

- **Developer/AI agent:** may read approved development sources, edit the isolated development branch, run tests and prepare a release candidate. No routine production write access.
- **Supervisor:** reviews the request-to-change match, affected modules, tests, migration plan and operational impact. Cannot silently approve their own unreviewed change.
- **CTO/release authority:** controls release signing/approval, version promotion and emergency rollback. This technical authority does not grant permission to alter school finance or learner records.
- **School business approvers:** approve changes to fee rules, salary policy, attendance deductions, academic grading, parent access and other school policy. Technical approval alone does not authorise a change in school policy.
- **System administrator:** manages machine/service availability and approved backups, but does not automatically receive unrestricted business-record access.

Accounts must be individually attributable; shared developer or approval accounts are not acceptable. Emergency access must be time-limited, justified and audited.

### AI Change Protection and Audit Centre — planned capabilities

The CORNHILL Technical Administration Centre should eventually provide:
- Change request register and plain-language impact summaries.
- Protected-file/component rules and explicit high-risk change warnings.
- Development branch/workspace status and version history.
- Test results with pass/fail/skipped status and links to evidence.
- Supervisor review and CTO release approval workflow.
- Database migration preview, compatibility checks and migration history.
- Pre-release backup verification and restore-test status.
- Signed release manifests/checksums and updater integrity verification.
- Deployment/health-check history and controlled rollback.
- Append-only audit events for requests, edits, reviews, approvals, releases and recovery actions.

The Centre must not expose source-code secrets, database passwords, signing keys, guardian authentication material or private school records to AI prompts or browser-facing pages. Secrets must be stored outside source control and rotated through a controlled procedure.

### Release and database safeguards

- Use version control with small, reviewable commits and protected release branches.
- Pin and review dependencies; scan for known vulnerabilities and secret leakage.
- Require automated regression tests for affected modules and critical cross-module workflows.
- Database migrations must be versioned, repeatable where practical, checked for destructive operations, and tested against a disposable copy before release.
- Prefer additive, backward-compatible schema changes and staged data transformations. Destructive cleanup requires a separate approved migration and verified restore point.
- Verify backup integrity and periodically test restoration to an isolated environment. A backup that has not been restore-tested is not sufficient evidence of recoverability.
- Use release health checks and a maintenance/stop mechanism. Do not let a failed update leave the school with a half-upgraded application.
- Offline installations must validate update signatures/checksums before applying packages; updates should be transferable through an approved local package without requiring a full reinstall.
- Remote maintenance is disabled by default. If later enabled, it must be explicitly authorised, time-limited, strongly authenticated, narrowly scoped and audited.

### Acceptance criteria before enabling AI-assisted production releases

This governance feature is not complete until tests demonstrate that:
1. AI/developer credentials cannot write to production business tables or modify production application files directly.
2. A change cannot be promoted without passing required checks and the designated approval.
3. Protected components trigger enhanced review and cannot bypass the approval gate.
4. Every change and release has a complete, attributable audit trail.
5. A failed release is detected and the previous application version can be restored.
6. Database migrations have tested backup/restore and recovery procedures, including cases where code rollback alone is insufficient.
7. School records remain intact across an upgrade and are verified with pre/post migration counts and integrity checks.
8. Offline update packages are authenticated and rejected if corrupted or unsigned.
9. Remote maintenance cannot be started without explicit, expiring authorisation.
10. Plain-language status reports clearly distinguish passed, failed, skipped and not-yet-tested checks.

**Implementation status:** REQUIREMENT RECORDED — NOT IMPLEMENTED OR VERIFIED. Do not present the Technical Administration Centre, AI permissions isolation, signed updater, approval gates or rollback automation as existing functionality until code and tests prove them.


### Finance and banking reconciliation — first structural/policy tranche (2026-11-14)

Read-only catalog inspection covered the hosted fee, charge, payment, allocation, expense, bursary-review, bank, finance-limit and bursar-enrollment tables. The corresponding local source `local-server/migrations/007_local_finance_foundation.sql` was inspected. No hosted business rows were selected or changed; catalog row counts are metadata only.

**Hosted source scope**
The tranche covers 16 named public tables: `fee_items`, `fee_schedules`, `learner_charges`, `school_payments`, `payment_allocations`, `expense_categories`, `school_expenses`, `school_bursary_review_audit`, `school_bank_accounts`, `school_bank_transactions`, `school_bank_transaction_events`, `school_finance_operator_limits`, `school_expense_requests`, `school_expense_request_events`, `bursar_account_enrollments`, and `bursar_account_enrollment_events`. All 16 report RLS enabled.

**Hosted authorization patterns observed**
- Fee items and fee schedules: Admin manages; finance operators read.
- Learner charges: Admin creates, with `created_by = auth.uid()`; Admin and finance operators read.
- School payments: Admin creates with `received_by = auth.uid()`, reads and updates; finance operators have a separate read policy. Payment status includes Posted/Reversed; reversal actor, timestamp and reason are represented.
- Payment allocations: Admin creates; Admin and finance operators read.
- Expense categories: Admin manages; finance operators read.
- School expenses: Admin manages; finance operators read. Expense records include posted/voided status and void reason/actor/time fields.
- Finance operator limits: Admin manages limits; a user can read their own limit, Admin can read all.
- Bank accounts: Admin inserts/updates/deletes; Admin and finance operators read.
- Bank transactions and their event history: finance operators read. The transaction model has separate approval, rejection and evidence-verification actors/timestamps and links to evidence-capture devices.
- Expense requests and event history: finance operators read only their own requests/events, while Admin has broader read scope.
- `school_bursary_review_audit` and the two bursar-account enrollment tables had no RLS policies in the policy result. Preserve server-only/deny-by-default behavior until their grants, owners, RPC/Edge Function callers and exact intended access are reviewed; do not add broad authenticated policies by assumption.

These are policy observations, not proof that every write path is complete or that the local service has implemented equivalent authorization. Grants and privileged routines still require detailed review.

**Local migration 007 — what exists**
The local foundation currently creates seven finance tables: `fee_catalogue`, `fee_obligations`, `payment_records`, `payment_allocations`, `payment_receipts`, `finance_audit_events`, and `payment_notification_outbox`. It also defines validation/immutability triggers, a fee-obligation balance view and permission-catalog entries.

Positive controls already present in the migration include:
- UGX-only amounts and positive-value checks;
- separate bursary obligation validation, including rejection of a standard tuition obligation for bursary learners and matching the configured bursary amount;
- draft/posted/voided/reversed payment lifecycle and idempotency key;
- same-learner payment-to-obligation allocation checks;
- full allocation and obligation-overpayment checks before a payment is considered posted;
- immutable financial details after posting and protected issued receipt snapshots;
- receipt creation on posting, with allocation details and balances captured in the receipt snapshot;
- SMS outbox creation only for active guardian contacts with SMS opt-in.

**Material parity gaps — not yet implemented locally**
1. Hosted `fee_schedules` have class, learner-type, academic-year, term and class-group dimensions. Local `fee_catalogue` and `fee_obligations` need an explicit mapping for scheduled fees and class/boarding applicability.
2. Hosted `learner_charges` include invoice number, enrolment-period link, proration days/total days/daily rate and prorated flag. The local obligation model needs an explicit reconciliation for invoice identity and mid-term admission proration.
3. Hosted payment fields include receipt number, payer name, collection item, unallocated amount, reversal details and enrolment-period link. Local payment/receipt fields differ; preserve identifiers and semantics through a documented mapping rather than assuming the local receipt number can replace the hosted value.
4. Hosted `school_bursary_review_audit` is a separate notification-review audit stream. Local finance audit events do not yet prove equivalent linkage or workflow.
5. Hosted expenses include expense categories, payroll-item linkage, posted/voided lifecycle and expense identifiers. Local migration 007 has no expense tables or equivalent expense workflow.
6. Hosted bank accounts, deposits/withdrawals, approval/rejection/evidence verification, bank event history and finance-operator spending limits have no corresponding tables in migration 007.
7. Hosted expense request approvals, evidence requests, event history and the conversion/link to recorded expenses are not represented in migration 007.
8. Hosted bursar enrollment and enrollment-event lifecycle are not represented in migration 007; they must be reconciled with the separate staff-account activation and authorization model.

**Critical workflow requirements to preserve**
- Previous-term debt must remain separately identifiable and optionally payable alongside current-term obligations; allocations and receipts must show each term's applied amount and remaining balance.
- Bursary charges must be obligations with explicit bursary award/approval context, not normal tuition charges relabelled.
- A posted payment must not be silently edited or deleted; correction must use a controlled reversal/adjustment with actor, reason, audit and receipt history.
- Expense and bank workflows must preserve separation between request/entry, approval, evidence verification and final posting; do not flatten these stages into a single “record expense” action.
- Finance operator limits and approval thresholds must be enforced server-side and atomically, not only by hiding UI controls.
- Guardian payment notifications must respect active contact linkage and recorded opt-in; queued notifications must be cancellable when the underlying payment is reversed.

**Status:** 16/16 hosted finance table names and structural definitions captured for this tranche; selected policy behavior recorded; local migration 007 inspected. **0/16 finance tables are marked fully reconciled.** Constraints, indexes, trigger definitions, routine bodies, complete grants, all call sites, data mappings and local authorization/workflow tests remain to be completed. No hosted data or schema was modified.


### Finance deep review — constraints, approval routines and local risk checks (2026-11-14)

This follow-up used read-only PostgreSQL catalog inspection and source retrieval. It did not invoke any finance RPC, Edge Function, payment, approval, reversal, bank or bursary action, and did not read or change school financial transactions.

**Hosted database invariants confirmed**
- Fee schedules enforce positive UGX amounts, allowed learner types and foreign-key links to fee item, class, academic year and term.
- Learner charges enforce positive amounts, unique invoice numbers and links to learner, enrolment period, fee item, academic year and term.
- Payments enforce positive amounts, allowed methods/statuses, bounded unallocated amount, learner/receiver/reversal actor links and enrolment-period link. Allocations enforce positive amounts, unique payment/charge pairs and links to both payment and charge.
- Bank accounts constrain institution/account holder combinations, non-negative opening balances and last-four-digit account-number display. Bank transactions enforce positive amounts, Deposit/Withdrawal direction and a constrained approval/evidence/rejection state machine; account and assigned evidence-device links are restrictive.
- Expense requests enforce positive amounts, permitted payment methods and a staged approval/evidence/cancellation lifecycle. Posted expenses are linked to a category, recorder and optionally a unique payroll item or expense request.

**Hosted routines/workflow behavior inspected**
- Bank withdrawal approval is Admin-only, row-locks the transaction, requires an active evidence device, creates an evidence-capture request, transitions to Awaiting evidence and writes a transaction event. Rejection requires a reason and records the rejecting actor/time. Evidence review updates the bank transaction and appends an event.
- Expense request approval is Admin-only, row-locks the request, requires an active evidence device, creates an evidence request and records approval. Evidence approval transitions the request to Verified and creates the corresponding Posted expense in the same trigger-driven workflow; rejection and evidence re-request are separately represented.
- Payment reversal requires an authenticated Admin and a 5–500 character reason; it row-locks a Posted payment and records Reversed status, actor, timestamp and reason. Posted allocations are excluded from paid totals when payment status becomes Reversed.
- Bursary award routine validates Admin identity, active learner and current-term enrolment, category/amount, reason, active term dates, optional evidence path and duplicate term charges; it uses a transaction advisory lock and checks existing allocations before changing an existing charge.
- Bursar activation routine locks the enrollment and staff directory records, requires approved enrollment, verified matching email, eligible active non-teaching employee, matching bursar job title and no existing profile, then links the profile and writes an activation event. Catalog privilege inspection showed this routine is not executable directly by `authenticated`; the intended trusted Edge/RPC caller and its service boundary must be traced before local porting.
- Finance operator limit setter is Admin-only and validates the target as an active Bursar/Deputy Bursar, with positive enabled limits and single-expense limit no greater than daily limit. This setter alone does not prove that the limits are checked atomically in every expense creation/posting path; enforcement call sites remain to be traced.

**Local finance migration comparison — additional critical gaps**
- Local migration 007 requires every posted payment to be fully allocated to obligations. Hosted payment records explicitly support a non-zero `unallocated_amount_ugx` remainder. This is a behavioral difference, not merely a renamed column. The local design must decide and document whether partial/unallocated receipts are supported; do not silently discard or auto-allocate amounts without preserving the hosted semantics and the school's approved rules.
- Local migration 007 has a controlled payment lifecycle and immutable receipt snapshot. It also cancels queued notification-outbox rows on reversal. Hosted reversal routine changes payment status and hosted SMS trigger only queues on Posted; a separate audit of already queued/delivered notification behavior and retry worker is still required.
- Local `finance_audit_events` is a table foundation, but the reviewed migration does not yet prove that all posting, voiding, reversing, fee adjustment, receipt reprint, expense and banking operations write complete immutable audit events with actor and reason.
- Local migration 007 defines permission catalogue entries for expenses and banking, but contains no expense/bank tables or posting routines. Permission catalogue entries are not grants or implementation.
- Local receipt snapshot captures allocation/term/year and balance-at-issue, but parity still requires hosted invoice/receipt identity mapping, payer/collection fields, previous-term debt behavior, and support for partial allocations if approved.

**Security and correctness checks still required**
1. Trace all function execute grants, owners, SECURITY DEFINER search paths, and exact Edge/RPC callers, especially bursar activation and finance-limit enforcement.
2. Find every expense insert/posting path and prove the configured single/daily limits are enforced under concurrency, not only configured by an Admin routine.
3. Inspect payment create/post routine end-to-end, including idempotency/concurrent allocation, unallocated balance handling, reversal audit, receipt snapshot, and queued SMS cancellation/retry behavior.
4. Inspect bank deposit recording and reconciliation, including duplicate bank references, account balance derivation, reversal/correction model and evidence approval separation.
5. Confirm expense payroll-item links cannot double-count payroll expenses and that void/reversal never deletes source evidence or audit history.
6. Verify all privileged routines are explicitly granted only to intended roles; absence of RLS policies on server-managed enrollment/audit tables is not permission to expose them.

**Status:** This tranche adds hosted constraint and selected routine behavior evidence for the finance/banking review. It does not change the previous completion count: 0/16 hosted finance tables are fully reconciled. No local migration or hosted schema/data was changed.


### Finance posting and privilege-boundary review — payment RPC and supporting workflows (2026-11-14)

Read-only review of selected hosted routine definitions and EXECUTE privileges. No routine was invoked and no financial rows were read or changed.

**Payment posting routine — confirmed behavior**
- `post_school_payment_with_allocations` is executable by `service_role`, not by `authenticated` or `anon` according to the inspected privilege checks. The routine itself still requires a non-null `auth.uid()` and `is_school_admin()`. Its actual caller must therefore be traced carefully: a bare service-role call with no end-user JWT context would fail the internal identity check. Do not weaken this check or grant direct authenticated execution merely to make the UI work; establish a trusted server call that preserves verified end-user identity.
- The routine validates positive payment amount, payment method, learner existence, allocation JSON type, allocation ownership and available charge balance. It locks each selected charge row while calculating paid totals, which helps serialize competing allocations against the same charge.
- It supports both explicit allocations and automatic oldest-charge-first allocation. The amount not allocated is retained in `unallocated_amount_ugx`; this confirms hosted support for partial/unallocated receipts.
- It creates a Kampala-year receipt number and records the authenticated receiver. The routine does not accept a caller-supplied idempotency key. The local migration's idempotency-key design is an improvement but requires a stable client request key and retry tests so a network retry cannot create a second receipt.
- Manual allocation input should be tested for duplicate charge entries, integer overflow/sum bounds and transaction rollback. Existing unique payment/charge constraints may reject duplicate charge rows, but the routine should return a safe, understandable error and leave no partial receipt.

**Payment reversal and notification behavior**
- `reverse_school_payment` is executable by `authenticated`, is not SECURITY DEFINER, verifies Admin identity, requires a reason and locks the posted payment before reversal. A trigger cancels still-pending parent SMS rows for the reversed payment. Already sent notifications cannot be recalled; delivery worker behavior and audit evidence remain to be inspected.
- The posting routine is service-role-only while reversal is authenticated-callable. This asymmetry is intentional only if the server-side posting boundary is verified and documented; local architecture should have one consistent, explicit trust model.

**Bursary review and spending-limit controls**
- `record_school_bursary_review_event` is authenticated-callable and SECURITY DEFINER, but checks `auth.uid()` and Admin status and limits actions to `opened` or `marked_reviewed`. Repeated `marked_reviewed` events by the same actor are idempotent via a partial unique conflict target; open events can be recorded more than once.
- `set_school_finance_operator_limit` is authenticated-callable and SECURITY DEFINER, validates Admin identity and an active Bursar/Deputy Bursar target, and validates the configured single and daily limits. It is only a configuration routine. No evidence from this routine alone proves that all expense paths enforce the limits or that daily totals are locked atomically against concurrent requests.

**Evidence approval and ledger posting**
- Expense approval requires Admin identity, locks the request, requires an active capture device, creates an evidence request and appends an approval event. Evidence approval later locks the request, marks it Verified, inserts a Posted expense with a unique request link and records a verification event. This provides a clear separation between request approval and evidence verification before ledger posting.
- Bank withdrawal approval similarly locks the transaction, requires an active evidence device, creates a capture request and records an approval event. Evidence review changes the transaction to Verified or Evidence rejected and appends an event. The reviewed routine set did not establish the complete deposit-recording, bank balance reconciliation or final withdrawal settlement model.
- Bursary award and enrollment activation routines use row locks and validate role/learner/employment context. Continue reviewing audit completeness and trusted caller paths before implementing local equivalents.

**Required local design decisions before coding**
1. Preserve unallocated payment balances and allow the bursar to allocate them later through a separately audited operation; never silently discard excess cash or force it onto an unrelated charge.
2. Add a request idempotency key to the local posting contract and enforce it with a unique database constraint, while retaining the original receipt result for safe retries.
3. Ensure the local payment endpoint derives the acting staff identity from a verified session, not from a client-supplied user ID. Restrict posting to the authorised finance/admin permission model and audit every operation.
4. Make allocation updates transactional, row-locked and same-learner validated; define whether prior-term debt is automatically prioritised or explicitly selected, in accordance with the school's approved payment allocation policy.
5. Enforce single-transaction and daily finance operator limits inside the same database transaction as expense posting, with concurrency-safe account/day locking and independent approval thresholds.
6. Preserve separate expense request, approval, evidence capture, evidence verification, ledger posting and reversal/void events. Do not allow direct expense insertion to bypass required approval/evidence controls.
7. Document the intended service-role/user-JWT boundary for every privileged RPC, with tests proving anonymous calls fail and authorised/unauthorised staff are correctly distinguished.

**Status:** Additional hosted payment routine and EXECUTE privilege behavior documented. This is still partial finance reconciliation; **0/16 finance tables are fully reconciled**. Actual Edge Function/UI callers, all expense-limit enforcement paths, deposit posting, bank balances, notification delivery, and local end-to-end tests remain pending. No hosted or local database changes were made.


### Finance event-trigger and notification review (2026-11-14)

Read-only inspection of non-internal triggers and their function bodies on payment, expense, bank and evidence tables. No triggers were fired and no business rows were read or changed.

**Confirmed trigger paths**
- New payment insert invokes `assign_current_enrolment_to_new_payment` before insert. If no enrolment period is supplied, it assigns the latest active enrolment for that learner; if none exists, it rejects the payment insert.
- New payment insert invokes `queue_parent_payment_sms` after insert. The trigger function only queues when payment status is already `Posted`, and only when the learner's guardian SMS opt-in is true and a guardian phone is present. The outbox insert is idempotent per payment (`ON CONFLICT(payment_id) DO NOTHING`). Confirm the payment table default status and outbox worker behavior before assuming every posting creates a deliverable message.
- Payment transition to `Reversed` invokes a trigger that changes linked SMS rows still in `Pending` status to `Cancelled`. It does not cancel messages already being processed or delivered; worker concurrency/claim semantics and delivery event history still need review.
- Evidence-file insertion creates a `school_record_index` entry linked to the capture request and source context, with duplicate file indexing prevented by conflict handling.
- Evidence submission status change to `Submitted` creates an idempotent Admin notification asking for original-file review.
- Bank transaction insert/status changes create deduplicated notifications. Awaiting approval/evidence is routed to Admin audience; later status updates are routed to the original entrant. Notifications carry finance workspace action metadata.
- Expense request insert/status changes similarly create deduplicated Admin or entrant notifications. This is a notification workflow, not proof of permission to approve or post.
- Evidence review insertion has two separate trigger handlers: bank evidence updates the linked bank transaction to Verified or Evidence rejected and appends a bank event; expense evidence locks the linked expense request, marks it Verified, inserts the corresponding Posted expense (unique by request link), and appends an event. The expense conversion is trigger-driven and occurs within the evidence-review transaction.

**Local parity and test requirements**
1. Preserve active-enrolment assignment and fail closed when no valid enrolment exists; also preserve explicit historical enrolment linkage when a payment is posted for an earlier period.
2. Queue guardian notices only after a successfully posted receipt and only for the correct active, approved guardian contact with explicit opt-in. Do not treat a phone field alone as consent.
3. Design an outbox worker with atomic claiming/leases, retry limits, provider response capture, idempotency and a terminal state model. Reversal must cancel unclaimed pending messages and safely coordinate with in-flight delivery; do not claim that already-sent SMS can be recalled.
4. Preserve evidence file-to-request-to-source-record indexing and keep original evidence immutable. Rejected or replaced evidence must remain in the audit trail.
5. Keep notifications deduplicated and audience-scoped, but always re-check authorization at action time; a notification payload must never grant access.
6. Test the expense evidence-review trigger for duplicate review delivery, concurrent review, rejected evidence, re-requested evidence, and exactly-one posted expense per approved request.
7. Test bank status transitions and event/notification consistency, including evidence re-request and rejection. A Verified status must not be misrepresented as proof that bank balances have been reconciled.

**Outstanding source questions**
- Inspect the SMS outbox worker and communication delivery events for claim/lease/retry semantics, provider delivery receipts, consent changes after queueing, and handling of permanent failures.
- Trace the exact application/server caller for `post_school_payment_with_allocations`; its inspected EXECUTE grant is service-role-only, while its function body still requires `auth.uid()` and Admin status. Repository code search did not surface the function name in the indexed branch search, so caller mapping is not yet established.
- Inspect bank deposit creation and final bank ledger/balance derivation, plus direct insert/update grants and triggers. Current review confirms the approval/evidence path but not complete bank accounting.
- Inspect every direct expense insert path and the finance operator limit checks; no trigger reviewed here enforces configured single/daily spending limits.

**Status:** Trigger-driven finance and evidence behaviors documented. Finance remains partially reconciled, with **0/16 source finance tables fully reconciled**. No local migration or hosted schema/data was changed.


### Finance outbox, bank ledger boundary and payroll-expense linkage review (2026-11-14)

Read-only review of hosted table columns, constraints, selected routines and Edge Function inventory. No SMS was sent, no Edge Function endpoint was invoked, and no financial records were read or changed.

**Parent SMS outbox — confirmed schema and limitation**
- `school_sms_outbox` stores student/payment IDs, destination phone, message body, status (`Pending`, `Sent`, `Failed`, `Cancelled`), provider, provider message ID, attempt count, last error, creation time and sent time. It has a unique payment ID and a nonnegative attempt counter.
- The inspected schema has no explicit claim/lease owner, claim expiry, next-attempt timestamp, last-attempt timestamp, delivery-receipt timestamp, or append-only per-attempt event table. The inventory of 11 active Edge Functions did not reveal a dedicated SMS sender/worker function. This does not prove no external worker exists, but the worker is not established by the inspected Supabase Edge Function list.
- The reversal trigger cancels only rows still marked `Pending`. Without a proven atomic claim/lease protocol, a worker could race with reversal or leave a row stuck. `Sent` means the application marked it sent; provider delivery confirmation is not demonstrated by the columns reviewed.
- The trigger snapshots the guardian phone and consent at payment insertion. A consent withdrawal or phone change after queueing needs an explicit pre-send policy and a final consent re-check. The current reviewed schema does not establish that check.

**Bank transaction accounting — important gap**
- `create_school_bank_transaction` permits authorised finance operators to record a positive deposit or withdrawal. Deposits immediately enter `Awaiting evidence` and create an evidence request; withdrawals enter `Awaiting approval` and are not included in a verified balance until authorised and evidence is approved.
- Bank account columns include opening balance and account metadata, but no derived/current balance column. The inspected bank transaction/event model records workflow status and events, not a complete immutable double-entry ledger or reconciliation statement.
- The bank transaction constraints enforce direction, positive amount, allowed workflow status, and withdrawal approval-state consistency. The transaction number is unique. No unique constraint on bank reference was found in the reviewed constraints, so duplicate bank references across one account need a defined matching/reconciliation rule rather than assuming uniqueness.
- A Verified evidence status is not, by itself, proof that the bank statement was reconciled or that the transaction is included in a final balance. Local design must separate entered, approved/evidence-verified, statement-matched, posted-to-ledger and reconciled states where required.

**Payroll-to-expense linkage — confirmed control and remaining risk**
- When a payroll item changes to `Paid`, the hosted trigger requires its payroll period to be `Approved` or `Part-paid`, creates a `Salaries & wages` expense, and updates the payroll period to `Paid` or `Part-paid` based on remaining unpaid items.
- `school_expenses.payroll_item_id` has a unique constraint, which prevents more than one expense row from linking to the same payroll item. The expense row retains a foreign key to the payroll item.
- This is a useful double-counting safeguard, but local implementation must also test transaction rollback, status correction/reversal, payroll item re-payment, voided salary expense handling, and reconciliation between payroll totals and expenditure totals. Do not create a second manual salary expense for a payroll item already represented by the trigger.
- Payroll item deductions and advance recovery are bounded by gross pay in hosted constraints. The local policy must still ensure every deduction has a lawful/approved reason and is not automatically inferred from attendance incidents.

**Local implementation requirements**
1. Design a durable SMS outbox worker with atomic `SKIP LOCKED` claiming or equivalent leases, bounded retry/backoff, idempotency, provider response capture, dead-letter/manual retry, and immutable attempt history.
2. Re-check active guardian link, current phone and explicit SMS consent immediately before sending. On reversal, cancel pending work and safely coordinate in-flight delivery; preserve the fact that already-submitted SMS cannot be recalled.
3. Keep receipt notification content minimal and avoid exposing unnecessary learner details. Record delivery status separately from provider acceptance where the provider supports delivery receipts.
4. Design bank balances from verified ledger entries and opening balances, not from unreviewed requests. Add statement import/matching, duplicate-reference warnings, reconciliation periods and adjustment events with dual control.
5. Keep bank deposit and withdrawal workflow distinct from actual ledger posting. Rejected evidence, replacement evidence, voids and corrections must remain auditable.
6. Preserve unique payroll-item-to-expense linkage and add tests for retries, reversals, voids and payroll reconciliation. Attendance-related pay adjustments remain review-and-approval decisions, never automatic.

**Status:** SMS outbox and bank/payroll accounting boundaries documented. Finance remains partially reconciled, with **0/16 hosted source finance tables fully reconciled**. SMS sender/worker caller, bank reconciliation/ledger, expense limit enforcement and full local end-to-end tests remain pending. No hosted or local database changes were made.


### Finance limit enforcement, direct expense paths and attendance-to-payroll trigger review (2026-11-14)

Read-only review of hosted function definitions, execute ACLs, triggers and table constraints. No routines were invoked and no school or payroll rows were read or changed.

**Expense limits — concurrency weakness identified**
- `create_school_expense_request` is authenticated-callable, SECURITY DEFINER, owned by `postgres`, and checks that the caller is an active finance operator. For non-admin operators it loads the enabled single/daily limits, checks the single request ceiling, then sums that user's non-cancelled expense requests created on the current Kampala date before inserting a new `Awaiting approval` request.
- The routine does not take a per-operator/day lock or otherwise serialize the read-sum-insert sequence. Two simultaneous requests can both observe the same daily total and both pass, exceeding the configured daily cap. The limit check is therefore not concurrency-safe as inspected.
- The sum is based on requests, not a separately locked daily spending ledger. A robust local design should reserve the amount atomically at request creation, release reservations on cancellation/rejection as policy defines, and separately reconcile approved/posted spend. Lock a stable operator/day row or use an equivalent serializable/atomic reservation mechanism; test concurrent requests.
- The inspected Edge Function inventory contains no clearly named finance expense/payment/SMS worker function. This is an inventory observation, not proof that no external or client-side caller exists. `create_school_expense_request` and approval routines are database RPC paths.
- `school_expenses` also receives posted expenses through the evidence-review trigger and payroll payment trigger. The payroll trigger inserts the salary expense automatically when a payroll item becomes Paid. The unique `payroll_item_id` constraint prevents a second linked salary expense for that item. Direct admin expense insertion paths and their exact UI callers still need separate mapping.

**Critical attendance/payroll policy difference**
- Hosted trigger `apply_attendance_deductions_to_payroll` runs BEFORE INSERT on `payroll_items`. When a new item is Pending, it sums all `approved_deduction_ugx` for that staff member's approved attendance incidents within the payroll period and automatically adds that sum to `deductions_ugx`. It rejects if deductions plus advance recovery exceed gross pay.
- A second trigger, `settle_staff_advance_recovery`, runs after a payroll item changes to Paid. It reduces outstanding approved salary advances by the manually recorded `advance_recovery_ugx`, then marks matching approved attendance incidents as `deducted` and links them to the payroll item.
- This hosted automatic deduction-on-payroll-insert behavior differs from local migration 009's governance model, where an attendance incident does not automatically deduct pay and must pass the specified review/decision controls. **Do not copy the hosted auto-add trigger into the local system.** Local policy must require the Headteacher/DOS statement, Director review/decision and an explicit payroll-authorized deduction amount; the payroll preview must visibly itemize and require confirmation. Incident approval alone must not silently alter salary.
- Advance recovery must remain a separately identified, approved, bounded payroll item with an auditable allocation to the relevant advance(s). The settlement trigger's row locks are useful, but concurrency/retry and exact payment correction behavior need tests.

**Local design/test requirements added**
1. Enforce single and daily operator limits atomically under concurrent submissions; include simultaneous requests, cancellation, rejection, Kampala date boundary and role-disable tests.
2. Make the daily policy explicit: whether it caps requested, approved, committed or paid amounts. Do not conflate request reservation with posted expenditure.
3. Map every route that can insert a `school_expenses` row; non-payroll expenses must follow the approved request/evidence workflow, and payroll-generated expenses must remain unique per payroll item.
4. Verify payroll payment retries/rollback and ensure salary expenses reconcile exactly once with net pay, without a second manual salary expense.
5. Preserve local non-automatic attendance deduction governance. Require explicit decision, reason, amount, period and payroll approval; retain an audit trail and allow corrections through controlled adjustments rather than silently rewriting history.
6. Test advance recovery against multiple outstanding advances, concurrent payroll payments, partial recovery, duplicate payment attempts and reversed/corrected payroll payments.

**Status:** A concrete concurrency weakness in hosted daily expense-limit enforcement and an important hosted/local attendance-deduction policy divergence have been documented. Finance remains partially reconciled, with **0/16 hosted source finance tables fully reconciled**. No database, Edge Function, production or local schema changes were made.


### Read-only application-caller trace: expense requests and payment posting (2026-11-14)

The current branch's tracked top-level application HTML files were inspected for the hosted finance RPC/table identifiers. No page or function was invoked with school business data.

**Confirmed expense-request UI caller:**
- `banking.html` loads active `expense_categories`, the latest 100 `school_expense_requests`, and finance-operator limits.
- The expense-request form calls `db.rpc('create_school_expense_request', ...)` with date, category, amount, description, optional payee, payment method/reference and receipt reference.
- The same page calls `set_school_finance_operator_limit` from the Admin-only limit form.
- The page's UI disables non-Admin submissions when no enabled limit is loaded, but this is only a usability control. Server-side authorization and concurrency-safe limit enforcement remain mandatory.
- The request UI says approval is required before paying the supplier; it then refreshes the request queue. The Admin approval/rejection controls and bank/evidence controls are on this page.
- No direct `school_expenses` insert was found in the inspected top-level HTML pages. The known hosted evidence-review and payroll triggers remain the documented expense-posting paths. This is not proof that no other external, legacy, or uninspected caller exists.

**Payment-posting caller remains unresolved:**
- A targeted search across the tracked top-level HTML pages did not locate a call to `post_school_payment_with_allocations`, nor direct references to `school_payments` or `payment_allocations` in those pages.
- The active Edge Function directory contains seven tracked function folders in this branch; none is named as a finance/payment posting function. This does not exclude an external worker, a dynamically assembled call, another deployed function not represented in this repository snapshot, or a different client entry point.
- Do not infer that payment posting is unused or safe to replace. Before local finance implementation, trace the actual hosted payment-entry UI and caller, identify how the authenticated Admin identity reaches the service-role-only routine, and document retry/idempotency and error handling. If the current caller cannot be found, record the gap as BLOCKED rather than inventing a replacement flow.

**Local parity actions:**
1. Preserve the expense request -> Admin approval -> evidence capture/review -> exactly-one posted expense workflow, with actor, timestamps, reasons and append-only events.
2. Implement the daily limit check as an atomic reservation/transaction, not a client-side pre-check or unlocked read-sum-insert. Define whether requested, approved, verified, posted or paid amounts consume the cap, and how rejection/cancellation releases reservations.
3. Map every local expense posting route, including payroll-generated salary expenses, and enforce a unique source link plus transaction-level idempotency.
4. Keep the payment-posting caller BLOCKED until the authenticated caller path, allocation behavior, unallocated balance behavior and retry semantics are evidenced.
5. Re-run a repository-wide caller scan before cutover, including minified bundles, dynamically loaded modules, external integrations and all deployed Edge Function source versions.

No migration was added or applied. No hosted database, financial record, Edge Function, or production deployment was changed.


### Batched finance workflow review: payment RPC generations, payroll expense posting and SMS suppression (2026-11-14)

This pass reviewed the tracked payment, expense/payroll and SMS migration definitions together with the banking-page caller. No RPC was invoked and no school financial or guardian-contact rows were read or changed.

**Payment RPC generations must not be confused:**
- The earlier `post_school_payment_with_allocations` routine is explicitly deprecated and its client execution was revoked by migration `20261106202809_revoke_legacy_payment_rpc_client_access.sql`.
- Migration `202611050001_atomic_school_payment_posting.sql` introduced `post_school_payment_complete`, a SECURITY INVOKER routine that requires an authenticated Admin. It accepts explicit allocations, collection item and payer name; serializes posting per learner with an advisory transaction lock; validates charge ownership and remaining balances; creates a Kampala-year receipt number; and returns any unallocated amount.
- Migration `20261111185000_bursar_payment_posting_director_reversal.sql` later introduced `post_school_payment` for active finance operators. It is SECURITY DEFINER with an empty search_path and checks the active finance-operator predicate internally. It creates the receipt and automatically allocates oldest-first against learner charges, retaining any remaining unallocated amount. It does not expose the richer payer-name, collection-item or caller-supplied allocation parameters available in `post_school_payment_complete`.
- The later migration also removes the legacy finance-operator direct INSERT policy on `school_expenses`, keeping Bursar expense entry on the request/approval/evidence workflow. It keeps payment reversal Admin-only, requires a 5–500 character reason, locks the posted receipt, and records actor/time/reason.
- The large minified `index.html` (1.16 MB, single-line source) could not be safely searched through the available file retrieval path in this pass. Therefore the exact live UI call site and which payment RPC it invokes remain BLOCKED. Do not guess which RPC is currently used or port both as equivalent. A local payment UI must deliberately preserve the required collection item, payer details, explicit/automatic allocation, unallocated balance and Bursar-vs-Director authorization behavior.

**Payroll-to-expense conversion:**
- The original hosted payroll trigger creates a Salaries & wages expense when a payroll item transitions to Paid (or is inserted already Paid), and stores the source payroll item ID.
- The `payroll_item_id` unique constraint prevents more than one expense row from linking to the same payroll item. The trigger raises if the Salaries & wages category is missing, so the payroll payment and expense creation are transactionally coupled.
- The later Bursar-control migration removes direct finance-operator expense inserts; payroll-generated expenses remain a distinct system-generated path. Local parity must preserve source linkage, exactly-once creation, transaction rollback on failure, and a controlled correction/reversal path if a paid payroll item is later corrected.

**Guardian payment SMS lifecycle:**
- The SMS outbox migration creates one outbox row per payment (unique payment ID), with a snapshot of learner, destination phone and message body, status, provider, provider message ID, attempt count, last error and sent timestamp. The table is Admin-readable; ordinary authenticated users do not receive direct write privileges.
- Queueing is trigger-based on payment insertion, but the trigger only queues when the inserted payment is already Posted and the guardian has opted in with a phone number. Confirm actual payment status defaults and trigger timing before assuming every posted receipt is queued.
- The reversal migration changes only linked `Pending` outbox rows to `Cancelled`. It does not recall messages already claimed, in flight, marked Sent or delivered by a provider.
- The reviewed schema still lacks an explicit worker lease/claim token, lease expiry, next-attempt time, per-attempt event history and provider delivery-receipt timestamp. No dedicated SMS sender was identified among the seven tracked function folders. An external worker remains possible but unverified.
- Local parity requires an atomic claim/lease protocol, bounded retry/backoff, idempotent provider requests, attempt audit, terminal/dead-letter handling, pre-send revalidation of guardian link/phone/consent, and race-safe cancellation when a receipt is reversed. A local Sent state must not be presented as provider-confirmed delivery without a delivery receipt.

**Batch disposition:** these findings add implementation requirements, not new local schema. The current local migration 007 remains a finance foundation only; it is not yet a full replacement for the hosted payment, expense, payroll, bank and SMS workflows. No migration was added or applied.

### Batched finance, payroll and attendance acceptance review (2026-11-14)

This pass compared the existing hosted acceptance-test evidence and selected hosted migration definitions with the local-first parity requirements. Inspection only: no RPCs, payment, payroll, attendance, bank or guardian data was changed.

**Payment posting and authorization**
- The finance acceptance document confirms source-level review of atomic per-learner payment posting, explicit previous-term selection, current-term-first automatic allocation, unallocated credit, and reasoned Director/Admin reversal. It explicitly lists authenticated transaction execution, rollback, concurrent posting, balance reconciliation, and standard/thermal receipt printing as pending.
- The hosted schema has two materially different posting generations: the richer Admin-only `post_school_payment_complete` (payer and collection item plus explicit allocation input) and the later finance-operator `post_school_payment` (Bursar posting, oldest-first allocation, no payer/collection-item arguments). Local design must not silently discard payer/collection details or the Bursar/Director split.
- The exact live payment UI caller remains blocked by the very large minified application bundle. This is an explicit cutover blocker, not evidence that payment entry is unused.

**Payroll and attendance policy**
- The hosted salary/expense migration creates a Salaries & wages expense when a payroll item becomes Paid, linked uniquely to its payroll item. The trigger requires the category and runs in the same transaction; local parity must retain exactly-once expense creation and rollback if expense creation fails.
- The hosted attendance-payroll migration automatically adds approved attendance incident deductions when a Pending payroll item is inserted. This is a policy mismatch with local migration 009 governance. Do not copy this trigger: local attendance deductions require the defined statement, review, explicit decision, reason, amount and payroll authorization. A preview must itemize the deduction before confirmation.
- Hosted advance recovery is a separate payroll amount settled against approved outstanding advances on payment. Local implementation must preserve separate advance allocations and test partial recovery, multiple advances, retries, concurrency and corrections.
- Existing attendance acceptance checks passed structurally over empty tables. The eight inspected attendance tables contained zero rows at the recorded check, so those passes do not establish real clock-in/out, late calculation, CSV import, offline sync, correction review or payroll integration.

**Fingerprint device boundary**
- The hosted attendance foundation supports administrator-imported USB CSV logs, staff/device ID mapping, event deduplication and append-only raw attendance events. It does not connect a physical terminal or store biometric templates.
- The fingerprint integration plan requires supplier verification of exact model/firmware, raw export columns, timezone, offline backfill and a pilot before hardware activation. A USB-host flash-drive export must not be confused with direct PC USB integration.
- Physical terminal connection and a real-device pilot remain pending. Keep biometric templates on the device; local records should contain only necessary staff/device identifiers and event metadata.

**Banking and expense workflow**
- The banking acceptance guide describes a verified balance as opening balance plus verified deposits minus verified withdrawals. Pending approval/evidence, rejected and cancelled transactions are excluded. Evidence approval is not a bank-statement reconciliation; local design should retain separate evidence-verification and statement-reconciliation states.
- Bank evidence capture and the hosted banking workflow require connectivity. Do not silently allow the offline shell to record real banking transactions unless a separately designed, auditable offline ledger and conflict policy are implemented.
- Non-payroll expenses must preserve request, approval, evidence review and exactly-once posting. Finance-operator daily limits require atomic reservation under concurrency; the currently reviewed hosted request routine has a read-sum-insert race.

**Batched test disposition**
- Structural/source evidence exists for payment posting/reversal, payroll-to-expense linkage, attendance event schema, device mapping and bank evidence workflows.
- End-to-end tests remain pending for authenticated Bursar/Admin payment sessions, payment concurrency/rollback, receipt printing, expense-limit concurrency, bank statement reconciliation, payroll payment and advance recovery, attendance schedule/clock events, CSV duplicate imports, offline synchronization and real fingerprint hardware.
- Empty-table integrity checks must be reported as structural checks only, not as successful workflow tests.

**Cutover blockers retained:** exact active payment UI RPC caller; verified local finance expense/bank/SMS implementation; atomic finance-limit enforcement; explicit attendance/payroll decision flow; isolated end-to-end test environment; and real receipt-printer/device pilot. No local migration was added or applied in this review.

### Local finance payment posting — Batch 15 (2026-11-14)

Migration 010 adds payer and collection item details plus an unallocated UGX amount. Posted receipts reconcile the payment total as allocated amounts plus retained credit. The receipt snapshot preserves payer/collection fields and unallocated balance.

A SECURITY DEFINER routine performs payment posting with an active staff/employment check, explicit `finance.payments_record` permission, learner and obligation ownership checks, learner-row serialization, balance validation, idempotent retry, receipt creation and audit recording in one transaction. A new guard closes the posted-allocation UPDATE path. The finance API role is separate from the authentication runtime role, remains NOLOGIN and has no direct access to finance tables or receipt sequence.

A synthetic PostgreSQL verifier is added for split old-term/current-term allocations, unallocated credit, idempotent retry, negative authorization/overpayment/mutation cases, receipt snapshot and consent-gated outbox. CI and the Windows installer provision the restricted roles. **The new CI result is pending.** The new work has not been applied to the school's existing local database.

**Still pending:** a secure authenticated HTTP API and finance screen; a controlled later-allocation operation for retained credit; role matrix approval; expenses and approvals; bank ledger and statement reconciliation; SMS worker; thermal-printer receipt layout; and a real-data migration rehearsal. No hosted backend or school data was changed.

### Authenticated local Bursar API — Batch 16 (2026-11-14)

Added migration 011 with SECURITY DEFINER learner-search and learner-fee-account read functions. Each routine independently checks active staff employment and the explicit `finance.payments_record` permission. The finance API role receives EXECUTE on these functions only, not direct finance-table access.

The local HTTPS route handler now has learner-search, learner-account and payment-posting endpoints. It derives the actor staff ID only from the authenticated session, enforces the finance permission, HTTPS/Host checks, CSRF and same-origin POST requirements, plus UUID idempotency keys and strict amount/allocation input validation. Separate auth and finance pools are composed when a private finance-runtime credential is configured. A placeholder environment secret keeps finance API activation disabled by default.

HTTP handler tests and PostgreSQL integration checks are added for authorization, payload boundaries, payment idempotency, learner lookup, fee balances and direct-table privilege denial. CI for Batch 16 is pending. No finance credentials are activated on the Windows school database, and no hosted resource or school record has been changed.

**Still pending:** a working Bursar frontend page, secure runtime credential activation procedure, later-allocation workflow for retained credits, thermal receipts, expense approvals, bank reconciliation, SMS worker, broader accounting and full cutover parity.
