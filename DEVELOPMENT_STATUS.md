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

## 2026-11-06 — Combined batch 3: limited offline attendance-correction queue

- Added durable browser IndexedDB storage for staff attendance correction requests only.
- When a staff member submits a correction request without internet, the app stores the request on that device and clearly states that it has NOT yet reached the administrator.
- When connectivity returns, or the staff member reopens the Attendance workspace while online, the app attempts to send only that signed-in user's queued requests.
- Each queued request is assigned a UUID before storage. A retry after a lost network response checks for that same request ID before deciding it failed, reducing duplicate submissions.
- Requests remain on the device when sync fails; requests belonging to a different signed-in account are not sent by the current account.
- The offline banner now distinguishes this limited attendance-correction queue from live learner, marks, finance, payment and receipt operations.
- Explicitly excluded learner edits, marks, financial payments, receipts and other sensitive school transactions from offline queuing.
- Updated the service-worker cache version to `cornhill-shell-v5` so clients fetch the revised app shell.
- GitHub commits: `e3cc56e44abd9763b9a2a7940e4f20683f29d62e` (offline queue), `38ebf7ff30766c5194a5f526c031bf24ae2e0d78` (service-worker cache), and `c3b2d2bc044a6315d189b677a596eb11f1189cfb` (sync when Attendance is reopened).
- Static verification after the final update: all 3 inline JavaScript blocks parse without syntax errors. The simple duplicate-ID scan also flags IDs inside dynamic HTML template strings, so those flagged strings are not evidence of duplicate rendered page IDs.
- Not yet verified in a real browser: offline IndexedDB persistence across reload, switching accounts, reconnect/retry, duplicate-response recovery, or administrator receipt of the request. This batch is code saved, not a completed end-to-end offline test.
- No financial or learner records were queued, inserted, changed or deleted by this batch.

## 2026-11-06 — Combined batch 4: access-control review (audit only; no permission widening)

- Queried the live public-schema tables: every public base table inspected has Row Level Security enabled.
- Reviewed key policies for learners, marks, payments, charges, payroll, staff communications, class assignments and attendance.
- Confirmed the current live profile data contains one Admin account only; no Bursar, Headteacher, DOS, Teacher or general Staff accounts are present yet.
- The current staff invitation Edge Function explicitly accepts only Teacher and Staff; it rejects all other role values. The browser form reflects that same limitation.
- Current finance and payroll table policies are largely administrator-only. Teacher access to assessment scores is limited by assigned-class checks. Staff attendance correction requests allow a staff member to create/read their own request, with administrator review.
- Did not add new job roles to invitations or loosen database policies during this audit. Adding a role label without a complete matching permission map across tables and RPCs could expose learner or financial records or create a role that cannot perform its intended work.
- Next RBAC coding batch must define and implement the full permission matrix together: Admin, Bursar/Deputy Bursar, Headteacher/Deputy Headteacher, DOS, assigned teachers, and other staff; include matching Edge Function invitation validation, frontend navigation/actions, database RLS and RPC checks, then test with separate role accounts.
- No user roles, school data, finance rows or permissions were changed in this audit.

## 2026-11-06 — Combined batch 5: offline-first class-list snapshot foundation

- Added an account-scoped IndexedDB snapshot for permitted class-list data. Administrator snapshots contain learner roster fields only; teacher snapshots contain only the teacher's assigned class, and the restore path verifies the cached class still matches the selected teacher class.
- The local snapshot is deliberately allowlisted: learner names, permanent code, LIN, P7 index, gender, class, day/boarding type, status and admission-completeness indicator. Guardian contacts, date of birth, bursary details, payment/finance records, authentication tokens and secrets are excluded.
- Snapshots expire after 24 hours. On sign-out, the current account's class-list snapshot is deleted.
- When the signed-in account's profile or permitted class data cannot be fetched, the app can restore a valid snapshot for that same account. The offline screen is read-only; navigation and controls for data-changing operations are disabled. Only Dashboard, Learners and Classes views, class-list search, print and CSV export remain available.
- Class-list totals are calculated locally from the snapshot, including enrolled, active, male, female, boarder and day-learner counts. No network request is needed for these calculations once the snapshot is loaded.
- The offline notice identifies the snapshot time and warns that it is not live. Learner/finance changes, marks, receipts, parent portal, messaging and other live records remain unavailable offline.
- Added fallback to the same-account snapshot when teacher class-access or class-subject requests fail because of a network problem. Teacher snapshot restore is restricted to the class previously verified online and stored for that account.
- Updated service-worker cache version to cornhill-shell-v6 so clients refresh the application shell after this code change.
- GitHub commits: 70d9b376cf40731b7b1343587a52e944c0be818b (offline class-list snapshot), 3480da98ed2abfb6921ee952c49464497940ce76 (local counts and network fallback), and the service-worker cache update recorded in this batch.
- Static verification: all 3 inline JavaScript blocks parse without syntax errors. Duplicate-ID scan reports only ID-like strings inside dynamic template code, not verified rendered duplicates.
- Not yet tested in an actual browser or on Android/Windows: IndexedDB persistence, expiry, logout clearing, reconnect refresh, shared-device behaviour, and CSV/print while offline.
- Privacy limitation: browser IndexedDB is not application-level encrypted by this implementation. Use only trusted, device-locked school devices; never leave an administrator session open on a shared/public device. A later native app may use platform-protected encrypted storage.
- No learner, finance, assessment or staff production records were changed by this code batch.
- Follow-up syntax correction: class-roster summary line newline fixed in commit e7ef9f542225dfd749995cdc776467fdf4ce12b1; all 3 inline JavaScript blocks were re-parsed successfully after the correction.

## 2026-11-06 — Fingerprint module deliberately deactivated pending hardware purchase

- Restored the previously selected preferred machine from the user's earlier decision: **ZKTeco UA300 Pro**.
- Updated the Staff Attendance workspace to show a clear INACTIVE status and explain that device registration, fingerprint matching, hardware connection and terminal-import controls are locked until the school purchases and tests the machine.
- Hid the fingerprint device mapping and terminal CSV-import controls from the normal attendance interface. Added code-level guards to both submission handlers so a hidden control cannot be used to register mappings or import terminal events while the fingerprint feature remains disabled.
- Kept staff work schedules, attendance history, attendance correction requests and related attendance administration visible; deactivating the fingerprint hardware does not remove the general staff attendance foundation.
- No biometric templates, fingerprint records, device mappings, attendance events or school records were created or changed. No hardware connection has been made.
- Static verification after saving: all three inline JavaScript blocks parse successfully; the fingerprint registration and CSV-import controls are hidden; both handlers contain inactive-state guards; the inactive status banner and UA300 Pro designation are present; no duplicate HTML IDs were found.
- Browser/runtime and physical device tests remain pending. No deployment was performed.

## Offline assessment synchronisation — schema and permission review

- Inspected the live `assessment_scores` schema before implementing offline marks. A unique constraint exists on `(assessment_id, student_id)`, so duplicate score rows are prevented.
- Teacher INSERT policy requires `entered_by = auth.uid()` and an assigned-class check. Teacher UPDATE policy also checks the assigned class. These protections must remain in force during offline synchronisation.
- The existing online mark-sheet save uses an upsert. Offline sync must not blindly reuse that behaviour: the next implementation should compare the saved server score/comment with the values observed when the offline draft was created, stop on conflicts, and only submit when the teacher is still authorised for that class.
- No offline marks queue has been enabled yet; no scores or school records were changed during this review.


## 2026-11-06 — Fingerprint attendance controls kept visible; activation gated by verified device

- Corrected the earlier presentation change in response to the user's instruction: fingerprint setup and attendance import controls are no longer hidden. The administrator can see the preferred-device setup, staff-ID mapping form, connection checklist and CSV import section in the Staff Attendance workspace.
- Kept **ZKTeco UA300 Pro** as the previously selected preferred attendance terminal.
- Replaced the blanket “INACTIVE / controls locked” notice with a device-activation panel and visible OFF switch. The switch is disabled until a future Windows bridge can verify the correct terminal and a working connection; it must not be enabled merely because a cable is plugged in.
- Existing submission handlers still fail closed while `window.CORNHILL_FINGERPRINT_ENABLED` is not explicitly true. This prevents device mappings/imports from being treated as live fingerprint attendance before a real connection is implemented.
- Important limitation: automatic device detection and automatic activation are not implemented yet. The Windows companion/bridge service, terminal protocol/ADMS or SDK verification, and physical UA300 Pro test remain future work. The visible CSV import is a prepared workflow, not proof of live biometric matching.
- GitHub UI commit: c70cdcf0c514078a8c9c834b4fe774792663259e.
- Not deployed; no physical fingerprint device connected; no biometric templates or attendance records changed.


## 2026-11-06 — Offline assessment mark drafts and conflict-checked synchronisation

- Added an IndexedDB `assessmentDrafts` store under the existing school offline database, upgrading the database from version 1 to version 2 while preserving the existing `classSnapshots` store. Both database open paths now use version 2 and create any missing stores.
- The Excel/class assessment grid can now save entered marks as local offline drafts when the browser reports no network connection. Drafts are scoped to the signed-in account and record assessment/student IDs, score/comment, the original server value observed when the sheet was loaded, class/term IDs and queue time. No report card publication or official server record is created offline.
- Offline draft capture uses the locally cached Supabase session identity when offline; online saves continue to verify the user with Supabase Auth.
- Added a manual “Synchronise pending offline marks” action and an online-reconnection sync attempt. Synchronisation uses conditional database updates matching the original score and comment; new rows use INSERT and rely on the unique (assessment_id, student_id) constraint. If another user changed the mark, the teacher is no longer authorised, or a duplicate/conflict occurs, the draft remains on the device and is not allowed to overwrite the server value.
- Drafts remain stored until successfully synchronised; they are not automatically discarded after 24 hours. The class-list snapshot still has its separate 24-hour expiry.
- Upgraded service-worker shell cache to `cornhill-shell-v7` so the updated application shell can be refreshed.
- Static verification: all three inline JavaScript blocks parse without syntax errors; database version-2 store creation, manual sync button, conditional update and insert paths are present.
- Not yet verified in a real browser: IndexedDB version upgrade with existing version-1 data, offline draft persistence across reload/sign-out/sign-in, network reconnection, RLS behavior during actual teacher/admin sync, conflict handling under concurrent edits, and Android/Windows behavior. These are required before relying on this feature in school operations.
- Privacy limitation: mark drafts and teacher comments are stored in browser IndexedDB and are not application-level encrypted. Use only trusted, device-locked school computers; sign out on shared devices and protect access to the browser profile.
- This offline queue currently applies to the Excel/class assessment grid only. Individual mark entry and the separate bulk mark-sheet save have not yet been converted to offline drafts. No marks, report cards or other school records were changed by this code batch.
- GitHub commits: d3f1d1e010a32ab45fdefcd445100fda6f6aa80e (draft queue), a3acd0996a53c984001c581622154f88d0313fa0 (sync controls and conditional sync), 7a6280538e13926de8a3ae337c17d5367330e146 (database upgrade compatibility), f047a3b0467dabae077c77e7a4240a06d302ca6b (service-worker cache v7), f8ae4292d8e3650b5f057c4956a903353ec23e3b (persistent drafts and offline session identity).


## 2026-11-06 — OneDrive-style local autosave foundations (attendance, admissions and class assessment grid)

- Upgraded the shared school IndexedDB cache from version 2 to version 3, preserving the class-list snapshot and assessment draft stores and adding a separate `formDrafts` store.
- Added account-scoped autosave for the staff attendance correction form and administrator learner-admission form. Drafts save after a short pause while typing, survive reloads on the same device/account, and are restored when the relevant workspace opens. Successful submission clears the local draft.
- Attendance correction drafts remain drafts until staff explicitly submit them. Offline submissions enter the existing pending correction queue and do not become administrator-approved attendance events.
- Learner admission drafts remain local and do not create learner records, bursary awards, charges or enrolment periods until the administrator explicitly submits online. Photo files are not included in autosave.
- Added automatic autosave for the Excel/class assessment grid. Valid edited marks are stored as account-scoped local drafts; while online, conditional conflict-checked sync attempts to save them to the server. Offline marks remain pending. Successful sync updates the in-memory baseline.
- Kept manual mark-save and sync controls as fallbacks. Individual mark entry, separate bulk mark sheet, assessment setup and report-card publication are not yet converted to autosave.
- Privacy limitation: drafts are stored in browser IndexedDB and are not application-level encrypted. Use trusted, device-locked school computers, sign out on shared devices, and do not leave administrator sessions open. Learner admission drafts may contain guardian and learner details.
- Offline clock-in/out is not enabled: the database currently permits staff to read their own events but only administrators can insert attendance events. No client-side change bypasses that policy. Fingerprint attendance remains inactive until the device and Windows bridge are verified.
- Static verification after the final autosave extension: all three inline JavaScript blocks parse without syntax errors; IndexedDB version-3 open paths and form-draft store creation are present; attendance, admission, academic form and Excel-grid autosave bindings are present; the service-worker shell cache is version 8. This is static verification only. Real browser persistence, reload/restore, network interruption, online sync, RLS/conflict, Android and Windows runtime tests remain pending. No learner records, attendance events, marks, payments or report cards were changed by this code batch.


- Follow-up extension: account-scoped local autosave and restore were also wired to academic assessment setup, individual mark entry, academic-year and term forms, grading-band forms, and administrator attendance work-schedule/assignment forms. These remain local drafts until the user explicitly submits them online. Financial payment posting, payroll posting, reversals and receipt generation remain excluded from silent autosave/sync because they require duplicate prevention and explicit server confirmation.


## 2026-11-06 — Autosave extension: learner edits and remaining academic setup

- Added a separate per-learner local draft key for administrator edits. Opening Edit Learner loads that learner's unfinished edit draft if present; changes autosave locally; successful update clears that learner's edit draft. Cancelling an edit explicitly discards that local draft. New-admission drafts remain separate and cannot be restored into an edit session.
- Added local autosave/restore for subject creation and class-subject assignment forms. Academic year, term, subject, class-subject and assessment drafts are cleared after successful server submission. Individual mark drafts and general/UNEB grading-band drafts are cleared after successful save.
- These drafts are not automatically submitted to the database. Administrators and teachers must still explicitly submit each form. Finance posting, salary/payroll posting, payment reversals, receipt generation and staff profile edits remain excluded from local draft capture in this extension.
- Staff clock-in/out remains online/admin-authorised only under the existing RLS policy. Offline correction requests are not a substitute for official clock events.


- Follow-up static verification for learner-edit/academic-form autosave: all three inline JavaScript blocks parse without syntax errors after correcting the asynchronous edit-form restore handler. Confirmed separate learner-edit draft keys, restore on Edit Learner, clear on successful update, discard on explicit cancel, subject/class-subject autosave, and successful-submit cleanup paths. Browser runtime and device tests are still pending.

## 2026-11-06 — Bulk mark-sheet autosave and conflict-checked synchronisation

- Added OneDrive/Excel-style local autosave to the separate Bulk Class Mark Sheet. Score/comment edits are captured after a short pause into the existing account-scoped IndexedDB assessment-draft store.
- When the mark sheet is loaded online, it records the server values as the comparison baseline. On reopening the same assessment, locally pending drafts for that same signed-in account and assessment are restored over the displayed values.
- Online autosave attempts to synchronise pending drafts through the existing compare-before-write sync path. If the server mark changed since the baseline, the account no longer has permission, or a duplicate insert is detected, the draft stays pending rather than overwriting a newer value.
- Added a dedicated “Synchronise pending drafts” action beside the bulk sheet. The existing explicit “Save all entered marks” action remains available; after it succeeds, local drafts for that assessment and current account are cleared.
- The screen clearly distinguishes locally saved drafts from official school marks. Offline drafts are not official until accepted by the server. Report-card publication is not triggered by autosave.
- Reused the existing assessmentDrafts store and conflict-checked sync mechanism; no new database schema or Supabase migration was needed. The shared store means a matching assessment/student draft is shared consistently with the Excel-style grid.
- Updated the service-worker shell cache from cornhill-shell-v8 to cornhill-shell-v9.
- Static verification: all 3 inline JavaScript blocks parse without syntax errors. Confirmed the bulk autosave input handler, same-assessment draft restore, pending-sync action, explicit-save cleanup, and “not official until synchronised” warning are present.
- Not yet tested in a real browser: local IndexedDB persistence/reload, offline editing, reconnect sync, concurrent mark changes, teacher RLS enforcement, or Android/Windows behavior. No marks, report cards, learner records or other school data were changed during this code update.
- GitHub commits: e77d47f26ed2ea8af820c7b6219f03cf013b4e94 (bulk mark-sheet autosave and sync), service-worker cache v9 commit recorded separately in this batch.

## 2026-11-06 — Learner promotion, class setup and staff schedule form autosave

- Added account-scoped local autosave to the administrator's Create Class / Stream form. Unfinished class details can be restored on the same signed-in account; after successful class creation, the local draft is cleared.
- Added per-learner autosave to the dynamically generated Promote / Transfer Learner form. The draft key includes the learner ID, so drafts for different learners do not overwrite each other. The form restores only that learner's draft and clears it only after the promotion RPC succeeds.
- Completed recovery behavior for the existing staff work-schedule and staff schedule-assignment autosave forms. Both forms now restore their own account-scoped drafts and clear them after successful server saves.
- Kept staff profile editing out of local autosave because it contains personal staff information. Passwords and financial posting/reversal forms remain excluded.
- No database schema or Supabase migration was required. All final record changes still require the existing online server submit; local drafts are not official school records.
- Updated service-worker shell cache from cornhill-shell-v9 to cornhill-shell-v10.
- Static verification: all 3 inline JavaScript blocks parse without syntax errors. Confirmed class form save/restore/clear, learner-specific promotion draft save/restore/clear, and schedule form restore/clear paths. Duplicate-ID scan only reported IDs embedded in dynamic HTML template strings (for example learner-specific rows/forms), not repeated static page IDs.
- Not yet tested in a real browser: IndexedDB reload/restore, multiple learner promotion drafts, class creation after reconnect, schedule form recovery, server RPC/RLS behavior, or Android/Windows. No learner promotion, class, schedule, staff, finance, or attendance records were created or modified by this code update.
- GitHub commits: 6625c1fe80dca7f000705492a85e4302eba83cef (class/promotion autosave), f769df25ff83f0c87b0784d6ef2592c6c74ec1fe (schedule draft restore/cleanup), service-worker cache v10 commit recorded separately in this batch.


## 2026-11-06 — Re-admission reason autosave

- Replaced the one-time re-admission reason prompt with a required reason field on each possible former-learner match.
- Each reason autosaves locally by signed-in administrator and learner ID, restores when the match list is rebuilt, and clears only after the re-admission RPC and subsequent fee-schedule handling complete successfully.
- Minimum five-character reason remains enforced. The administrator still explicitly confirms re-admission; no automatic submission or access changes occur.
- Service-worker cache updated to cornhill-shell-v12.
- Static checks: all three inline JavaScript blocks parse; reason capture, restore, minimum length and successful-flow cleanup confirmed. Browser/IndexedDB runtime tests and real re-admission workflow tests remain pending. No learner records were changed.
- Commits: da03c6d4596a5c51af74a15c081b4fda8d7b6dd5 (UI), ec2c1532ddcedb2c689dbf8c94ba8f83211263db (service worker).

- Follow-up safety refinement: the reason draft is cleared immediately after the re-admission identity RPC succeeds, before fee-schedule lookup and page refresh. This avoids leaving a stale confirmation reason after the new enrolment has already been created. Commit: 1592f28304de9b47919efabb7cf457dcd1b93b45.


## 2026-11-06 — Class placement confirmation safeguards

- Improved the existing administrator-only Promote / Transfer Learner form. Before any database call, it now verifies that the destination class still exists, differs from the learner's current class, and the effective date is valid.
- Shows an explicit confirmation summary with learner, previous class, destination class and effective date. The confirmation explains that class movement is recorded in history and existing marks and financial records are not changed.
- Existing per-learner local draft recovery remains in place; no automatic submission was added. The existing `promote_learner` RPC remains responsible for the official history update.
- Updated service-worker cache to cornhill-shell-v13.
- Static checks: all 3 inline JavaScript blocks parse; validation and confirmation strings present. Real browser, RPC/RLS and Android/Windows tests remain pending. No learner placements or academic records were changed during this code update.
- Commits: 5ce17378291b3f409ce64dc7c4e5c601b3ea0fca (UI), 230799072ee926d15b0a682f0dbb3eee377dd4a7 (service worker).


## 2026-11-06 — Academic year and term creation safeguards

- Implemented explicit administrator-only submit handlers for the Academic Year and Term forms. These forms previously had local draft autosave/restore but no matching submit handlers in the inspected page code.
- Academic year creation now checks required values, date order, duplicate year names and inclusive date overlap with existing academic years. New years are created with `is_current=false`; creating a year does not activate it or change existing school history.
- Term creation now checks that the selected year still exists, dates fall entirely inside that year, and the term name and date range do not duplicate/overlap another term in that year. New terms are created as planned (`is_current=false`, `is_closed=false`) and require an explicit later activation from the dashboard.
- On successful creation, the relevant local form draft is cleared and the calendar/academic views reload. Offline submission is blocked clearly while local autosaved drafts remain on the device.
- Schema inspected from Supabase: year/term required columns, date checks, unique academic-year name, unique term name per year, and foreign key. No schema migration was needed.
- Static checks: all 3 inline JavaScript blocks parse without syntax errors; year/term handlers, overlap checks, year boundary checks and non-active insert values confirmed.
- Not tested: real browser submission, Supabase RLS on insert, duplicate race conditions, calendar reload in browser, Android/Windows. No academic years or terms were inserted or changed; database currently has no real configured school calendar rows.
- Commits: 53b57fa83af673f9995029b1ba44054b445af76e (UI), 6e9b540abf010ce2d4a9c0b2b602076955fa96e4 (service worker).


## 2026-11-06 — Academic-year progression review preparation
- Added an administrator-only, read-only progression review in Academics. It loads active learners and class records, orders the standard Baby → Middle → Top → P1 → … → P7 sequence, and displays a suggested next class. P7 is marked for completion review rather than automatic graduation.
- The decision selector is deliberately disabled and labelled Review only. No class, status, enrolment, assessment or finance records are changed. Actual decisions continue through individually audited learner workflows.
- The report excludes inactive learners and active learners without a recognised class; administrators must resolve those cases separately.
- Updated service-worker shell cache to cornhill-shell-v15.
- Schema review confirmed the learner, class, class-history and status-history tables. The academic-year and term tables currently have no configured school-year rows. Browser printing, RLS execution and real-device tests remain pending.
- No production learner records changed.


## 2026-11-06 — Report-card approval safeguards
- Strengthened the individual official-report approval action: administrator role is checked at click time, approval is blocked when the report contains no recorded assessment maximum/marks, and confirmation now identifies learner, class, term and recorded totals before writing the publication record.
- Existing publication remains per learner and term; batch preview does not itself approve or publish reports. Existing approved timestamp/approver display remains.
- Supabase schema inspection confirmed report_card_publications stores term, class, learner, approving user and timestamp. No publication rows were inserted or changed during this work.
- Updated service-worker shell cache to cornhill-shell-v16. Static syntax checks follow; live browser/RLS approval tests and Android/Windows tests remain pending.


## 2026-11-06 — Report publication integrity batch
- Approval button is hidden unless the report preview contains recorded assessment maximums; server submission path repeats the non-empty marks check from the prior batch.
- Replaced publication upsert with check-then-insert. Existing approval rows are preserved rather than overwritten by a second approval attempt; lookup errors stop the operation.
- Existing publication display remains read-only and includes approver/timestamp. No bulk publication was added.
- Updated service-worker cache to cornhill-shell-v17. Static JavaScript checks passed for all inline scripts. No production report publication rows or marks were changed. Browser/RLS concurrency testing remains pending.


## 2026-11-06 — Encrypted backup coverage and verification batch
- Expanded the application backup dataset list to include enrolment periods, bursary awards, guardian contacts/change history, conduct reports, daily collection records, user profiles, attendance configuration/import history, communication delivery/outbox/templates and staff collaboration records. Provider credentials, OAuth state/tokens, auth passwords and the class-login directory are intentionally excluded.
- Local export now requires an administrator-chosen password of at least 12 characters. Browser Web Crypto derives an AES-256-GCM key using PBKDF2-SHA256 (310,000 iterations), random salt and IV; the passphrase is not stored. The export is an encrypted `.enc.json` package.
- Before download, the browser decrypts the generated package in memory and verifies the record snapshot format and dataset count. Password field is cleared after successful generation. A failed dataset read aborts the export instead of creating a partial backup.
- Updated shell cache to v18. Static JavaScript parsing passed. No records were edited. Full import/restore workflow, actual encrypted file round-trip on Android/Windows, cloud backup verification and disaster-recovery drill remain pending. Keep the password separately; losing it means the file cannot be decrypted.


## 2026-11-06 — Cloud backup coverage and integrity verification
- Confirmed Supabase project has an active Google Drive connection, automatic daily backup enabled, and cron schedule `0 2 * * *` (05:00 Uganda time). Database audit shows 6 successful and 2 failed backup runs; latest success at 09:06:05 UTC on 2026-11-06. Two historical failures remain visible in audit history; they were not deleted.
- Expanded server-side encrypted Google Drive backup to include learner enrolment periods, bursary awards, guardian contacts/change history, conduct reports, communication delivery/outbox/templates, SMS outbox and staff collaboration records. Credential/configuration tables, OAuth state, auth passwords and class-login directory remain excluded.
- Added decrypt-and-validate integrity check before upload; mismatched format, dataset count or record count cancels upload.
- Backup status now reflects the actual enabled/frequency setting rather than always claiming daily scheduling.
- Supabase health advisor returned no lints at inspection. No school data rows were modified. Full restore/import and an actual restore drill remain pending; existing cloud backup history has not been altered.

- Follow-up RLS review: the local browser export intentionally excludes service-only `communication_delivery_events` and participant-private staff direct/media/call records, because an administrator's browser session cannot reliably read all rows under those RLS policies. These records remain in the server-side encrypted Google Drive backup, which uses the service role after administrator authentication. This prevents a misleading partial local export.
- Local encrypted backup is a protected records export only; it does not restore data into production. Do not upload or share it casually. The password is required to decrypt it.

- Final local-export cleanup: password field is cleared after both successful and failed backup attempts, so it is not left populated on the shared administrator screen.


## 2026-11-06 — Privileged role and employment-status security batch
- Updated `is_school_admin()` so a profile must have role `Admin` AND employment status `Active` to pass administrator checks. This gates existing admin-only RPCs and payment/bursary operations that call the helper when a staff account is suspended, inactive, terminated or exited.
- Updated `is_class_teacher_for_class()` so a teacher must have role `Teacher`, an active employment status, and an explicit class assignment.
- Applied migration `active_employment_required_for_privileged_roles` to Supabase and queried both live function definitions to verify the predicates.
- Security review: no public tables were found with RLS disabled; all inspected SECURITY DEFINER functions deny `anon` execution. Some service-only backup/provider/outbox tables intentionally have no authenticated policies. Security advisor still reports existing warnings for SECURITY DEFINER RPC exposure to authenticated users (inspected functions contain role/identity checks), `pg_net` extension placement, and leaked-password protection disabled. These are tracked for a separate compatibility/configuration pass.
- No staff roles, employment statuses, school records or authentication settings were changed. A real suspended-account login/RPC denial test remains pending.


## 2026-11-06 — Configurable encrypted cloud-backup frequency
- Added administrator controls to enable/disable automatic Google Drive backups and choose daily, weekly (7 days), monthly, termly (4 months) or yearly frequency. The on-device reminder interval remains a separate reminder only.
- Added a server-side administrator-only save action; only an active Admin profile can change the schedule. Enabling is blocked until the dedicated CORNHILL Google account is connected.
- The existing 05:00 Uganda-time scheduler now checks whether the selected interval is due before starting a backup; it skips runs that are not yet due and records the successful scheduled run time. Manual “Back up now” remains available independently.
- Existing database frequency constraint already supports all five choices; no schema migration was needed. The existing cron job remains a daily 05:00 Uganda-time checker, not a forced daily backup.
- Static JavaScript syntax checks passed for all inline scripts. Live browser interaction, save path, actual weekly/monthly/termly/yearly timing and Android/Windows tests remain pending. No backup was triggered and no school records were changed.
