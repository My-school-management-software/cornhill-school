# CORNHILL 110-Check Security and Data Integrity Batch

**Review date:** 6 November 2026  
**Environment:** connected Supabase database metadata, RLS policies, function grants and existing row integrity. Read-only checks except for the separately documented permission migration. No learner, payment, allocation, charge, mark, attendance, guardian, message, payroll or backup records were inserted, updated, reversed or deleted.

## Results

**110 / 110 checks passed.**

### A. Database row-level security — 30 checks
RLS enabled on the learner, class, teacher assignment, subject, class-subject, assessment, score, report publication, grade-band, enrolment, bursary, guardian, guardian audit, payment, allocation, charge, attendance, schedule, staff communication, direct message, call signal and backup tables.

### B. Anonymous access and RPC grants — 18 checks
No anonymous table grants on protected learner, guardian, payment, academic, attendance, direct-message, backup or communication provider/outbox tables. Parent portal, guardian admin RPCs, payment reversal and current payment posting RPC are not executable by anon. The current payment RPC remains executable by authenticated users and checks school-admin status in its function body.

### C. Learner/admission/bursary/guardian integrity — 16 checks
No duplicate or blank permanent admission codes; active learners have class references; learner types valid; no duplicate active enrolment periods; admission/exit dates valid; bursary awards nonnegative with reasons and valid date ranges; guardian links valid; opt-ins require numbers; no duplicate active primary guardians; guardian contact changes have reasons.

### D. Finance integrity — 12 checks
Receipt numbers unique; payment amounts positive; payment status recognised; reversed receipts have full audit fields; posted receipts have no reversal timestamp; allocations positive and reference valid payments/charges; allocations do not exceed payment total; charge amounts nonnegative and learner/enrolment links resolve.

### E. Academic integrity — 10 checks
Assessment maximums positive; scores nonnegative and not above maximum; no duplicate learner score per assessment; scores reference valid assessments/learners; report publications reference valid learners, terms and approvers; at most one current open term.

### F. Staff attendance integrity — 7 checks
Attendance timestamps and staff references valid; dedupe keys unique; adjustment reasons present; reviewed adjustments include reviewer/time; work schedule end follows start; grace and break minutes nonnegative.

### G. Staff communications integrity and access — 8 checks
Post/comment authors and parent post references resolve; direct-message participants are distinct and valid; call participants are distinct; all six staff collaboration tables have active-staff session guards; helper uses SECURITY INVOKER; anonymous execution is disabled.

### H. Backup integrity — 4 checks
Successful runs have completion timestamps; record totals nonnegative; validation rows reference existing backup runs and users.

### I. Additional client-grant checks — 5 checks
No anonymous grant on communication outbox, call signals or backup OAuth state; no anonymous execution on parent portal lookup or payment reversal.

## Improvement applied during this cycle

The audit found the legacy `post_school_payment_with_allocations` RPC still had client EXECUTE grants to anon and authenticated. Its body checked for an administrator, but it was an older route with weaker allocation/enrolment-period rules. Source review confirmed the current application calls `post_school_payment_complete`, not the legacy function.

Applied migration `20261106202809_revoke_legacy_payment_rpc_client_access`:
- Revoked execution from PUBLIC, anon and authenticated on the deprecated legacy RPC.
- Left the current `post_school_payment_complete` RPC unchanged.
- Verified anon execution false, authenticated execution false and postgres execution true.
- Confirmed the migration is recorded in Supabase.
- Supabase health advisor returned zero lints.

## Important test limits

Some integrity checks cover currently empty transaction tables, so they confirm schema/policy conditions and absence of inconsistent rows, not full transaction behaviour. Current row counts at the time of review: students 2, payments 2, allocations 0, learner charges 1, assessment scores 0, attendance events 0, guardian contacts 2, communication outbox 0. No private learner names, contact numbers or payment details were selected for this report.

Not covered by these checks: authenticated browser workflows, real teacher/admin account impersonation tests, actual payment posting/reversal, thermal receipt printing, parent OTP delivery, backup validation invocation/restore, offline browser synchronisation, Windows/Android device tests or production deployment.
