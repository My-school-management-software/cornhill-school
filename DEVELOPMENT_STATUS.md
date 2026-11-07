# CORNHILL Development Status

Last updated: 2026-11-06

## Password-security scope decision — 2026-11-07
- Supabase Pro-only leaked-password protection is intentionally excluded from the CORNHILL plan. Do not enable it, upgrade for it, or list it as a release blocker.
- Keep the agreed free Supabase Auth minimum-length and character-class policy as the server-side baseline. CORNHILL's free app-level breach-list screening is an additional check in the password-change and recovery screens; it is not equivalent to server-side global enforcement, and direct Auth API calls can bypass it.

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


## 2026-11-06 — Staff account-status enforcement and session cleanup
- Added a live profile-status gate at sign-in: accounts with a recorded employment status other than Active are signed out and shown a clear administrator-contact message. Legacy NULL status remains compatible with the database helper's existing NULL-as-active treatment.
- On sign-out or an unauthenticated session, clear in-memory learner/class/teacher workspace state and the selected teacher-class session key. Inactive accounts also have their local class-list snapshot removed before sign-out.
- Existing self-service password change and administrator-requested reset-email controls remain in place; no passwords or email addresses were changed or sent.
- Audited SECURITY DEFINER function privileges: no inspected public SECURITY DEFINER routine is executable by anon; authenticated-executable routines are intentionally available to signed-in users and the exposed admin/teacher/parent routines contain identity/role guard references. Internal trigger/scheduler routines are not executable by authenticated users. Service-only communication and Google backup tables have RLS enabled with no client policies, as intended for server-only access.
- Supabase security advisor still reports its known warnings: pg_net extension schema placement, leaked-password protection disabled, and authenticated-executable SECURITY DEFINER functions. The six no-policy notices concern service-only tables and are intentional. Auth password-protection configuration is not exposed through the connected tools in this session, so it was not changed.
- Static JavaScript syntax checks passed for all inline scripts. No staff account status, password, learner, finance or attendance record was changed. Live inactive-account login denial, reset-email delivery and Windows/Android tests remain pending.


## 2026-11-06 — Active-account RLS for staff attendance and schedules
- Applied migration `active_staff_attendance_and_schedule_rls` to Supabase.
- Staff attendance inserts now require the active administrator helper and the signed-in recorder identity. Attendance reads are limited to active staff reading their own events or active administrators reading all events.
- Staff work-schedule management now uses the active administrator helper. Active staff may read active schedules; inactive profiles cannot use the staff read policy.
- Verified the four resulting policies directly in `pg_policies`; their predicates now reference `is_school_admin()` and active employment status.
- Security advisor still reports the existing warnings for `pg_net` schema placement, leaked-password protection disabled, and authenticated-executable SECURITY DEFINER functions. Six no-policy findings are the intentional service-only communication/backup tables. No broad EXECUTE revocations were made because application RPCs depend on these guarded functions.
- No attendance, work schedule, staff account, learner or finance records were changed. Real authenticated role-denial tests and browser/device tests remain pending.


## 2026-11-06 — Active-staff directory and teacher visiting-day lookup
- Tightened `list_staff_directory()` so both the requesting staff member and returned directory entries must have Active employment status (NULL remains compatible as Active).
- Tightened `teacher_visiting_day_lookup()` to require an Active Teacher and use `is_class_teacher_for_class()` for the target learner class, aligning it with the same active-class-teacher authorization helper used elsewhere.
- Applied migration `active_staff_directory_and_teacher_lookup` and verified both functions in the database. Anonymous EXECUTE remains false; authenticated EXECUTE remains available for guarded application use.
- No staff profiles, class assignments, learner records, marks or conduct records were changed. Runtime tests using active, inactive and cross-class accounts remain pending.


## 2026-11-06 — Migration source tracking and role-security audit follow-up
- Added the source migration file for the already-applied `active_staff_directory_and_teacher_lookup` database change so the repository's migration history matches the live Supabase schema.
- Rechecked the authenticated SECURITY DEFINER inventory. The reviewed administrative finance, admission, re-admission, term-control, budget, parent-contact, and learner-search RPCs contain explicit active-admin guards; teacher lookup now uses the active-class-teacher helper; parent portal access is guarded by verified guardian phone and learner linkage.
- Confirmed `user_profiles` exposes only two authenticated policies by name: users reading their own profile/admin reading all, and administrator staff-profile updates. Policy predicate inspection was blocked by the query safety layer, so those exact predicates remain to be checked with a supported inspection path.
- No role, profile, learner, payment, or academic data changed. No authenticated user simulation or device test was run.


## 2026-11-06 — Security migration source and role audit follow-up
- Confirmed the source migration for `active_staff_directory_and_teacher_lookup` is saved in the repository at `supabase/migrations/20261106153000_active_staff_directory_and_teacher_lookup.sql`, matching the already-applied Supabase change.
- Reviewed the SECURITY DEFINER inventory. The checked finance, bursary, learner admission/re-admission, term control, budget, parent contact and learner-match routines require the active administrator helper. Parent portal access checks verified guardian phone and learner linkage. Teacher visiting-day lookup now checks active teacher status and assigned class through the shared helper.
- `user_profiles` has two authenticated policies by name: self/admin profile read and administrator profile update. Full predicate inspection was blocked by the SQL safety layer, so no policy changes were made without verifying the expressions.
- No learner, staff, payment, mark or academic records changed. Runtime active/inactive/cross-class role tests remain pending.


## 2026-11-06 — Non-destructive cloud backup validation
- Added an administrator-only cloud backup validation action. It downloads the selected completed backup from the connected CORNHILL Google Drive, decrypts it server-side, checks the backup format and expected dataset allowlist, and compares every dataset record count against both the snapshot and backup audit row.
- Added a “Validate latest backup” control in Backup & Recovery. It validates the latest successful backup without inserting, updating, deleting or restoring any school data.
- Validation deliberately does not claim to be a full restore. A safe restore workflow still requires a separate maintenance-window process, target confirmation, dependency ordering, transactional safeguards and an isolated restore drill.
- Updated service-worker cache to cornhill-shell-v21.
- Static JavaScript syntax checks and a live encrypted-file round-trip / Google Drive download validation remain pending. No backup was triggered and no school records were changed.


## 2026-11-06 — Sign-in password recovery
- Added a “Forgot password?” option inside the administrator sign-in panel. It submits the entered administrator email through Supabase Auth `resetPasswordForEmail` and uses the current app origin/path as the recovery redirect.
- Added a dedicated recovery screen for the secure email-link session. The `PASSWORD_RECOVERY` auth event now routes directly to that screen (without opening the school dashboard); the user must enter and confirm a new password (minimum 8 characters). On success the app signs out and returns to sign-in.
- Added clear teacher guidance: because teacher sign-in uses a class-specific school-managed code, a forgotten code must be handled through the school administrator rather than the administrator email-reset form. Existing administrator-initiated staff reset controls remain in Settings.
- Updated the service-worker shell cache to `cornhill-shell-v22`.
- GitHub commits: UI `f210e0044f4ddcd3c5946abaf5953f165bb89b09`, recovery event routing `0740a29bbaa35cf611cf706c061927f1b22b0405`, teacher guidance `d35468dac311e8ceb46a1b18934b42be82c2cc95`, service worker `1a063031923816261ba7c9c9cfcfb82db6930c16`.
- Static parse check: all 3 inline JavaScript blocks passed. No password reset email was sent and no account password was changed. Browser end-to-end recovery is not yet tested. Email delivery requires Supabase Auth email delivery/SMTP configuration and the deployed application URL must be allowed in Auth redirect URL settings. Teacher code reset still requires a secure administrator workflow; the current note directs staff to the administrator but does not itself change a teacher code.
- Application deployment and Android/Windows browser tests remain pending.


## 2026-11-06 — Teacher code-reset employment safeguard and security review
- Reviewed the live Supabase security and health advisors. Health advisor returned zero lints. Security advisor reports six RLS-enabled service-only tables with no client policies, pg_net in public, 20 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled. The six service-only tables are intentionally inaccessible to ordinary clients; do not add broad policies. The 20 functions were sampled and the reviewed administrator/teacher RPCs contain explicit identity/role checks; do not revoke authenticated execution indiscriminately because the app calls these functions. Paid Supabase leaked-password protection is intentionally excluded from project scope; the free CORNHILL app-level breach-screening alternative is documented in the release audit.
- Hardened the class-teacher-code Edge Function: before resetting an existing teacher password, it now checks the existing profile's role and employment_status. It refuses reset for any non-Active employment status rather than silently reactivating that staff member. It also verifies the class curriculum mapping exists before changing the auth account password.
- Saved GitHub commit `d78ef0d3ad86ee1ff15e8e2e628920d24d0eaf1e`.
- Deployed Supabase Edge Function `class-teacher-code` version 12, status ACTIVE, `verify_jwt=true`.
- No teacher code/password was reset and no staff profile or class assignment was changed. Runtime test with active/inactive teacher accounts remains pending.
- The sign-in password recovery work remains saved in the prior commits; no recovery email has been sent and no account password changed. Full application deployment and Android/Windows tests remain pending.

## 2026-11-06 — Persistent cloud-backup validation history
- Added `google_drive_backup_validations` with a foreign key to backup runs, validating administrator, pass/fail result, filename, counts, error message and timestamp. RLS is enabled; authenticated users receive SELECT only through `is_school_admin()`. Anonymous and authenticated write access is revoked; the Edge Function uses its service-role client after its own administrator check.
- Updated the Google Drive backup Edge Function: status now returns recent validation history; each successful validation is recorded; failed validation attempts are recorded when possible. Deployed Edge Function `google-drive-backup` version 24, ACTIVE. Its handler continues to enforce its own administrator authentication.
- Updated Backup & Recovery history to show each backup's latest validation outcome and timestamp in Uganda time. Updated service-worker shell cache to `cornhill-shell-v23`.
- Supabase migration applied and saved as `supabase/migrations/20261106160000_google_drive_backup_validation_audit.sql`.
- GitHub commits: Edge Function `0baae87ed11c4d51804411f3022c97db6846a259`; UI history `3313d846ee70224d23fcc14c4bcc4c687a843dfa`; syntax correction `4b88a94fe063a22e20e3a9d5c6a055dcb1ee642c`; service worker `8e8c748777d923a86068867485eaec845c306ddf`; migration file commit recorded separately.
- Verification: all 3 inline JavaScript blocks parse; live audit table exists with RLS enabled; zero validation rows (no backup validation was triggered); Supabase health advisor returned zero lints. No backup was created/downloaded/restored and no school records were changed.
- Pending: run a real administrator validation against a completed cloud backup, confirm the pass/fail audit appears in the interface, and conduct a separate isolated restore drill. Full application deployment and Android/Windows browser tests remain pending.

## 2026-11-06 — Backup administrator eligibility and recovery-scope clarification
- Hardened `google-drive-backup` so normal backup actions require both Admin role and Active employment status (NULL status retains the existing Active-compatible behavior). Google OAuth callback now re-checks that the administrator who initiated the connection is still an active administrator before accepting and saving the connection. This blocks stale OAuth requests after staff deactivation.
- Deployed Supabase Edge Function `google-drive-backup` version 25, ACTIVE.
- Corrected the cloud snapshot manifest scope: the configured encrypted database snapshot includes school database records and staff communication database rows; excludes Supabase Storage binary files, authentication accounts/passwords/sessions, database schema and platform configuration.
- Updated Backup & Recovery interface to explain these exclusions and explicitly warn that restore is not one-click. It requires compatible schema preparation, separate handling of auth and uploaded files, and an isolated restore test; do not import directly into the live database.
- GitHub commits: active-admin guard `ffa04dbd8b949262f7b94925aa9d9e81462bdd1d`; snapshot scope `ff2209348bd38c9a8f4cdf04747070321dd4ff71`; UI restore warning `86cc542d3702a28a6fd025e9ef14f12f6bce09db`.
- Verification: all 3 inline JavaScript blocks parse; live Edge Function list confirms version 25 ACTIVE; Supabase health advisor returned zero lints. No Google Drive connection, backup, restore, account reset or school record mutation was performed.
- Pending: administrator runtime test of active/inactive account guards, real backup validation, and an isolated restore drill. Full app deployment and Windows/Android tests remain pending.

## 2026-11-06 — Read-only live finance and learner-data integrity audit
- Read-only checks against the live Supabase project found the latest successful encrypted cloud backup run at `2026-11-06 09:06:05 UTC` (12:06:05 Uganda time), with 231 records in its run manifest. Automatic cloud backup is currently enabled with `daily` frequency. This checks the run metadata only; the encrypted Drive file has not yet been decrypted/validated in this session.
- Backup validation audit table currently has 0 rows. No administrator validation was triggered because this development session has no authenticated school-admin browser session; do not treat the existing successful backup run as a validated backup.
- Finance integrity checks: orphan payment allocations 0; payments allocated above their payment amount 0; charges allocated above their charge amount 0; incomplete reversal audit records 0; charges with missing enrolment-period links 0.
- Learner integrity checks: duplicate permanent pupil codes 0; learners with more than one Active enrolment period 0; invalid bursary amounts 0; invalid mid-term proration day/rate records 0.
- The project currently has 2 enrolment-period rows, 2 school-payment rows, 0 payment-allocation rows and 1 learner-charge row. These counts are observations, not test fixtures; no rows were inserted, edited or deleted.
- This was a read-only audit. It does not replace authenticated browser tests, backup decryption validation, restore drill, or Windows/Android tests.

## 2026-11-06 — Assessment setup safeguards
- Hardened administrator assessment creation in the Academic module. Before saving, the form now verifies the selected term, class and subject exist; confirms the subject is assigned to that class; requires a finite maximum score greater than zero; and requires any entered assessment date to fall within the selected term.
- Prevents an exact duplicate assessment period/title for the same term, class and subject. It also checks the authenticated administrator session before setting `created_by`, prevents duplicate submissions while saving, and displays a clear failure message if the save flow errors.
- The loaded class-subject assignment list is now retained in the academic client state for the pre-save validation. No class, subject, term, assessment or learner mark records were created or changed.
- GitHub commits: application `06e16e68968b565ec37250fd952739f4d494409b`; service worker cache v24 `7d2385f913fb61744d0105571cd46613a8c6e88c`.
- Static verification: all 3 inline JavaScript blocks parse successfully. Live academic tables currently contain 0 academic years, 0 terms, 0 assessments, 0 assessment scores and 0 report-card publication rows, so a genuine assessment save and mark-entry workflow cannot yet be exercised without school-authorized academic setup. Browser/runtime and Android/Windows tests remain pending.


## 2026-11-06 — Report-card class integrity and ranking safeguards
- Individual report-card preview now checks that the selected learner belongs to the selected class and that supplied assessment data matches both the selected class and term. This prevents a stale learner selection or mismatched report dataset from being previewed or approved under another class.
- Report publication lookup and the final pre-insert duplicate check now include class ID as well as term and learner, so an approval is checked against the exact class context.
- Report-card positions now rank by percentage rather than raw marks, and tied percentages receive the same competition rank (for example 1, 1, 3), consistent with class performance ranking. Learners without marks for that period remain unranked.
- GitHub commits: application `26c68851a8d844521ad9b0010eeec32e4e58ad1f`; service worker cache v25 `e4aade67b30f2ce0c4559fe870bd39c3423cff11`.
- Static verification: all 3 inline JavaScript blocks parse successfully. Live database still has no configured academic years, terms, assessments, marks or report-card publication rows, so runtime report preview/approval and tie-ranking tests cannot yet be exercised against real school academic records. No school records were changed. Browser, RLS and Windows/Android tests remain pending.


## 2026-11-06 — Teacher-owned mark entry and administrator review workflow
- Reorganised the Academic interface into role-specific workspaces:
  - Administrator-only controls remain for academic years/terms, subjects, class-subject/teacher assignments and grading-boundary decisions.
  - The assessment preparation form is available to Admin and Teacher. A teacher's class selector is restricted to their assigned class, and the subject selector is filtered to that teacher's assigned class subjects and the class curriculum.
  - Individual mark entry, the class mark sheet, Excel-style marks grid, bulk save and offline mark synchronisation are visible and enabled only for Teacher accounts.
  - Administrators see a read-only teacher-submitted marks register, a selected class/term full register that fetches scores in pages, CSV export for Excel, class performance review and report-card controls.
  - Class-wide report-card PDF generation, download and print controls are now Admin-only. The existing batch document keeps one report card per learner page in a single file.
- Database permissions now make `assessment_scores` administrator read-only: the former administrator ALL policy was removed. Admins retain SELECT; assigned teachers retain scoped INSERT and UPDATE; there is no score DELETE policy. The existing teacher update/insert policies require the signed-in teacher identity and the learner to belong to the assessment class.
- Updated `is_class_teacher_for_class` to recognise active teachers assigned through the class-subject map as well as the class access map. Teacher assessment INSERT requires the teacher's own account, their assigned class and subject, a positive maximum score, and an assessment date inside the term; a later migration also blocks creating assessments in closed terms. Teachers cannot edit/delete assessment definitions through this new policy.
- Offline assessment-draft synchronisation now exits for non-Teacher roles. Local mark-form autosave/restore is Teacher-only. Admin export of class performance is hidden and blocked for Teacher accounts.
- Live database policy inspection confirms Admin SELECT only on marks, Teacher INSERT/UPDATE only, and no DELETE policy. Assessment policies show Admin management, Teacher INSERT and scoped SELECT. Supabase health advisor returned zero lints.
- Static verification: all 3 inline JavaScript blocks parse successfully. Service worker shell cache is `cornhill-shell-v26`. No browser runtime or authenticated teacher/admin role simulation was performed.
- Live test readiness: database currently has 1 Admin profile, 0 Teacher profiles, 0 `class_teacher_access` rows, 0 academic years, 0 academic terms, 0 assessments and 0 assessment scores. Therefore teacher sign-in, mark entry, administrator visibility, report-card PDF output and permission-denial tests still require an administrator-provisioned teacher account and real school academic setup. No learner, teacher, assessment, mark or report-publication rows were changed by this batch.
- GitHub commits:
  - UI structure `8c7be808ec1a2b34f557a102195a761843e35d38`
  - Teacher-only mark writes and admin register `b94ec4192a081f670e9cd6bb378ce121b60ba80d`
  - Paginated admin register and CSV export `e812fec04041ab31bf56fcf993bd8821a3238ab3`
  - Role/autosave refinements `542f953b6ddcc9581068dabd77677bbaa58d6d39`
  - Final role text and offline sync guard `dd203e4d92be2655ffce753f6e47c16fe356ad23`
  - Service worker cache v26 `2df14dece075b1d9baf76c32ccc76bc0b3675d18`
  - Database migration files: `71a07e829fcfec0571b9a4d1708fbbd2762d27cb`, `9e4a4df2e5dc0fe29f0b6dcbaa1fa709f99be721`, `6957f109cea3c2dc5ca6985679b79eb321e398c3`.
- Supabase migrations applied: `20261106160751_teacher_owned_assessment_entry_and_class_scope`, `20261106161114_restrict_marks_entry_to_assigned_teachers`, `20261106161400_block_teacher_assessments_in_closed_terms`.
- Full application deployment, authenticated browser tests, Android/Windows tests and PDF print testing remain pending.

- Final class-report PDF action guards also require Admin for both the batch PDF download and print actions. Existing `.batch-report-card` styling uses `break-after: page` / `page-break-after: always`, with the final learner page exempted, preserving one report card per page in the single class PDF. UI guard commit `18f13d85326749ca0089cb6014fd29e438617bd2`.
- Additional subject-level RLS hardening: teacher SELECT/INSERT/UPDATE on assessment marks now requires a matching `class_subjects` row for that exact class and subject, with the learner belonging to that class. Teacher assessment reads are also subject-scoped. This prevents a teacher assigned to one subject from entering or reading marks for another teacher's subject in the same class. Applied migration `20261106162237_scope_teacher_marks_to_assigned_subjects`; migration file commit `883b0088cdc42d9e2230421496a7fe48118e7fe2`.
- Final offline shell cache bumped to `cornhill-shell-v27`, commit `97bb57fa38d4759196998fc5cd5a9ba696fcc7e8`.
- Final database inspection confirms marks policies are Admin SELECT only and Teacher SELECT/INSERT/UPDATE subject-scoped, with no score DELETE policy. Subject, class-subject and learner write policies remain administrator-controlled. The health advisor still reports zero lints. Static parsing of all 3 inline JS blocks passed after the final UI code update.

- Migration filenames have been aligned with the actual Supabase migration versions: `20261106162015_block_teacher_assessments_in_closed_terms.sql` and `20261106162237_scope_teacher_marks_to_assigned_subjects.sql`. The matching migration versions are recorded in Supabase; the earlier mismatched filenames were removed from the branch.


## 2026-11-06 — Academic database grant hardening
- Audited effective table grants in addition to RLS policies. Found that the academic tables still had default broad grants to `anon` and `authenticated`, including unnecessary `TRUNCATE`, `TRIGGER` and `REFERENCES` privileges. RLS does not replace SQL table grants, so this needed a separate correction.
- Applied migration `20261106165945_restrict_academic_table_grants`.
- Revoked all table privileges from `anon` and `authenticated` on `academic_years`, `academic_terms`, `assessments`, `assessment_scores`, `class_subjects`, `school_classes`, `students` and `subjects`, then granted back only required operations to `authenticated`.
  - `assessment_scores`: SELECT, INSERT and UPDATE only; no DELETE, TRUNCATE, TRIGGER or REFERENCES.
  - Other listed academic tables: SELECT, INSERT, UPDATE and DELETE for authenticated users, still constrained by their existing RLS policies (administrator-only writes where defined).
  - No `anon` table privileges remain on the eight tables.
- Verification query passed all 10 checks: anon cannot read/insert marks or read assessments; authenticated retains needed mark SELECT/INSERT/UPDATE privileges; authenticated has no mark DELETE/TRUNCATE/TRIGGER/REFERENCES privilege. RLS remains enabled on all eight tables.
- Supabase health advisor returned zero lints.
- This is a grant-level verification, not a simulated teacher/admin sign-in or pgTAP policy test. The project does not currently have the pgTAP extension installed, and there are no teacher accounts or configured academic terms/assessment rows for an end-to-end mark-entry test. No school records were changed.
- GitHub migration file: `supabase/migrations/20261106165945_restrict_academic_table_grants.sql`; commit `84bb4d32342bd4a981b7b5f3cddb2d43640f8c07`.


## 2026-11-06 — Report-card publication audit grant hardening
- A further academic security audit found broad default client grants on `report_card_publications`, despite an Admin-only RLS policy. This table controls whether results are officially published.
- Applied migration `20261106170123_restrict_report_publication_table_grants`.
- Revoked all table privileges from `anon` and `authenticated`, then restored only SELECT, INSERT and UPDATE to authenticated users. Existing Admin-only RLS policy remains the row-level gate; DELETE, TRUNCATE, TRIGGER and REFERENCES are not granted to client roles. This preserves the application's check-and-insert/upsert publication workflow while preventing deletion of approval history through the client API.
- Verification shows only authenticated SELECT/INSERT/UPDATE grants; no anon grants. Supabase health advisor returned zero lints. No publication records were inserted, changed or deleted.
- GitHub migration file `supabase/migrations/20261106170123_restrict_report_publication_table_grants.sql`, commit `b07e91182dc9c58a01449c3b7e125713c27e23ed`.


## 2026-11-06 — Service-only communications table grant lockdown
- The security advisor identified two RLS-enabled service-only tables with no row policies but broad default client table grants: `communication_delivery_events` and `communication_provider_settings`.
- Applied Supabase migration named `lock_service_only_communication_tables` to revoke all privileges from `anon` and `authenticated` on both tables. These are backend/service-managed records, not direct browser-client tables.
- The immediate follow-up verification query was blocked by the tool, so the absence of client grants and the exact remote migration version still need confirmation. No table rows were changed.
- Auditable SQL saved at `supabase/maintenance/lock_service_only_communication_tables.sql`, commit `f18142b57e704765d1eba7058c5c3e549044ec83`. This is a maintenance SQL record, not yet a timestamped migration file because the remote version could not be confirmed.


## 2026-11-06 — Lock down service-only communications tables
- Security advisor identified two communications tables with RLS enabled but no policies: `communication_delivery_events` and `communication_provider_settings`. Direct client grants were also still present, including anon access.
- Applied migration `20261106170215_lock_service_only_communication_tables`, revoking all table privileges from both `anon` and `authenticated` on these two tables. They are service/backend-only; no browser client should read provider credentials or delivery event internals directly.
- Verification query returned no anon/authenticated table grants for either table. Both remain RLS-enabled. Supabase health advisor returned zero lints.
- This does not activate SMS or WhatsApp sending. Existing service-role backend workflows remain separate; no provider credentials or message records were changed.
- GitHub migration file `supabase/migrations/20261106170215_lock_service_only_communication_tables.sql`, commit `a3182ae926d23b47f469b5ed4ed64fbbb4c4c654`.


## 2026-11-06 — Academic grading and curriculum grant audit
- Continued the grant-level review of the teacher/admin academic workflow. Found default broad anon/authenticated privileges on `school_curriculum_subjects`, `uneb_subject_grade_bands` and `academic_grade_bands`, even though RLS policies were already present.
- Applied migrations:
  - `20261106175929_restrict_curriculum_and_uneb_grade_table_grants`
  - `20261106180058_restrict_academic_grade_band_table_grants`
- Revoked all client grants, then restored SELECT/INSERT/UPDATE/DELETE only to authenticated users. Existing RLS remains the actual row-level permission gate: authenticated users can read these configuration tables; Admin-only ALL policies control writes. No anon access, TRUNCATE, TRIGGER or REFERENCES privilege remains.
- Verification passed for all three tables: anon has no SELECT/INSERT; authenticated has the four required operations and no TRUNCATE/TRIGGER/REFERENCES. Existing RLS policies were confirmed. Supabase health advisor returned zero lints.
- Related service-only communications lockdown is also saved and verified: `communication_delivery_events` and `communication_provider_settings` have no anon/authenticated table grants.
- GitHub migration commits:
  - curriculum/UNEB grants: `e1fd36d619a00a6e19f2d16792b936d5c5ef24e7`
  - academic grade-band grants: `178419cf5c23936d68635dad5666d9e368a244f3`


## 2026-11-06 — Finance, staff attendance and collaboration table grant hardening
- A wider database grant audit found 18 tables with broad default grants to `anon`, even though their RLS policies were intended for signed-in administrators or staff.
- Applied migration `20261106180241_remove_anon_and_excess_staff_finance_table_grants` to:
  - class_teacher_access
  - communication_outbox and communication_templates
  - fee_items, fee_schedules, learner_charges, payment_allocations and school_payments
  - school_position_catalogue
  - staff_attendance_adjustments, staff_attendance_device_users, staff_attendance_events, staff_attendance_import_batches and staff_attendance_schedule_assignments
  - staff_communication_comments, staff_communication_posts, staff_communication_reactions and staff_work_schedules
- Removed all `anon` privileges and reset authenticated privileges to ordinary SELECT/INSERT/UPDATE/DELETE only. Existing RLS policies remain responsible for deciding which signed-in administrator or staff member may perform each operation. No TRUNCATE, TRIGGER or REFERENCES privilege is retained for authenticated client roles.
- Kept the separate `class_login_directory` anonymous SELECT because the sign-in screen intentionally displays class labels and teacher display names before login. It contains no teacher password or private class code; those are handled by the protected teacher sign-in function.
- Verification passed for all 18 tables: no anon SELECT; authenticated retains ordinary DML grants; no TRUNCATE/TRIGGER/REFERENCES. RLS policy inventory was checked for each table. Supabase health advisor returned zero lints.
- GitHub migration file commit `6aa7fe00bc9223be7e5882294f4b39262b2e2af2`.


## 2026-11-06 — Final public-schema client table-grant sweep
- Swept all public base tables for remaining anonymous table grants and authenticated high-risk structural privileges.
- Only remaining anonymous table grant is SELECT on `class_login_directory`, which is intentionally used by the pre-login screen to show class labels and public teacher display names. No class codes, passwords or learner data are exposed by that table.
- Found one remaining excessive authenticated grant set on `learner_enrolment_periods`; revoked TRUNCATE, TRIGGER and REFERENCES while preserving SELECT/INSERT/UPDATE/DELETE required by authenticated operations and constrained by RLS.
- Verified no other public base table has authenticated TRUNCATE/TRIGGER/REFERENCES privileges. Supabase health advisor reports zero lints.
- Security advisor still reports six informational RLS-without-policy findings on service-only backup/communication tables (no client grants), 20 SECURITY DEFINER RPC warnings (the inspected sensitive functions contain explicit administrator, active-teacher/class, or verified-guardian checks), `pg_net` installed in public schema, and leaked-password protection disabled. These require deliberate platform/function review; they were not blindly changed.
- GitHub migration file `supabase/migrations/20261106180337_remove_excess_enrolment_period_table_privileges.sql`, commit `026a8e4722396d9772edf7eef0c6c65222700e4c`.
- No school records were inserted, edited or deleted. No teacher sign-in, browser runtime, mobile or Windows tests were performed.


## 2026-11-06 — Administrator teacher-marks register pagination
- Reviewed the live academic UI and database policies against the requested separation: administrators manage learner identity, subjects, grading and report publication; teachers enter marks for assigned classes/subjects; administrators read the teacher-entered register.
- Found that the administrator register loaded only the newest 1,000 assessment-score rows. This could silently omit marks in a larger school.
- Replaced the fixed 1,000-row limit with ordered pagination in batches of 1,000 until all rows permitted by the signed-in user's RLS policies have been retrieved. The administrator's register can now display the complete permitted teacher-mark dataset; teacher queries remain constrained by database RLS.
- Preserved the read-only administrator register and existing teacher-only score insert/update policies. No mark editing controls or delete permissions were added for administrators.
- Static verification: all 3 inline JavaScript blocks parsed successfully after the change.
- No learner marks, assessments, report-card approvals or other school records were changed. No browser/runtime test was performed; actual pagination and rendering should be checked with a teacher account and a dataset exceeding 1,000 marks.
- Deployment remains on hold; this is a GitHub development-branch update, not a live application deployment.


## 2026-11-06 — Backup validation audit visibility refinement
- Reviewed the live Google Drive backup history: latest recorded successful encrypted backup contains 231 records and completed at 09:06:05 UTC on 2026-11-06 (12:06:05 PM Uganda time). Two earlier attempts failed; later backups succeeded.
- Confirmed the Google Drive connection has a configured folder and an encrypted refresh token. No secrets or token values were read or exposed.
- Confirmed no rows exist yet in `google_drive_backup_validations`; the latest backup has not been independently validated. The backup Edge Function is ACTIVE at version 25 and its code includes a separate `validate_backup` action.
- Improved the administrator validation button so that after either a successful or failed validation attempt it refreshes the backup history immediately, allowing the persisted validation audit to appear without requiring a separate manual refresh.
- Static verification: all 3 inline JavaScript blocks parsed successfully after the change.
- No backup was created, no validation action was invoked, no schedule or connection setting was changed, and no school data was modified. Isolated restore testing remains pending.
- Deployment remains pending; GitHub development branch only.


## 2026-11-06 — Backup privacy boundary and recovery runbook
- Reviewed the deployed backup Edge Function table allowlist against actual table columns. Found that the prior snapshot included private communications tables (including message bodies, recipient phone numbers, media paths and call-signalling payloads), contrary to the documented exclusion.
- Read-only row-count check found two existing `school_sms_outbox` rows; other reviewed private communication tables had zero rows. No message contents were selected or exposed.
- Updated `google-drive-backup` to write format v2. New snapshots retain the fixed dataset manifest but intentionally store empty arrays for private communication datasets: communication delivery events/outbox, school SMS outbox, staff posts/comments/reactions, direct messages, media messages and call signals. Reusable communication templates remain included.
- Validator accepts historical v1 snapshots and new v2 snapshots. For v2, it explicitly verifies the exact excluded-table manifest and that all excluded datasets contain zero rows. No historical backup file was modified or deleted.
- Deployed Edge Function version 26 (ACTIVE). GitHub source was synchronised to the deployed function.
- Updated Google Drive setup documentation and added `docs/BACKUP_RECOVERY_RUNBOOK.md` with non-destructive validation, isolated restore gates, privacy boundaries and production recovery safeguards.
- No backup was created, no validation action was invoked, no school table rows were modified, and no restore was attempted. The two existing SMS outbox rows remain untouched in the live database.
- Static source guard checks passed before deployment; deployment returned ACTIVE version 26. A live end-to-end validation and isolated restore drill remain pending.

## 2026-11-06 — Finance integrity review
- Confirmed RLS is enabled on school_payments, payment_allocations, learner_charges, school_expenses and fee_items.
- Confirmed applied migrations for atomic payment posting, duplicate allocation prevention, audited reversals, separate enrolment-period finance, bursary-finance integration and current-term-first allocation.
- Read-only table counts: learner_charges 1, school_payments 2, payment_allocations 0, learner_enrolment_periods 2, school_expenses 0, fee_items 13, expense_categories 13.
- Reviewed posting and reversal SQL and UI source. Controls include administrator-only posting, positive UGX validation, per-learner transaction lock, active-enrolment charge checks, duplicate and over-allocation rejection, current-open-term automatic allocation, explicit prior-term selection, unallocated credit when no current term exists, and audited non-deleting reversal.
- Supabase health advisor returned zero health lints. Existing security advisor notices remain; no broad permission changes were made.
- Added docs/FINANCE_ACCEPTANCE_TESTS.md with completed read-only checks and isolated transaction tests still required.
- No school finance rows were inserted, updated, reversed or deleted. Existing payment rows were not used as test records.
- This was a read-only schema/migration and source review, not an authenticated runtime transaction test. Balance reconciliation, actual reversal, concurrency, browser receipt preview and thermal-printer output remain pending.


## 2026-11-06 — Learner statement table alignment correction
- Reviewed the learner fee statement renderer and found mismatched receipt-table columns: a duplicate status heading made the period receipt table wider than its data rows, while the legacy-receipt table omitted the status/reversal heading even though each row included that cell.
- Corrected the period receipt table to six matching columns, corrected its empty-state colspan, and added the missing status/reversal heading to the legacy receipt table.
- Static verification: all inline JavaScript blocks parsed successfully; no duplicate HTML IDs were found; all three targeted markup replacements matched exactly once.
- No learner, charge, payment, allocation, receipt or balance records were changed. Browser rendering and printed statement layout still require runtime verification.
- Service worker shell cache advanced from v28 to v29 so clients fetch the updated application shell.
- This is a saved development-branch correction only; it is not deployed.


## 2026-11-06 — Expense register reference and void-audit refinement
- Corrected the expense report data queries to include payment references and supplier receipt/invoice references, which were previously omitted from the selected fields and therefore exported as blank.
- Added both references to the on-screen expense register and printed expenditure report; expanded the CSV with separate payment-reference and supplier-receipt/invoice columns and aligned the empty-state column span.
- Strengthened expense voiding: require a reason of 5–500 characters, confirm the action, disable the selected control while saving, and require the database update to return the exact posted expense row before reporting success. A concurrently voided or otherwise changed expense now produces a clear refresh/check message rather than a false success.
- Static verification: all inline JavaScript blocks parsed; no duplicate HTML IDs; all seven report/query replacements and the void-handler replacement matched exactly.
- No expense, payroll, salary or other school records were inserted, updated or voided during this code-only batch. Browser, RLS and actual expense workflow tests remain pending.
- Service worker shell cache advanced from v29 to v30. This remains a development-branch change and is not deployed.


## 2026-11-06 — Payroll payment confirmation safeguards
- Hardened the administrator payroll "Mark paid" action: blocks duplicate clicks, verifies the payroll line is still Pending and the period is Approved/Part-paid, checks all entered amounts are non-negative safe whole-UGX values, enforces advance recovery not exceeding the outstanding amount shown, validates payment method and calculated net pay, and confirms the exact net amount before posting.
- The database update now filters on Pending and requests the updated row back. If another user already changed the line, the UI no longer reports a successful payment; it asks the administrator to reload and verify.
- Static verification: all inline JavaScript blocks parsed successfully and no duplicate HTML IDs were found.
- No payroll, salary advance, expense or staff records were changed. This is a source-level safeguard only; the database trigger/RPC transaction behavior, advance recovery and matching expense creation still require isolated runtime tests.
- Service worker shell cache advanced from v30 to v31. Development branch only; not deployed.


## 2026-11-06 — Combined finance verification batch: 24 read-only database checks
- Ran 24 read-only database integrity and security checks covering RLS, anonymous grants, positive/bounded amounts, payment/allocation reconciliation, over-allocation, receipt/expense uniqueness, reversal audit completeness, payroll-to-expense linkage, advance balance bounds, salary agreement date validity/non-overlap and voided-expense audit details.
- All 24 checks returned PASS.
- Inspected database policies for payments, allocations, charges, expenses, salary agreements/advances, payroll items/periods and daily collection records. Administrator scope was present on the reviewed management policies; staff have a separate own-advance read policy.
- Inspected payroll triggers and functions: attendance deductions before payroll insertion; salary expense creation when a payroll item becomes Paid; advance recovery on payroll payment transition; salary expense requires an Approved/Part-paid payroll period and an active Salaries & wages category.
- Current dataset is very small: 2 payment rows, 0 allocations, 1 charge, 0 expenses, 0 payroll items, 0 salary agreements and 0 advances. Therefore several checks, especially payroll and expense invariants, passed over empty tables and do not prove live workflows.
- No live rows were inserted, updated, reversed or deleted. No payroll was paid and no expense was voided.
- Authenticated RPC execution, concurrency, payroll/advance workflow, expense voiding, daily collection refresh, receipt printing and thermal-printer tests remain pending in an isolated authorised environment.
- Updated docs/FINANCE_ACCEPTANCE_TESTS.md with the 24-check results and limitations.
- This is a read-only database test batch and documentation update only; no deployment or device test.


## 2026-11-06 — Combined admission and academic verification batches
- Batch A: ran 24 read-only admission/learner identity/bursary/guardian/enrolment checks. All 24 returned PASS: RLS enabled, permanent admission-code uniqueness/nonblank, active learner class links, day/boarding values, bursary amount/reason/category consistency, award date ranges, one active enrolment per learner, valid exit dates, guardian consent-number consistency, one active primary guardian, and history foreign-key integrity.
- Batch B: ran 22 read-only academic integrity checks. 21 returned PASS and one returned FAIL: one class-subject mapping is assigned to an Active Admin profile rather than a Teacher profile. Aggregate diagnostic confirmed one such mapping; no staff identity details were exposed. It was deliberately not changed pending administrator confirmation.
- Academic checks also confirmed score uniqueness/non-negative/max-score bounds, assessment class/subject/term/date integrity, learner-to-assessment class matching, unique class-subject mapping, report-publication class/term/learner links and grade-band range validity.
- Dataset at review: 2 students, 2 enrolment periods, 1 bursary award, 2 guardian contacts, 0 class/status history rows; 55 class-subject mappings; 0 academic years, 0 terms, 0 assessments, 0 scores and 0 report publications. Empty transaction/history tables limit the meaning of some PASS results.
- No learner, guardian, bursary, enrolment, class-subject, assessment, mark or publication rows were changed. No browser/RPC/teacher-session test performed.
- Added `docs/ADMISSIONS_ACADEMICS_ACCEPTANCE_TESTS.md` with all checks, the one configuration exception and required end-to-end tests.
- Follow-up: school administrator should confirm the one Admin profile assigned to a class-subject row; use an isolated test learner, teacher and term for end-to-end admission and academic tests.


## 2026-11-06 — Combined staff attendance integrity batch: 24 checks
- Ran 24 read-only database checks covering RLS, staff foreign keys, duplicate event dedupe keys, event timestamps, attendance adjustment reasons/review audit, schedule time windows and non-negative grace/break periods, schedule/staff mappings, device mapping completeness, import counters, incident deductions/review audit and alert staff references.
- All 24 checks returned PASS.
- Important limitation: all eight inspected attendance tables currently have zero rows (events, adjustments, schedules, schedule assignments, device mappings, import batches, incidents and alerts). The results are structural checks over empty tables, not proof that attendance workflows work.
- No attendance events, staff profiles, schedules, device mappings, import batches, incidents, alerts or payroll records were inserted or changed. No fingerprint device was connected or activated.
- Added docs/STAFF_ATTENDANCE_ACCEPTANCE_TESTS.md with results and required isolated end-to-end tests.
- Pending: schedule setup, clock-in/out, lateness, correction approval, CSV duplicate import, offline sync, payroll deduction linkage, role-based access and physical device compatibility tests.


## 2026-11-06 — Parent portal and backup security batch: 24 checks
- Ran 14 read-only guardian privacy checks and 10 backup security/audit checks. All 24 returned PASS.
- Parent checks covered RLS, no anon grants, authenticated-only guardian lookup RPC, admin-only guardian directory/change-log policies, active primary guardian uniqueness, opt-in phone requirements, and contact-change audit references/reasons.
- Inspected parent lookup function: requires authenticated user and confirmed phone, then requires active guardian contact phone plus exact permanent pupil code; payload is learner-scoped and gates assessment results by report publication, payments to Posted, balance to active enrolment period, and conduct to published guardian-visible reports.
- No separate parent OTP table exists in public schema. Actual OTP delivery depends on Supabase phone authentication configuration and was not tested. No SMS/OTP was sent.
- Backup checks covered RLS on runs/settings/connection/OAuth-state/validation tables, no anon grants, admin-only validation history read, non-negative record totals, completion timestamp for successful runs and valid validation audit references.
- Backup status at review: 8 runs (6 successful, 2 failed), one Drive connection, one settings row, zero validation audit rows. Latest backup has not yet been independently validated. No new backup, validation invocation, schedule change or restore was performed.
- Added docs/PARENT_PORTAL_BACKUP_ACCEPTANCE_TESTS.md. Browser guardian isolation, OTP delivery, validation invocation and isolated restore rehearsal remain pending.


## 2026-11-06 — Offline, role and communications security batch
- Ran 16 source-level offline checks: IndexedDB stores/version compatibility, 24-hour class snapshot expiry, teacher-only assessment sync, online/session/owner checks, baseline score/comment conflict detection, pending conflict retention, reconnect sync, attendance queue owner check, read-only offline snapshot mode and service-worker same-origin cache restrictions. All 16 passed.
- Ran 24 database policy/source checks covering active Admin/Teacher helpers, class assignment permissions, staff profile permissions, attendance permissions and review audit, salary/advance permissions, communication template/outbox/provider-setting access and participant-scoped direct messages/call signalling. All 24 passed.
- Found a gap: staff collaboration policies across posts, comments, reactions, direct messages, media messages and call signals did not consistently require an active staff profile.
- Applied migration 20261106202524_require_active_staff_for_staff_communications. Added active-staff session guard and wrapped all existing USING/WITH CHECK policy predicates on the six collaboration tables, preserving their prior audience/participant/role rules.
- Applied migration 20261106202548_use_invoker_for_active_staff_guard. Changed the helper to SECURITY INVOKER, revoked PUBLIC/anon execution and granted authenticated execution only.
- Verified all 18 policies across the six tables now include the guard; helper is SECURITY INVOKER, anon execute false, authenticated execute true.
- Supabase health advisor returned zero lints. Security advisor remains at 20 authenticated SECURITY DEFINER notices, six informational RLS-enabled/no-policy service-only tables, pg_net in public schema and leaked-password protection disabled.
- Added docs/OFFLINE_ROLES_COMMUNICATIONS_ACCEPTANCE_TESTS.md. Browser tests for inactive-user denial, actual messaging and offline IndexedDB/reconnect on Windows/Android remain pending. No school data rows were modified.


## 2026-11-06 — 110-check security and data-integrity cycle
- Completed 110 read-only checks across RLS, anonymous table/function grants, learner/admission/bursary/guardian data, finance receipts/allocations/charges, academic scores/publications, staff attendance, staff collaboration and backup audit integrity. All 110 returned PASS.
- Checks 1–30: RLS on protected school tables.
- Checks 31–48: no anon grants on protected tables; protected RPC execution and current payment RPC grants.
- Checks 49–64: admission, learner, bursary and guardian integrity.
- Checks 65–76: payment, receipt, allocation and charge integrity.
- Checks 77–86: assessment score, report publication and current-term integrity.
- Checks 87–93: staff attendance/schedule integrity.
- Checks 94–101: staff collaboration references and active-staff guard.
- Checks 102–110: backup audit and additional communication/parent portal grants.
- Found the legacy `post_school_payment_with_allocations` RPC was still executable by anon and authenticated roles. Reviewed source and confirmed the current application uses `post_school_payment_complete`, not the legacy RPC.
- Applied migration `20261106202809_revoke_legacy_payment_rpc_client_access`, revoking PUBLIC/anon/authenticated execution from the deprecated legacy RPC. Verified anon=false, authenticated=false, postgres=true; migration recorded.
- Current payment posting RPC unchanged and remains authenticated-only (admin check in function). No payment, allocation, charge or learner rows changed.
- Supabase health advisor returned zero lints.
- Added `docs/SECURITY_DATA_INTEGRITY_110_CHECKS.md` and migration source.
- Important: checks against empty transaction tables are structural/no-corruption checks, not transaction workflow tests. Real browser, payment/reversal, OTP, backup validation/restore, offline sync, thermal printer, Windows/Android and deployment checks remain pending.


## 2026-11-06 — Parent portal and guardian contact security cycle (127 checks)
- Reviewed parent portal, teacher visiting-day lookup, guardian directory/update RPCs, guardian contact RLS, report publication, conduct report visibility and guardian audit trigger.
- Completed 95 parent/teacher source and policy assertions. 94 passed immediately; one exact source-string assertion was too strict about the formatting of the Teacher role predicate. Direct live function inspection and a corrected role-fragment query confirmed the required Teacher-role guard. No access-control defect remained.
- Confirmed parent portal requires a signed-in Auth user with a confirmed phone, matches that phone to an active guardian contact and the supplied permanent pupil code, and returns only the linked learner.
- Confirmed parent assessment results require an approved report publication. The separate published-report list is also safe because report_card_publications.approved_at and approved_by are NOT NULL; the suspected pending-publication leak was not a live defect.
- Confirmed parent payments are learner-scoped and Posted-only; balances are active-enrolment-period scoped; conduct reports require guardian visibility and a published timestamp not in the future.
- Applied Supabase migration 20261106203230_guardian_contact_consent_and_audit_invariants: enforce phone for SMS opt-in, WhatsApp number for WhatsApp opt-in, one active primary guardian per learner, and expand guardian audit history to record relationship, active and primary changes.
- Applied Supabase migration 20261106203301_correct_ug_phone_format_validation: reassert canonical +256 E.164 phone/WhatsApp validation in constraints and admin update RPC.
- Post-migration 32/32 checks passed, including valid/invalid sample phone patterns, constraints, unique index, audit columns/trigger, admin authorization, consent validation, grants and unchanged live row counts.
- Created GitHub migration sources and docs/PARENT_PORTAL_GUARDIAN_SECURITY_127_CHECKS.md.
- Supabase health advisor returned zero lints. Security advisor still reports six service-only RLS/no-policy informational notices, pg_net in public schema, 20 authenticated SECURITY DEFINER warnings and leaked-password protection disabled. No broad changes made.
- No guardian/learner/finance records were edited and no audit rows were fabricated. Actual OTP, browser, guardian-account isolation and Windows/Android tests remain pending.


## 2026-11-06 — 250-check security and data-integrity cycle
- Completed exactly 250 live Supabase assertions: 63 public-table RLS checks; 62 anonymous table-privilege checks; 50 checks across 25 trigger functions (attachment and no client EXECUTE); 46 checks for existence and anonymous denial of 23 key RPCs; 27 learner/guardian/finance/academic/attendance/backup integrity checks; and 2 public sign-in directory privilege checks. All 250 passed after the targeted corrections.
- The first pass identified seven trigger-only functions with unnecessary client EXECUTE privileges. Applied migration `20261106205433_revoke_client_execution_from_trigger_functions` to revoke PUBLIC/anon/authenticated execution while preserving database trigger attachment. Verified all 25 inspected trigger functions remain attached and none is directly client-executable.
- The first pass also flagged an over-broad anonymous SELECT grant on `class_login_directory`. Source review confirmed the sign-in page needs only class_key, class_label, teacher_name, administrator_name and display_order. Applied migration `20261106205651_limit_public_class_login_directory_columns` to remove table-wide anonymous SELECT and grant those five display columns only.
- Verified the public directory has exactly five anonymous SELECT columns, zero unexpected columns, no anonymous write grants and no table-wide anonymous SELECT. Sign-in page source uses the allowed display fields.
- Final 250 assertions all PASS. Separate allowlist query: five intended columns, zero unexpected columns.
- Health advisor: zero lints. Security advisor retains six informational service-only RLS/no-policy findings, one pg_net-in-public-schema warning, 20 authenticated SECURITY DEFINER RPC warnings and leaked-password protection disabled. No blanket changes were made to intentionally guarded admin RPCs or service-only tables.
- No school data rows or credentials were changed/read. Runtime transaction tests, browser tests, parent OTP, backup restore, hardware, Windows/Android and deployment remain pending.
- Created `docs/SECURITY_DATA_INTEGRITY_250_CHECKS.md` and both migration source files.


## 2026-11-06 — Offline and backup source acceptance review (274 checks)
- Reviewed offline class snapshots, form autosave/restoration, teacher assessment drafts and sync, staff attendance correction queue, service-worker cache/network boundaries, and Google Drive backup encryption/privacy/validator source.
- Completed 274 static source assertions across six groups: class snapshots 51; form autosave 50; assessment queue 62; attendance correction queue 29; service worker 30; backup 52. First run matched 266; eight false negatives were caused by test-harness source-scope or outdated IndexedDB-version expectations. All eight were rechecked against the correct code regions/current version and passed. These were harness mismatches, not application defects.
- Parsed all three inline JavaScript blocks in `index.html`; zero syntax errors.
- Found and fixed offline marks pending counter: drafts have `expires_at:null`, but the counter previously required a future expiry and was not called after class-grid load. It now includes no-expiry drafts, is Teacher-only and runs after successful grid rendering.
- Advanced service worker cache from v31 to v32.
- Read-only live Supabase check: health advisor zero lints; security advisor still reports six service-only RLS/no-policy notices, pg_net in public, 20 authenticated SECURITY DEFINER functions and leaked-password protection disabled.
- Backup history at review: 6 successful, 2 failed; latest successful completion 2026-11-06 09:06:05.842 UTC; max successful recorded total 232. Backup validation audit table still has zero rows; latest backup is not independently validated. Edge Function invocation action is not exposed through current tool connection, so validator was not invoked. No backup or restore run.
- Server attendance correction requests and assessment score rows both remain zero; no live sync or mark transaction test occurred.
- No learner, guardian, finance, academic, attendance, payroll, communications or backup rows were changed. Browser/IndexedDB, network reconnect, conflict, Android/Windows and deployment tests remain pending.
- Added `docs/OFFLINE_BACKUP_ACCEPTANCE_TESTS_274.md`.


## 2026-11-07 — Next security and database audit
- Inspected the live schema, FK/index coverage, SECURITY DEFINER search_path settings, views, RLS policies, and teacher assessment access rules.
- Found that `authenticated` had table-wide SELECT on `public.students`. Teacher UI queried only class-register columns, and RLS already restricted teacher rows to assigned classes, but direct API clients could request extra private learner columns.
- Applied live migration `restrict_teacher_student_select_columns`: revoked table-wide SELECT and granted only 17 class-register columns (IDs, admission/learner identifiers, names, basic class/academic fields and status). Kept existing row-level policies intact; admin learner profile remains served through guarded admin RPC.
- Verification: authenticated table-wide SELECT = false; 17 allowed SELECT columns; 0 selected private columns among guardian phone/email/address, photo path, WhatsApp phone and bursary notes/reason/category/amount; all 17 expected class-register columns remain selectable.
- Supabase catalog audit: 0 public SECURITY DEFINER functions missing an explicit search_path; 0 public views missing security_invoker; 0 unvalidated public constraints; 0 invalid indexes. Six RLS-enabled/no-policy tables are service-only communication/backup tables and require no client policy by design.
- Academic RLS policies confirm teacher score INSERT/UPDATE checks are tied to their assigned class/subject and authenticated user; administrator assessment management uses `is_school_admin()`. Runtime impersonation tests still pending.
- Performance advisor reports 58 unindexed foreign keys, 18 unused indexes and 22 multiple-permissive-policy findings. These require per-table review; no bulk index/policy changes made without query-plan and behavior review.
- Security advisor continues to report 20 authenticated SECURITY DEFINER RPCs and leaked-password protection disabled. Each RPC requires body-level authorization review before changing grants; no blanket revoke applied.
- No learner or school transaction rows changed.

## 2026-11-07 — Class progression and offline review batch

- 107/107 static source assertions passed: 32 class-promotion/academic-calendar UI checks and 75 offline attendance, teacher assessment draft sync, local form autosave and academic-calendar checks.
- 14/14 live Supabase metadata/function assertions passed for the class-promotion RPC, RLS and administrator-only history policies.
- Read-only live counts: 10 classes, 2 learners, 2 enrolment periods, 0 class-history rows, 0 academic years and 0 terms. Both active enrolment periods match the learners' current classes.
- No school records were inserted, updated or deleted. A real promotion, academic-year transition and term workflow were not executed because no approved test learner or school calendar dates were configured.
- Clarified offline boundaries: attendance queues corrections only (not clock-in/out), teacher marks can remain local drafts until conflict-checked sync, form autosave is device-local, and payment posting remains online-only.
- Documented in `docs/CLASS_PROGRESSION_OFFLINE_REVIEW_20261107.md`.
- Paid Supabase leaked-password protection is explicitly out of scope; no upgrade is required.

## 2026-11-07 — Preview comparison and release-gate correction

- Found a Vercel preview in READY state at `https://cornhill-school-97xjp2o32-cypher-projects1.vercel.app`, built from commit `42980a76f3395b8257884a986f5e0f01ee93adf9`.
- Compared deployed-commit and current-branch blobs: `parents.html`, `manifest.webmanifest` and `vercel.json` match; `index.html` does not. The preview is therefore not the latest application code and must not be treated as the current release.
- The preview commit contains the corrected static-page build configuration, but live route responses for `/parents.html` and `/manifest.webmanifest` have not been independently verified in a browser.
- Removed the excluded paid Supabase leaked-password feature from the release-blocker list. The free app-level alternative and its server-side limitation remain documented.
- Latest application source remains on `feature/cornhill-v3-foundation`; a new preview of that exact branch head is still required before device acceptance.


## 2026-11-07 — Combined 75-point source and live database review

### Application source review

- Reviewed the current branch `index.html` and ran **75 targeted source-presence assertions** across learner admission/identity, guardian details, bursary, enrolment, teacher assessments, grading/report cards, payment allocations and receipts, attendance, offline draft handling, parent portal, staff communications, media/calls, fingerprint mapping, themes, mobile layout and password recovery.
- **73/75 source assertions matched.** Two search-pattern checks did not match: a dedicated learner-status-filter token and a Google Drive backup token in the main `index.html`. These are not treated as confirmed defects: backup implementation is in separate server-side function files, and the learner status filter needs a targeted UI/code-path review. Neither is marked passed until verified in its actual implementation.
- No code was changed and no live learner/payment records were modified in this batch.

### Live Supabase metadata snapshot (read-only)

- Public tables: **63 total, 63 with RLS enabled**.
- Public RLS policies: **107** (count only; this batch did not re-execute every policy under real user identities).
- Public views: **3 total, all 3 configured with security_invoker**.
- Direct anon table privileges for SELECT/INSERT/UPDATE/DELETE: **0**.
- Public database functions: **52 total**; **30 SECURITY DEFINER**.
- SECURITY DEFINER functions executable by anon: **0**.
- SECURITY DEFINER functions executable by authenticated: **20**; retain individual authorization-body review and live role tests as release requirements.
- All 30 SECURITY DEFINER functions have an explicit function-level search_path configuration; an empty search_path is intentional hardening, not a missing setting.

### Deployment state

- The current feature branch head recorded for this review is `542d18c9094d0a11e560a334b2ddc02ffeef5b41`.
- GitHub's commit status for that SHA reports the Vercel check as failed with the Vercel build-rate-limit/upgrade gate. No paid upgrade was made.
- The most recent READY deployment listed by Vercel is still an older commit (`ecdd848908da1281bf7c750c2377a3bed90ce874`), not this branch head. Therefore the latest source review is not a claim that the current code is live.

### Remaining validation

- Inspect the actual learner status-filter UI and its query behaviour; do not infer failure solely from a missing variable-name pattern.
- Locate and inspect the Google Drive backup Edge Function and run its validation/restore workflow only with a designated test backup.
- Keep browser E2E, real administrator/teacher/guardian account isolation, OTP/email delivery, payment allocation/receipt posting, offline reconnect/conflict, Windows/Android, thermal printer, fingerprint hardware and current-commit deployment as pending external/runtime checks.
- Free-tier-only policy remains in force. No paid Supabase/Vercel feature or upgrade is required or authorised.


## 2026-11-07 — Combined cross-module batch: 98 source checks + database security review

### Cross-module source verification
- Reviewed the current feature-branch `index.html`, the separate `parents.html` portal, the active Google Drive backup Edge Function (version 26), and the relevant database authorization functions.
- The broad first-pass scan matched **94/98** source patterns. Four patterns were initially searched in the wrong file or source layer. Targeted inspection then verified them in their actual locations:
  - Class-teacher assignment is enforced by `public.is_class_teacher_for_class(uuid)`.
  - Guardian OTP and pupil lookup are implemented in `parents.html` and `public.parent_portal_get_learner(text)`.
  - The parent portal uses SMS OTP, verifies a session, then calls the guardian-scoped learner RPC.
- Result: **98/98 intended source features verified across their correct files/layers**. This is source inspection, not browser end-to-end proof.
- Confirmed the class roster status filter exists, offers All/Active/Inactive/Transferred/Withdrawn/Graduated, listens for changes, and applies the selected status to the roster query. The earlier unmatched status-filter pattern was a false negative.

### Google Drive backup function review
- Function is ACTIVE, version 26, with `verify_jwt=false`; manual POST operations independently validate the bearer token with Supabase Auth and require an active Admin profile. The scheduled path validates a separate scheduler token through a database RPC. OAuth callback uses expiring, hashed, one-time state and rechecks the initiating administrator.
- Source checks confirmed AES-256-GCM encryption, a 32-byte key requirement, random 12-byte IVs, encrypted refresh-token storage, decrypt-and-verify before upload, paginated reads, and started/success/failed audit states.
- The function explicitly excludes private communication bodies and records that Supabase Storage files and Auth accounts are not included in this database snapshot. A successful real Google Drive upload and restore drill remain unverified; Google OAuth secrets and an approved test backup are required.
- CORS permits all origins. The privileged POST routes remain guarded by admin or scheduler-token checks; this configuration still needs browser/provider runtime testing.

### Live database metadata checks (read-only)
- Six server-only communication/backup tables have RLS enabled and zero policies. Direct privilege checks returned false for anon SELECT/INSERT and authenticated SELECT/INSERT/UPDATE on all six tables. They are not directly accessible to client roles; the server function uses the service credential. No policy was added because that would broaden client access.
- 30 SECURITY DEFINER functions: zero executable by anon; all 30 have an explicit function-level search_path. 20 are executable by authenticated users and require function-level authorization controls.
- Targeted function-body review verified:
  - `is_class_teacher_for_class`: requires the current active Teacher and an assigned class.
  - `parent_portal_get_learner`: requires a signed-in user with a confirmed phone matching an active guardian contact for the supplied pupil code; reports are publication-gated.
  - `teacher_visiting_day_lookup`: requires an active Teacher and learner in the teacher's assigned class.
  - `list_staff_directory`: requires a signed-in active staff profile before listing active staff names/roles.
- Security advisor currently reports six RLS-enabled tables without policies (confirmed server-only/no client grants), `pg_net` in public schema, and 20 authenticated-callable SECURITY DEFINER functions. The latter are not automatically vulnerabilities; each exposed function must retain a valid role/ownership guard. Moving `pg_net` requires a separate compatibility review.
- Performance advisor reports 58 unindexed foreign keys, 18 unused indexes, and 22 multiple-permissive-policy findings. These are optimization candidates, not proof of functional failure; no indexes or policies were changed in this review.
- Health advisor returned zero findings.

### Deployment and release boundary
- Latest READY Vercel deployment in the inspected history uses commit `ecdd848908da1281bf7c750c2377a3bed90ce874`, not the current feature-branch head recorded in the prior audit. The current branch source is therefore not confirmed live.
- No learner, guardian, attendance, assessment, payment, or backup records were created or changed in this batch. No paid plan or feature was enabled.
- Still pending: browser E2E, live OTP delivery, real admin/teacher/guardian role-isolation tests, payment posting/allocation/receipt workflow with approved test data, successful Drive backup plus restore, offline reconnect/conflict runtime test, Windows 10/11 and Android device tests, thermal printer and fingerprint terminal tests, and deployment of the latest reviewed commit.


## 2026-11-07 — Follow-on build verification: authenticated privileged function review

- Queried all public-schema SECURITY DEFINER functions currently executable by authenticated users: **20 functions**.
- Verified for all 20: anon cannot execute; all have explicit function-level `search_path`; all reference the authenticated caller identity (`auth.uid()`).
- Role-specific authorization patterns:
  - Admin-only functions use `is_school_admin()` and an explicit non-null caller check.
  - Teacher-only functions use active Teacher checks and class-assignment checks.
  - Parent learner lookup requires a verified phone claim and an active guardian-to-learner contact match.
  - Staff directory requires an active staff caller profile.
- Individually inspected the payment-posting RPC: requires active school administrator; validates positive amount, payment method, learner's active enrolment, charge ownership, duplicate allocation IDs, remaining charge balance, and prevents over-allocation. Previous-term charges are not automatically swept into current-term payments; they must be explicitly selected.
- Individually inspected parent learner lookup: only returns the learner linked to the verified guardian phone and pupil code; assessment rows are gated by approved report-card publication; conduct records require guardian visibility and publication timestamp; payment history includes posted payments only.
- Individually inspected class teacher helper and visiting-day lookup: current active Teacher and assigned class are required.
- **No database schema or learner/payment records changed** during this review.
- Follow-up still needed: execute negative/positive permission tests using dedicated test Admin, Teacher, and Guardian accounts; test phone OTP delivery; complete payment workflow using approved disposable test learner records.


## 2026-11-07 — Bursary review audit trail

- Added `school_bursary_review_audit` to record when an administrator opens a bursary review and when they explicitly mark it as checked.
- Added guarded RPCs `record_school_bursary_review_event` and `list_school_bursary_review_audit`. Both require a signed-in school administrator; anonymous execution is revoked.
- The audit table has RLS enabled and no direct `anon` or `authenticated` table privileges. Access is only through the guarded RPCs.
- The learner review panel now shows administrator name and Kampala-local date/time. “Mark review as checked” records an audit event only; it does not approve, renew, reject, alter charges, or post a payment.
- Added handling so the exact bursary notification ID follows the deep-link into the learner profile; a failed row lookup clears the pending notification context.
- Verification: 31 targeted source/schema/security assertions checked; database metadata confirms RLS enabled, no direct client table privileges, no anonymous RPC execution, and authenticated RPC execution restricted by administrator checks. Supabase security advisor still reports broader existing findings (including 17 RLS-enabled tables without policies and 30 authenticated-callable SECURITY DEFINER functions); the audit table is intentionally service/RPC-only with no direct policies or client grants.
- Not yet completed: browser interaction tests with a real administrator session, negative teacher/guardian role tests, and confirmation on the deployed Vercel build. No learner bursary approval, fee, payment, or notification status was changed by this work.
