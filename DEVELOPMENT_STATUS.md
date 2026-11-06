# CORNHILL Development Status

Last updated: 2026-11-06

## Development branch and deployment hold
- Active working branch: `feature/cornhill-v3-foundation`.
- Keep unfinished work on this branch. Do not replace it with an older deployed copy.
- Do not deploy until the Vercel usage limit is available again and the accumulated changes have passed the agreed checks.
- A GitHub commit or applied Supabase migration does not mean the system is deployed or device-tested.

## Recent batch work
- Updated `index.html` to show reminders for upcoming term opening dates as well as approaching/overdue closing dates.
- Corrected the term-date update message: the reminder does not close a term; an administrator must explicitly close it.
- Added client-side validation for academic-year date order and overlapping years.
- Added client-side validation that terms fall within their selected academic year and do not overlap other open terms in that year.
- Commit: `1c67fb6983c00a3512a93fd54d6e04fb4bf82f12`.

## Academic Calendar status
- Calendar UI exists in the Academics area and dashboard.
- Supports academic years, Term 1/2/3, opening/closing dates, active-term selection, date adjustment and administrator-controlled closure.
- Database migrations recorded: `20261106083157 academic_year_term_control`, `20261106083229 automatic_expired_term_closure`, `20261106083359 one_current_academic_year`.
- Database policies allow signed-in users to read calendar records and restrict calendar management to school administrators.
- The database currently has zero academic-year records and zero term records. No school dates have been invented or inserted.
- No active cron job for academic term closure was found. The current interface flow is administrator-controlled closure. The expired-term function is callable by an administrator but is not scheduled by a cron job in the inspected database.
- Before school use, an administrator must enter CORNHILL's actual academic-year and term dates.

## Verification completed in this batch
- Fetched the updated branch file after saving.
- Parsed all three script blocks in `index.html`; no JavaScript syntax errors.
- Checked for duplicate HTML IDs; none found.
- Verified the new opening reminders and manual-closure wording are present.
- Queried the live database: 0 academic years, 0 terms, 2 learner records.
- Read calendar RLS policies and the active-term/term-closure function definitions.
- Ran Supabase security and performance advisors. Findings remain for further review; do not disable RLS or broadly change SECURITY DEFINER permissions to silence warnings.

## Existing system work (foundation saved; end-to-end testing remains)
- Learner admission, permanent learner codes, LIN/index fields, re-admission and learner history.
- Bursary awards, fee schedules, mid-term proration, boarding/day meal rules.
- Finance, receipts, payment allocation, enrolment-period balances and statements.
- Academic classes, subjects, assessments, marks and report-card foundations.
- Dashboard, boarder counts and school budget/collection reporting.
- Parent/guardian portal restrictions and published-results controls.
- Communications Centre templates/outbox and permissions foundation.
- Staff attendance, payroll/advance and backup foundations.

## Still to implement or verify before deployment
1. Continue grouped end-to-end checks for learner admission, re-admission, bursary and meal rules.
2. Test payment posting, previous-term allocation, receipt preview/reprint and period-specific statements.
3. Test teacher permissions, mark entry, grade calculations and report-card publication.
4. Test Academic Calendar creation, activation, opening reminders, date changes, overlap prevention and manual closure with non-production test dates.
5. Continue review of database security-advisor findings and exposed function permissions.
6. Complete communication provider integration only after choosing an affordable pay-as-you-go option and receiving authorized school approval. No live SMS/WhatsApp sending is currently connected.
7. Verify attendance hardware compatibility before promising fingerprint-device integration.
8. Test backup/restore and role-based access.
9. Deploy and test on Windows 10/11 and Android only when deployment capacity is available.

## Cost and data safeguards
- Prefer free or pay-as-you-go services; do not activate paid messaging, hosting or other subscriptions without school authorization.
- Do not use invented academic dates or production learner/payment data for test transactions.
- Preserve historical learner, academic, finance and receipt records during fixes.

## 2026-11-06 — Combined batch 1: admission, bursary, re-admission and finance connection

- Reviewed the admission form, learner identity checks, re-admission RPC, bursary triggers, boarding normalisation, enrolment-period records and finance fee-schedule function together.
- Corrected the bursary admission database trigger so every bursary admission creates an administrator-approved row in `learner_bursary_awards`, including zero-payable bursaries.
- Bursary charges now carry the active enrolment-period, academic-year and term references instead of being created as unassigned historical charges.
- The bursary award records the generated charge reference where a payable amount exists. Zero-payable awards remain recorded without creating a zero-value charge.
- Kept the existing approval rules: full bursary / fully sponsored = UGX 0; half / partial bursary require a positive payable amount and a reason.
- Updated the re-admission screen so that after the permanent learner identity and a fresh enrolment period are restored, it also applies the active term fee schedule. The previous bursary is still not renewed automatically.
- Kept database enforcement of P7 compulsory boarding and the single boarding package; separate day-meal flags remain disabled for boarders.
- Applied Supabase migration `20261106124821_connect_admission_bursary_to_enrolment_finance`.
- Verified the live trigger definition now writes bursary award history and links bursary charges to an enrolment period. A temporary integration-test learner was not left in the database after the rollback test.
- Updated `index.html`; all 3 JavaScript script blocks passed syntax parsing and no duplicate HTML IDs were found.
- These checks do not replace full browser/runtime testing of real admissions, re-admissions, bursary charges, boarding fee schedules and finance statements.
- No deployment was performed. Continue on `feature/cornhill-v3-foundation`.



## 2026-11-06 — Combined batch 2: payment allocation and receipt balance correction

- Reviewed the payment form, allocation RPC, payment-allocation records, receipt generation/reprint, reversal RPC, learner statements and enrolment-period balance views together.
- Corrected the allocation rule: previous-term charges within the learner's active enrolment are displayed as optional selections. The administrator must tick a previous-term charge to pay it; unticked previous-term charges are skipped.
- Automatic allocation now applies remaining payment only to charges linked to the current open academic term. If no current open term is configured, the automatic portion remains unallocated rather than silently paying an older charge.
- The database still validates every manual allocation against the selected learner, the learner's active enrolment period, the unpaid charge balance, positive whole-shilling amounts and duplicate charge IDs. Closed former enrolment periods remain separate and are not silently carried forward.
- Updated the payment screen wording to explain the optional previous-term choice and the current-term-only automatic rule.
- Corrected the new-payment receipt balance lookup to read the balance for the payment's own enrolment period rather than the broader learner-account view.
- Applied Supabase migration `20261106125535_current_term_first_payment_allocation`.
- GitHub commits: payment UI `fa1d663aef796cf09ccd0247f655e6225d6527f7`; migration `14203d025597c5bec7ff1413908b3835f82c8be6`.
- Static verification: all 3 inline JavaScript blocks parsed successfully; no duplicate HTML IDs; the obsolete “oldest outstanding charges first” instruction is gone; the live database function contains the current-open-term filter.
- Data safety check after the migration: 2 learner rows, 2 payment rows, 0 allocation rows, 1 charge row and 0 configured current open terms. No payment, allocation, charge or learner test rows were inserted or changed by this batch.
- Because the database currently has no actual academic-term records, automatic current-term allocation cannot yet be exercised. Do not invent school dates; configure CORNHILL's real term dates before live payment testing.
- Supabase security advisors were run. Existing findings remain for service-only/RLS tables, SECURITY DEFINER functions, the `pg_net` extension schema and leaked-password protection. The payment RPC still checks `auth.uid()` and `is_school_admin()`; no broad permission changes were made to silence advisor warnings.
- These are code/database/static checks, not a browser payment test, real receipt print test, Android/Windows test or deployment. Those remain pending.


### Batch 2 follow-up — reversal history in learner statements
- Updated learner statement retrieval to include both Posted and Reversed receipts, rather than hiding reversed receipts from the financial audit history.
- Reversed receipt rows are explicitly labelled Reversed and display the reversal timestamp and reason. Their allocations remain excluded from paid totals because statement charge calculations continue to count only allocations whose payment status is Posted.
- The active/closed enrolment balance view also excludes reversed payments, so reversing a receipt restores the corresponding outstanding amount without deleting the original receipt or allocation records.
- Static verification after the update: all 3 inline JavaScript blocks parsed; no duplicate HTML IDs; the statement query includes reversal fields and the renderer displays the reversal reason.
- The reversal RPC was inspected: it requires an authenticated school administrator, locks the payment row, accepts only a currently Posted receipt, records who/when/why, and does not delete payment or allocation records.
- Browser execution, real reversal transaction testing and thermal-printer output remain pending.

## Expanded completion programme requested on 2026-11-06
The remaining programme now explicitly includes:
1. Offline data entry and reliable synchronisation when connectivity returns, with duplicate protection and conflict handling.
2. Actual SMS and WhatsApp provider integration, credentials stored server-side, send worker, delivery callbacks, consent and cost controls. Current communication outbox/templates do not send messages.
3. Fingerprint attendance compatibility confirmation and integration after the exact device model, SDK/driver and supported connection method are supplied.
4. Role-based access completion and tests for administrator, bursar, headteacher, DOS, teachers and other staff.
5. Finance completion: all charge types, allocation and reversal consistency, reports, receipt previews and thermal printing.
6. Parent/guardian verification and isolation tests.
7. Backup scheduling, retention and a successful restore drill.
8. Final navigation, themes, fonts, responsive mobile and missing-module review.
9. Production setup using verified school identity, real academic dates, approved fee schedules and staff accounts.
10. Verified deployment followed by Windows 10, Windows 11 and Android testing.

## Current offline and deployment limitation
- The current service worker caches the application shell only. It deliberately does not cache Supabase/authentication traffic.
- The current offline banner explicitly warns that live learner records, finance and payments require an internet connection. It does not queue offline finance or learner writes.
- Therefore offline data entry and synchronisation are NOT implemented yet. Do not represent the current shell cache as offline-capable school operations.
- The service worker file exists at `service-worker.js`; `manifest.webmanifest` is referenced by the page. No `package.json` or `supabase/config.toml` was found at the repository root during this inspection.
- Continue with an explicit IndexedDB pending-write queue, idempotent server-side sync RPCs, per-record validation, permission checks and conflict review before enabling offline writes. Do not queue financial payments offline until an audited, duplicate-safe reconciliation design has passed tests.
- Deployment and physical-device testing remain pending. Vercel usage limit was previously exhausted; no deployment was attempted in this continuation.
