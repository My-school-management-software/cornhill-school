# Cornhill School System — Delivery Progress

Last updated: 2026-11-03 20:40 UTC

This tracker separates code committed to the development branch, database changes the school has applied, and features that are actually tested or live. A commit is not the same as a deployed or verified feature.

## Overall status

- **Development branch:** `feature/cornhill-v3-foundation`
- **Live production:** unchanged; `main` has not been updated by this work.
- **Current milestone:** USB staff attendance foundation (database migration applied and table presence verified; UI committed; end-to-end CSV import not yet tested with a real terminal export).
- **Physical fingerprint machine:** not purchased. Preferred candidate for evaluation: ZKTeco UA300 Pro.
- **Initial staff capacity target:** approximately 30 staff.
- **Connection selected by school:** USB export/import as the planned first connection method.

## Progress by module

| Module | Code/spec status | Applied to database | Tested/live |
|---|---|---|---|
| Staff login and basic roles | Foundation committed | Initial schema previously applied | Basic account/admin role previously verified; app not fully tested |
| Dashboard and module navigation | Dashboard and 10 module tiles committed; unfinished modules clearly labelled | Not applicable | Not yet deployed or browser-tested |
| Learner register and classes | Basic UI committed | Initial schema previously applied | Limited manual testing only |
| PWA install foundation | Manifest, icon and service worker committed | Not applicable | Installability still needs browser/hosting verification |
| Permanent learner code | Server-generated CHM/CHF + admission year + global sequence; app form no longer accepts a manual code | **Migration applied; column and triggers verified** | Transaction test generated CHF26-000001; test row rolled back; no real learner created |
| Teacher portal and class access gate | Spec only | No | No |
| Themes and fonts | Spec only | No | No |
| Staff profiles and HR documents | Basic administrator-only profile editor committed (contact, job, department, responsibilities and employment dates/status); confidential documents excluded pending private storage | **Fields, indexes and admin-only update policy applied and verified** | Not browser-tested; no confidential document storage yet |
| Staff attendance | Tables, device-ID mapping and admin USB import UI committed | **Applied; tables and RLS verified** | No real-device CSV test yet |
| USB fingerprint attendance import screen | Admin screen, staff-ID mapping, CSV parsing, validation and import committed | Uses applied attendance tables | Needs sample terminal CSV and test import |
| Fingerprint terminal integration | Device not purchased; candidate only | No | No |
| Academics, marks and report cards | Admin UI for years, terms, subjects, class/teacher assignments, assessments and marks committed; score/class validation in DB | **Six academic tables, indexes, RLS and score validation trigger applied and verified** | Not browser-tested; teacher self-service and report-card layouts remain future work |
| Fees, receipts and accounting | Spec only | No | No |
| Parent communication, LMS and other modules | Spec only | No | No |

## Latest completed coding milestone (2026-11-03)

- Added academic years and terms, subject catalogue, class-subject/teacher assignments, assessments and learner scores.
- Added administrator screens to configure the academic calendar, subjects, assignments and assessments, and enter or update marks.
- Database validation prevents marks above the assessment maximum and prevents scoring learners outside the assessment class.
- Enabled RLS on all academic tables; reads require sign-in and academic writes are currently administrator-only. Teacher portal permissions and report-card generation are not yet complete.


- Added staff profile fields for phone, job title, department, responsibilities, employment dates and status.
- Added administrator-only profile editing in the web app; staff cannot edit or promote their own profiles.
- Added database update policy and indexes; schema was verified after applying the change.
- Identity numbers, contracts and private documents remain excluded until a dedicated private storage bucket and access workflow are built.


- Added an administrator-only USB attendance import screen to the web app.
- Added mapping from the fingerprint machine's user ID to each staff account.
- Added CSV parsing, supported event checks, Uganda local-time conversion, preview of invalid rows and batch import.
- Applied the attendance migration to the Supabase project and verified the new tables and RLS are present.
- The screen is committed on the development branch; the live production site has not been updated.


- Added a no-login, read-only demo entry point with sample learners/classes so the owner can inspect the interface without exposing real school records or disabling Supabase authentication/RLS. Demo form controls are disabled and sample records are local to the browser.

## USB attendance plan

1. Supplier confirms the exact terminal model supports exporting attendance logs to USB in a documented CSV/Excel/TXT format.
2. Cornhill imports that export through an administrator-only screen.
3. The importer maps the machine's user ID to each staff member's Cornhill staff account, validates date/time and event type, previews accepted/rejected rows, and prevents duplicate imports.
4. Staff see their own attendance; authorized administrators see school-wide records.
5. Corrections are recorded as reviewed adjustments. Raw device events are not silently edited or deleted.

**Important:** USB mode is a file-transfer workflow, not automatic real-time synchronisation. The machine must retain attendance logs until the administrator exports them. Confirm export format and timezone with the supplier before purchase.

## How to read progress

- **Spec only:** requirements have been documented, but no working feature exists.
- **Code committed:** source code or a migration exists on the development branch.
- **Applied:** the migration or code has been installed in the target environment.
- **Tested:** the workflow has passed a documented test.
- **Live:** the tested version is deployed for school use.

We will update this tracker with every meaningful coding milestone and will not mark a feature complete merely because its plan or code has been committed.


## 2026-11-04 — Finance foundation
- Added finance UI: fee item catalogue, fee schedule templates, learner charges with database-generated invoice numbers, payment entry, printable receipts, learner account balances, and recent charge/payment activity.
- Applied Supabase finance schema: `fee_items`, `fee_schedules`, `learner_charges`, `school_payments`, and `payment_allocations`; added indexes and row-level security.
- Added atomic `post_school_payment` RPC. It checks authenticated Admin access, serializes payment posting per learner, allocates payments to oldest unpaid charges, and carries excess as learner credit.
- Added security-invoker account balance view. No real learner/finance rows were created during tests.
- Verified with a rolled-back database test: a UGX 10,000 charge and UGX 6,000 payment produced UGX 6,000 allocated, UGX 4,000 balance, and UGX 0 unallocated credit. Invoice/receipt numbering was verified.
- Supabase security advisor: finance RPC is SECURITY INVOKER; one existing warning remains for the pre-existing public `is_school_admin()` SECURITY DEFINER helper, and leaked-password protection is disabled in Auth. Performance advisor still reports older academic/attendance foreign-key index and permissive-policy notices.
- Finance migration SQL has been applied directly to the live Supabase project. A replayable migration file still needs to be committed; browser verification and cashier workflows remain outstanding.
- Fee schedules are templates only and do not bulk-charge learners. Confirm billing period and the meaning of boarding amounts before setting school-wide defaults or generating term invoices.

- Preview deployment for the finance milestone is READY: https://cornhill-school-1yeg5ud2m-cypher-projects1.vercel.app (commit `487c09b1c3ed2993e1488ff3b6fc989fef02a069`). Inline JavaScript syntax check passed. No interactive browser/device test has yet been performed.

- Extended the no-login read-only demo to include sample finance fee items, schedules, learner balances, and receipt activity. These are synthetic examples only; all finance forms remain disabled in demo mode.

## 2026-11-04 — Teacher mark-entry permissions
- Added a teacher mark-entry view: teachers see the assessment and score-entry workflow, while academic-year, term, subject, class assignment and assessment-creation controls remain administrator-only.
- Added RLS policies restricting teacher assessment/score reads to class-subject assignments where `teacher_user_id = auth.uid()`. Score inserts and updates also require the learner to belong to the assessment class and record the authenticated teacher as `entered_by`.
- Added an index supporting teacher assignment lookups. Applied the policies to Supabase and committed replayable SQL at `supabase/migrations/202611040002_teacher_mark_entry.sql`.
- Inline JavaScript syntax check passed.
- Current database has one Admin profile, zero assigned teacher-subject rows and no teacher accounts to exercise the workflow. Admin must create teacher accounts and assign class subjects before teachers see assessments. No teacher browser login test has been possible yet.

- Added the previously missing replayable finance schema migration at `supabase/migrations/202611040001_finance_foundation.sql`, including fee catalogue/schedules, charges, payment allocations, receipts, account balances, RLS and the SECURITY INVOKER payment-posting function. The schema had already been applied and verified directly; this commit now preserves the SQL for future environment setup.


## 2026-11-04 — Draft term report cards and class performance
- Added term/class/learner report-card preview with subject totals, assessment counts, maximum marks and percentages, plus print support.
- Added provisional class ranking/average summary using marks entered for the selected term. Results are clearly marked draft and not approved or published.
- Teacher report filters are restricted to classes in their teacher assignment records; score visibility remains governed by Supabase RLS. Teachers see only marks allowed by their assigned-subject policies, so a teacher's report preview may be partial where other subjects are assigned to other teachers.
- No schema migration was required. Cashier shift reconciliation remains deferred because payment creation and payment-table access are currently Admin-only; cashier roles and shift-aware payment posting need a separate security design.
- No active learners or recorded scores are currently present in the live database, so live report output could not be exercised with real school data. Browser/device testing remains outstanding.


## 2026-11-04 — Configurable grading and report approval
- Added administrator-managed active grade bands with overlap checks; draft report cards now display the configured overall grade and comment.
- Added an administrator-only report approval action. Approval records the term, class, learner, approving authenticated user and timestamp; the report preview displays approved/draft status.
- Applied Supabase RLS/grant migration for grade bands and publication records. Grade bands are readable by authenticated users; grade maintenance and report approval are restricted to school administrators, and the approver must match the authenticated user.
- Added replayable SQL at `supabase/migrations/202611040003_report_approval_grading.sql`.
- The approval flow is implemented but has not yet been exercised against a real learner/term with a browser session. Do not treat all school reports as approved by default.


## 2026-11-04 — Repeat-safe USB attendance imports
- Hardened USB CSV import so re-uploading the same terminal export does not create duplicate attendance events. Events with a device event ID use the existing unique key; exports without an event ID now use a second database uniqueness rule based on terminal, staff device ID, event type and timestamp.
- Updated the importer to ignore already-imported events, report new/duplicate/invalid row counts, and update the import batch with the actual number of new events.
- Applied the database index migration and verified it with a transaction test: first event accepted, identical repeat rejected by the unique index, and all test rows rolled back.
- Existing security advisor notices remain: the public `is_school_admin()` SECURITY DEFINER helper is executable by authenticated users, and leaked-password protection is disabled. These were pre-existing and were not broadened by this change.
- A real terminal CSV and authenticated browser test are still required; no attendance data was retained by the database test.


## 2026-11-04 — Staff administration and attendance overview
- Added an administrator attendance summary for the last 14 days, grouped by Uganda-local date and staff member, showing first clock-in, last clock-out, event count and incomplete-event review flags. This is a review aid, not an automated payroll/absence decision.
- Added a current class/subject/teacher assignment register to the academic setup screen. Existing assignment creation remains administrator-only.
- Fixed a role-schema mismatch: academic screens already distinguish the `Teacher` role, but the live `user_profiles.role` check previously allowed only `Admin` and `Staff`. The database now accepts `Admin`, `Teacher` and `Staff`; administrator-only RLS remains in place for profile and assignment management.
- Verified the updated role constraint directly in PostgreSQL. Existing user accounts were not promoted or changed.
- Account creation/invitations still require a trusted server-side Auth Admin workflow; no service-role credential is exposed in the browser and no account has been created as part of this change.
- Attendance summary and assignment screens still require a signed-in administrator browser test with real staff, class and event records.


## 2026-11-04 — Sign-in session recovery
- Investigated the reported sign-in stall against Supabase Auth logs and the deployed frontend source.
- Confirmed the school administrator's Auth account has a matching `user_profiles` row with role `Admin`; a successful password-login event exists in the Auth logs.
- Found the frontend initialized sessions through both `getSession()` and `onAuthStateChange()`, allowing an older initial session result to race with a newer sign-in and potentially return the screen to the login state.
- Removed the competing initial session path and now let the Supabase auth-state listener be the single session entry point. Added input validation, a visible signing-in state, disabled duplicate submissions, and readable network/error feedback.
- Commit: `29b321b033d6c60ea1b5f0d9ecf93500ff600609`.
- Preview deployment `https://cornhill-school-oydeh4nzm-cypher-projects1.vercel.app` reached Vercel `READY`.
- Production was not changed. A real-device signed-in browser test is still required to confirm the administrator can reach the dashboard on the affected phone.
