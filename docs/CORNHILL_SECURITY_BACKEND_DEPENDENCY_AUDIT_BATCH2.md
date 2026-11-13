# CORNHILL Security and Backend Dependency Audit — Batch 2

Date: 2026-11-13
Scope: read-only inspection of Supabase metadata and active Edge Function source. No production data or configuration was changed.

## 1. The 26 RLS-enabled tables without policies

The current database grant inventory shows that these 26 tables grant table privileges to `postgres` and `service_role`, but not to `anon` or `authenticated`:

- bursar_account_enrollment_events
- bursar_account_enrollments
- class_subject_teacher_history
- communication_delivery_events
- communication_provider_settings
- google_drive_backup_connections
- google_drive_backup_oauth_states
- google_drive_backup_runs
- google_drive_backup_settings
- guardian_pin_audit
- learner_archive_audit
- learner_code_aliases
- learner_code_change_audit
- parent_portal_sessions
- parent_report_access_audit
- parent_school_message_events
- parent_school_messages
- school_bursary_review_audit
- school_notification_user_state
- school_notifications
- school_usage_events
- staff_access_code_audit
- staff_access_code_login_attempts
- staff_access_codes
- staff_activation_code_audit
- staff_activation_codes

Interpretation: this supports the hypothesis that these tables are intentionally backend/service-role-only. It does not prove that every access path is safe. During migration, expose them only through narrowly scoped API operations with explicit authorisation and audit logging. Do not add broad browser roles or generic CRUD endpoints.

## 2. Database dependency characteristics

The schema inventory reports 267 foreign-key constraints, 181 routines/functions, 119 triggers and 6 public views. The routine inventory includes numerous SECURITY DEFINER functions.

High-impact business rules identified by routine/trigger names include:

- Permanent learner-code assignment and invoice numbering.
- Fee schedules, bursary awards, learner charges and credit allocation.
- Assessment score protection after report-card publication.
- Teacher class/subject access enforcement.
- Parent/guardian PIN lifecycle and access-session validation.
- Staff activation/access-code verification and audit.
- Evidence review actions that can post expenses or update bank transactions.
- Payroll payment and attendance-deduction processing.
- Inventory prevention of negative stock.
- School notification and communication delivery events.

These behaviours are part of the system's business logic. Replacing only table CRUD would break important school workflows. Every SECURITY DEFINER routine must be reviewed for caller checks, search_path safety, grants, and transaction semantics before porting.

## 3. Active Edge Function inventory

All 11 active function sources were retrieved for structural inspection. Source code and secret values are intentionally not reproduced in this document.

| Function | JWT verification | Main database areas observed |
|---|---|---|
| staff-invite | true | user_profiles, school_staff_directory, academic_teacher_directory |
| class-teacher-code | true | user_profiles, school_classes, curriculum subjects, class access and login directory |
| google-drive-backup | false | backup OAuth states, connections, runs, settings and validations |
| parent-portal-api | false | parent sessions/contacts, learners, charges, payments, terms, messages, report access audit, learner photos and voice notes |
| staff-employment-status | true | user_profiles, academic_teacher_directory, school_staff_directory |
| staff-access-code | false | user_profiles, staff directory, staff access codes and audit |
| bursar-account-admin | true | user_profiles, bursar account enrolments and events, staff directory |
| bursar-account-web | false | browser-delivered helper page; no direct database table access found in its source |
| staff-account-activation | false | staff/teacher profiles, activation codes, access codes, bursar enrolments and audit |
| r2-storage-gateway | true | evidence requests, devices, files and user profiles |
| usage-analytics | false | user profiles, parent sessions/contacts, staff directory and usage events |

### Important JWT note

Five functions have `verify_jwt=false` in their current deployment metadata: google-drive-backup, parent-portal-api, staff-access-code, bursar-account-web, staff-account-activation, and usage-analytics. (This is six functions; count corrected here.) This setting does not by itself prove unauthorised access: some functions may implement their own verification, signed tokens, PIN challenges, webhook checks, or other controls. Their request handlers must be individually reviewed. The replacement API must enforce authentication and authorisation explicitly at each sensitive operation.

### Environment dependency names observed

Function source references environment variable names including:

- Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_SECRET_KEYS, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY
- Google backup: BACKUP_ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, APP_BASE_URL
- Staff access: STAFF_ACCESS_CODE_PEPPER
- R2: R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
- Analytics: USAGE_ANALYTICS_HMAC_KEY

Only names are recorded; no secret values were read or copied. The duplicated/variant Supabase secret variable names require configuration cleanup during migration. Never place service-role or storage credentials in frontend code.

## 4. Third-party and hosting dependencies found

- All database-backed Edge Functions use Supabase JS clients and the Supabase URL/service-role credentials.
- Google Drive backup depends on Google OAuth and Google APIs; this is optional external backup integration and is not equivalent to the local backup requirement.
- The R2 gateway depends on Cloudflare R2 credentials. R2 is not automatically school-owned or necessarily free; local file storage should be the baseline for the self-hosted edition.
- Several functions contain hard-coded Vercel origins and allowlists. The replacement must use a centrally configured trusted-origin list rather than copying old preview domains.
- The parent portal function explicitly references the learner photo and parent voice-note storage buckets.
- The bursar web helper and staff activation helper reference hosted frontend origins and Supabase endpoints; these must be replaced with local host configuration.

## 5. Migration implications

1. Build one local API service that replaces the Edge Function responsibilities, but preserve separate route-level authorisation and audit events.
2. Reimplement server-only table access behind narrowly scoped service methods. Do not grant browser users direct access to the 26 tables above.
3. Port finance, learner identity, academic publication, attendance/payroll, parent portal, evidence and inventory invariants before allowing writes in the new environment.
4. Replace Supabase Storage and the R2 gateway with school-controlled private file storage, while preserving object references and file checksums.
5. Replace Vercel CORS/origin allowlists with explicit LAN host configuration and a later, separately secured remote-access configuration.
6. Review each currently JWT-disabled Edge Function's internal authentication before reproducing it. The metadata flag alone is not a security assessment.
7. Treat Google Drive, SMS, WhatsApp and other third-party services as optional integrations; local core operations must not depend on them.

## 6. Next tasks

- Retrieve and inspect complete definitions of SECURITY DEFINER routines and triggers, prioritising finance, parent portal, staff access, evidence and payroll.
- Trace frontend Supabase client initialisation and calls across the actual application files.
- Inspect Vercel build, route, headers and function configuration.
- Produce the first local API contract and schema migration plan, then implement only in an isolated test environment.
- Verify each API operation against role-based test cases before any real-data migration.

## Safety status

Read-only inspection only. No live tables, policies, functions, storage objects, users, domains, or deployments were modified. No secrets were copied into this report.
