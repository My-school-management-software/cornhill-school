# CORNHILL 250-Check Security and Data Integrity Cycle

**Date:** 6 November 2026  
**Environment:** Live Supabase database metadata, policies, function grants and read-only data integrity checks. Two targeted permission migrations applied and verified.

## Result

<badge>250 / 250 PASS</badge>

The completed batch comprised:
- 63 checks: RLS enabled on all 63 public tables inspected.
- 62 checks: no anonymous SELECT/INSERT/UPDATE/DELETE privileges on sensitive public tables.
- 50 checks: all 25 identified trigger functions remain attached and have no direct client EXECUTE permission.
- 46 checks: 23 key RPCs exist and are not executable by anonymous users.
- 27 checks: learner, enrolment, bursary, guardian, finance, academic, attendance and backup integrity.
- 2 checks: public teacher sign-in directory has no anonymous write access and no table-wide anonymous SELECT grant.

A further allowlist query verified exactly five intended public display columns are available to anonymous users, with zero unexpected columns.

## Findings and improvements

### 1. Trigger-only functions had unnecessary client execution rights
Seven trigger functions had direct EXECUTE rights for anonymous and authenticated roles. These functions are meant to run through their database triggers, not as direct client RPC endpoints.

Applied migration `20261106205433_revoke_client_execution_from_trigger_functions`:
- `assign_school_invoice_no()`
- `inventory_prevent_negative_stock()`
- `inventory_touch_updated_at()`
- `log_learner_status_change()`
- `refresh_daily_collection_record_after_payment()`
- `stamp_bursary_award_approval()`
- `validate_assessment_score()`

Revoked EXECUTE from PUBLIC, anon and authenticated. Verified all 25 inspected trigger functions remain attached and none of the 25 is client-executable. Trigger attachment is intact.

### 2. Public class sign-in directory exposed more columns than necessary
The sign-in page needs class key, class label, teacher display name, administrator display name and display order. The anonymous role previously had table-wide SELECT, which also exposed metadata columns such as updated_at.

Applied migration `20261106205651_limit_public_class_login_directory_columns`:
- Removed table-wide anonymous SELECT.
- Granted column-level SELECT only for `class_key`, `class_label`, `teacher_name`, `administrator_name` and `display_order`.
- Kept administrator write permissions and the existing public read policy, but narrowed what anonymous clients can read.

Verified:
- no anonymous table-wide SELECT,
- no anonymous INSERT/UPDATE/DELETE,
- exactly five anonymous SELECT columns,
- zero unexpected anonymous SELECT columns,
- sign-in page source selects only the allowed display fields.

The public directory contains display information, not teacher passwords or private login codes. Teacher codes continue to be managed by the guarded Edge Function.

## Data integrity coverage

The 27 integrity assertions covered:
- Permanent admission codes, learner statuses, class references, day/boarding types, bursary consistency, LIN and P7 index uniqueness.
- Active enrolment uniqueness and date consistency.
- Guardian SMS/WhatsApp consent, Uganda phone format and active-primary uniqueness.
- Payment amount/reversal audit/unallocated amount and allocation ceilings.
- Positive learner charges and assessment maximums; score bounds and learner-class matching.
- Report publication approval metadata.
- Attendance deduplication and backup-validation references.

## Advisor results

- Supabase health advisor: zero lints.
- Security advisor still reports six informational service-only tables with RLS but no client policies, one pg_net-in-public-schema warning, 20 authenticated SECURITY DEFINER RPC warnings, and leaked-password protection disabled.
- These were not blindly changed: service-only tables intentionally have no client access, and privileged RPCs require individual role/body review before altering their execution model. The current cycle verified that the selected RPCs are not anonymously executable.

## Data safety and limitations

- No learner, guardian, payment, charge, allocation, assessment, attendance, payroll or backup data rows were inserted, updated, reversed or deleted.
- No credentials or private contact values were read.
- Integrity checks on empty transaction tables validate that no invalid rows currently exist; they do not prove the full transaction workflow works.
- No browser, teacher login, parent OTP, payment transaction, backup restore, thermal printer, fingerprint hardware, Windows or Android runtime test was performed.
- Full app deployment remains blocked by the previously reported Vercel usage limit.

## Migration files

- `supabase/migrations/20261106205433_revoke_client_execution_from_trigger_functions.sql`
- `supabase/migrations/20261106205651_limit_public_class_login_directory_columns.sql`


## 2026-11-07 follow-on 70-check batch
**Result: 70 / 70 PASS.**

- 17 checks confirmed the exact learner-register columns needed by the teacher screen remain readable.
- 10 checks confirmed private guardian, address, photo and bursary columns are not selectable by the authenticated client role.
- 43 checks confirmed individual foreign-key constraints are validated and point to real referenced relations.

### Security correction
The audit found table-wide authenticated SELECT on `public.students`. Although row-level policies limited teachers to assigned classes, the table grant allowed clients to request private columns within those rows. Applied `restrict_teacher_student_select_columns` to revoke table-wide SELECT and grant only the 17 fields used by the class register. The existing row-level policies remain in force. Admin-only learner details continue through the guarded administrator RPC.

Verification after the migration:
- table-wide authenticated SELECT: false
- allowed register columns: 17
- private columns still selectable: 0
- all 70 follow-on assertions: PASS

### Remaining review items
- 58 performance-advisor unindexed-FK findings, 18 unused-index notices and 22 multiple-permissive-policy notices need careful workload-specific review.
- 20 authenticated SECURITY DEFINER RPC warnings remain under body-level authorization review; no blanket permission changes were made.
- Runtime teacher/admin impersonation, report-card PDF export and live browser workflows are still pending.
