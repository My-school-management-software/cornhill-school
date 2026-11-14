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
