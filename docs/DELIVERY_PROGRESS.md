

## 2026-11-04 — Jibble attendance source foundation
- Added `jibble_csv` temporarily while interpreting Jibble as a data source; this was contrary to the intended product direction and was corrected immediately.
- Corrective migration `supabase/migrations/202611040008_keep_attendance_native.sql` was applied. Live constraints were queried and verified: import sources are now `usb_csv` and `manual`; event source also retains the future `device_api` option. No Jibble source remains accepted.
- Jibble is a product-design reference only. Cornhill will not depend on Jibble, import Jibble data, connect to Jibble APIs, or require a Jibble account.
- Product design lessons to implement natively in Cornhill: one-tap staff clock-in/out, a shared main-office attendance terminal, identity verification using the single fingerprint device, shift schedules, break tracking, late/early/absence flags, overtime calculations, leave requests and approvals, timesheet review/locking, role-based manager permissions, audit trail, and exportable attendance reports.
- Keep the school's single fingerprint terminal connected to the main office computer. Device model/driver/export format must be confirmed before direct device integration is claimed.
- No production deployment was made.

## 2026-11-04 — Native staff work schedules
- Added native work schedule configuration to the Cornhill attendance screen: schedule name, start/end times, late grace minutes, break allowance, and working weekdays.
- Added staff-to-schedule assignments managed by administrators and read-restricted so each staff member can only read their own assignment.
- Created and applied Supabase migration `202611040009_native_staff_work_schedules.sql`; both tables have RLS enabled and explicit authenticated-role grants (new public tables are not automatically exposed through the Data API).
- This milestone does not yet calculate lateness, absences, overtime, or payroll; it also does not enable phone-based clocking or claim fingerprint-device compatibility. Those require subsequent workflow work and confirmation of the exact fingerprint terminal model/protocol.
- Jibble remains design reference only; no Jibble account, API, or import path is used.
- Production remains unchanged.

## 2026-11-04 — Schedule-based daily attendance dashboard
- Added a daily dashboard using assigned active schedules and Uganda-local calendar day: expected staff, present, late arrivals (after configured grace), absent after grace, and missing clock-outs.
- Added a staff-by-staff daily review table and retained the 14-day event history.
- Absence is intentionally marked only after the scheduled start plus grace period; status is a review aid, not an automatic payroll or disciplinary decision.
- The live attendance events table currently contains no events, and no staff schedules are assigned yet; dashboard calculations are implemented but cannot be validated against real attendance activity until school data is entered.
- The preview is generated from the development branch only. Production remains unchanged.


## 2026-11-04 — Repair application startup and restore full demo initializer
- A source-level JavaScript syntax check exposed two literal escaped newline sequences between function declarations in the main inline script. These prevented the browser from parsing the application script, so later function declarations (including `enterDemoMode`) were unavailable.
- Replaced the two literal backslash-n sequences with actual line breaks. The complete inline application script now passes a JavaScript parse/syntax check using the JavaScript engine.
- Removed the temporary standalone demo fallback and reconnected the demo button to the native `enterDemoMode()` initializer, with a visible startup error if it fails.
- Commit: `189b203` fixes the syntax error; follow-up commit `4a4b971` restores the native demo flow.
- Not yet browser-tested on Android. A Vercel deployment attempt was blocked by the team's 24-hour deployment API limit; no new preview is available for this correction yet. Production remains unchanged.


## 2026-11-04 — Native staff attendance correction workflow
- Added a staff-facing correction request form for missed clock-ins, missed clock-outs, time corrections, absence explanations, and other attendance issues.
- Staff can see their own requests and review outcomes/administrator notes. The existing row-level policies restrict staff to their own requests.
- Added an administrator review queue with approve/reject actions and optional review notes. The reviewer identity and timestamp are recorded on each decision.
- The workflow uses the existing `staff_attendance_adjustments` table and its RLS policies; no new database migration or Jibble integration is required.
- Original attendance events remain append-only; a correction request is a review record, not an automatic edit to clock events or payroll.
- JavaScript syntax check passed after the UI changes. Browser testing with real staff/admin accounts remains outstanding.
- Commit: `6e899bc`. Production remains unchanged; Vercel deployment limit still blocks preview publication.

- Follow-up attendance calculation fix: late-arrival comparisons now explicitly convert clock-in times to `Africa/Kampala` before comparing against the scheduled start and grace period. This avoids relying on the administrator's browser timezone. Commit: `520b6f8`; JavaScript syntax check passed.


## 2026-11-04 — Learner bursary fees and receipt-compatible accounts
- Added admission fields for regular fees vs bursary learner, approved bursary amount payable in UGX, and an administrative bursary/sponsor note.
- Bursary amount is the total charge the learner is expected to pay (not a payment or a discount percentage). It must be a positive whole-UGX amount when bursary is selected.
- Added student columns `is_bursary`, `bursary_fee_ugx`, and `bursary_notes`, with a non-negative database constraint.
- Added an after-insert database trigger that creates a normal `learner_charges` record for a bursary learner in the same admission transaction. It uses the existing invoice sequence and charge ledger, so partial payments reduce the normal outstanding balance.
- Existing `post_school_payment` RPC handles bursary learner payments exactly like other learners: receipt number, payment record, allocation against the bursary charge, remaining balance, and printable receipt are retained.
- Learner register now displays bursary status and the approved amount.
- Database migration applied to Supabase project `yemhortbudwbcrzsoozk`; verified all three columns and the insert trigger exist. Frontend JavaScript syntax check passed.
- Commits: `5b554d7` admission UI; `a798769` learner list; `3f07edb` migration file. Production remains untouched; preview deployment remains blocked by Vercel's rate limit.
- Not yet tested with a real learner/payment in the browser. The next deployment should verify admission creates exactly one bursary charge, a part-payment creates a receipt, and the remaining balance is correct.


## 2026-11-04 — Bursary learner admission and school-fee account
- Added a bursary status selector to learner admission. Selecting bursary reveals a required approved total payable amount in UGX and an optional administrative approval/sponsor note.
- Admission validates the amount as a positive whole number of UGX and stores bursary status and approved amount on the learner record. Regular-fee learners default to non-bursary with a zero bursary amount.
- Applied Supabase migration `202611040010_learner_bursary_admission.sql`: adds bursary columns and validation, and creates the learner's approved bursary charge automatically when the learner is admitted. This charge enters the ordinary learner account balance.
- Existing payment posting RPC remains the single payment route for bursary and regular learners: partial payments reduce the balance and create the same numbered official receipt. No separate bursary cashbook or payment path was introduced.
- Database verification confirmed all three bursary columns and the admission trigger exist. JavaScript syntax check passed for the admission UI change.
- Commits: admission UI `5b554d7`; migration file `cab5fd0`. Browser/E2E admission, balance and receipt test is still pending; Vercel preview deployment remains unavailable due to the team's deployment limit. Production untouched.


## 2026-11-04 — Bursary register and finance reporting
- Added a bursary register to the administrator Finance section with learner code/name, approved bursary amount, total payments received and outstanding balance.
- Added bursary summary totals for learner count, approved charges and outstanding balances. Figures are derived from bursary learner records and the existing learner account balance view; payment entries remain in the ordinary school payment ledger and official receipt sequence.
- Extended the finance learner query to retrieve bursary status and approved amount. No duplicate bursary payment table or separate receipt system was created.
- JavaScript syntax check passed. Actual browser verification remains pending because the preview deployment quota is still blocked.
- Commit: `1ca91a8`. Production remains untouched.


## 2026-11-04 — Printable learner fee statements
- Added an administrator-only learner selector and statement generator in Finance.
- Itemises invoices/charges, amounts, allocated payments and per-charge balances; includes the learner's bursary designation and approved amount where applicable.
- Lists every posted receipt for the learner (including payments that remain as unallocated credit), method/date/receipt number, current account credit and net amount due.
- Added print action for parent/guardian statements. Reuses existing ledger and receipt data; no duplicate finance records.
- JavaScript syntax check passed. Browser print/layout and live RLS query testing remain pending until preview deployment is available.
- Commits: `8c63d83` (statement UI), `b3ca395` (all posted receipts and credit).


## 2026-11-04 — Receipt lookup and reprint
- Added administrator-only exact receipt-number lookup in Finance.
- Retrieves the original payment, learner identity, amount, payment method/reference, date, notes, unallocated credit and Posted/Reversed status.
- Allows printing the retrieved receipt without creating another payment or receipt. Reversed receipts are clearly marked as invalid for payment.
- JavaScript syntax check passed. Live browser/RLS verification remains pending.
- Commit: `73a37df`.


## 2026-11-04 — Fee collection report by class and term
- Added academic-term and class filters to the administrator Finance reports.
- Report groups actual learner charges by class/stream, counts distinct learners, and totals charges, posted payment allocations and outstanding charge balances.
- Uses charge-level allocations, so unrelated payments and unallocated account credit are not incorrectly counted as fees collected for a term.
- Added report summary totals and print action. JavaScript syntax check passed; live browser and relationship/RLS verification pending.
- Commit: `e3ffac0`.


## 2026-11-04 — Optional previous-term fee settlement
- Added a secure payment-posting RPC that accepts explicit charge allocations, validates learner ownership and outstanding amounts, and retains the existing oldest-first automatic allocation when no choices are made.
- Payment entry now lists each outstanding charge with its academic year/term, allows staff to skip older balances, pay part/all of a previous term, or split one payment across several terms. Unallocated amounts remain account credit.
- New receipts itemise the allocation by term and fee description, total allocated and unallocated credit.
- Migration applied to Supabase and committed; frontend JavaScript syntax check passed. Real payment/receipt browser testing remains pending.
- Commits: migration `d986278`; UI `688965d`.


## 2026-11-04 — Receipt balance detail
- New payment receipts and receipt reprints now show each allocated fee charge, the amount paid on this receipt, and the remaining balance on that charge after the payment.
- Reprints retrieve the original payment allocations and current posted allocations for each linked charge; reversed receipts remain explicitly marked invalid.
- Frontend JavaScript syntax check passed. Live browser printing and real-payment verification still pending.
- Commit: `72f3f24`.


## 2026-11-04 — Daily collection and payment-method report
- Added administrator date-range report of posted receipts, gross collections by Cash/Mobile Money/Bank Transfer/Card/Other, reversed receipt totals, and net collections.
- Date boundaries use Africa/Kampala local midnight and an exclusive next-day boundary, including the full selected end date.
- JavaScript syntax check passed. Live browser query and print testing pending; database has no payment records at this time.
- Commits: `bbdcdd3`, date-boundary correction `8d47e77`.


## 2026-11-04 — Portable thermal receipts and parent payment SMS foundation
- Added receipt paper-width selection for 58 mm and 80 mm portable thermal rolls, compact receipt typography/layout, and a print-only test slip. Receipt issue and receipt reprint both apply the selected paper width. The current implementation uses the device/system print dialog; direct Bluetooth ESC/POS bridge support still depends on the actual printer connection type and Android print environment.
- Added guardian SMS opt-in on learner admission. Default is opt-out. A posted payment queues a parent SMS only when consent is enabled and a guardian phone is present. Added admin-only outbox visibility; no message is sent yet because the school must select and configure an SMS provider, credentials and sender ID.
- Database migration `202611040012_parent_payment_sms_outbox.sql` applied and committed. Verified outbox schema, payment trigger, and permissions: anonymous users cannot read the queue, authenticated users have SELECT subject to admin RLS, and cannot directly execute the trigger function.
- JavaScript syntax checks passed. Printer hardware print test and SMS delivery test pending. No live provider credentials or physical printer model have been supplied.
- Commits: thermal layout `0954f5c`, print action width fix `bdabd48`, parent consent/queue UI `06279d8`, SMS migration `ebb549a`.


## 2026-11-04 — Term-based learner statement
- Learner fee statements now summarise charges, paid amounts and remaining balances by academic year/term, followed by the full itemised charge ledger and receipt history.
- Thermal receipt width selection is excluded from learner statements so statements remain full-width while individual receipts use the selected 58/80 mm roll.
- JavaScript syntax check passed. Real data and print-driver testing pending.
- Commits: `b2cff8b`, statement-width correction `eb81900`.

## Roadmap note — staff social communication and offline operation
- Staff communication is planned as an authenticated internal feed with announcements, image posts, comments/reactions and short-video posts, plus role/class targeting and moderation. Short video support is technically possible but must be constrained by upload size, storage, compression and bandwidth; it is not a promise of Instagram-scale streaming.
- Offline-first work must use a local operation queue with idempotent sync and conflict handling; payment posting must never silently duplicate or be treated as complete while offline. Cash payments may be captured as pending local drafts and only become official receipts after server confirmation.
- Parent SMS uses explicit opt-in and a queued outbox; an approved provider account, sender ID and credentials are still required before sending.


## 2026-11-04 — Zero-cost delivery requirement
- School owner requires the entire Cornhill system to be built and operated using free plans or genuinely free trials only. No paid subscriptions, plan upgrades, paid add-ons, paid API usage, or payment-method entry are authorised.
- This applies to Vercel, GitHub, Supabase, ChatGPT, SMS gateways, storage, hosting, email, analytics, and every other third-party service used by the project.
- Before enabling any external service or feature, check whether it remains within the free allowance and whether usage can trigger charges. Keep billing/usage caps and alerts at zero-cost settings wherever available; do not enable paid overages.
- If a feature cannot be delivered safely and reliably within a free tier, stop before incurring a charge, explain the limitation, and implement a free/local alternative where practical. Ask the owner before any action that could create a cost; default is not to proceed.
- Prioritise a complete, reliable core school system over optional integrations that require paid services. Clearly distinguish implemented features from those awaiting free-tier capacity, external credentials, or physical hardware.
- Production remains untouched; this is a development-branch delivery policy.


## 2026-11-04 — Native staff communication feed (first release)
- Added a private staff feed with text announcements, role targeting (all staff, teachers, administrators), comments and helpful reactions.
- Added separate posts, comments and reactions tables with RLS enabled. Authors can create and delete their own posts/comments/reactions; administrators can moderate posts/comments/reactions. Feed visibility is enforced by the database for each audience, not just by hidden UI controls.
- Added the Staff communication tab for administrators, teachers and staff. The UI escapes post/comment text before rendering and uses the authenticated user's ID for authorship.
- Applied and verified the database tables and RLS policies in the connected Supabase project. UI and migration source are committed on `feature/cornhill-v3-foundation`.
- This release is text-only. Image and short-video uploads are deliberately deferred to avoid unbounded free storage/bandwidth use and to keep mobile data use low. No paid storage or media service has been enabled.
- Browser testing with separate Admin/Teacher/Staff accounts is still required. Production remains unchanged; no deployment was attempted.
- Commits: database migration `849c9f4` (role policy correction `59ec411`); feed UI `d45628f` (role access correction `2f1168e`, audience correction `239ed3b`).


## 2026-11-04 — Finance collection audit improvement
- Expanded the daily collection report with a receipt-by-receipt audit table: Kampala-local timestamp, receipt number, learner/admission number, payment method, posting status and UGX amount.
- The report now pages through all matching receipts in batches of 1,000 instead of relying on the default first page, so larger date ranges are not silently truncated at the PostgREST row limit.
- Posted collections remain grouped by payment method; reversed receipts remain visible in the audit and separately totalled, and are excluded from net collections.
- The database currently has no active learners and no school payment rows, so a real receipt-based browser test cannot yet be run without creating test data. No financial records were added or changed.
- UI commit: `c91fa1c`. Development branch only; production remains untouched.


## 2026-11-04 — Offline app-shell foundation
- Added a service worker that caches only the application shell (main page, manifest and school icon), serves the cached shell when navigation is offline, and updates the shell when the network is available.
- Explicitly excludes cross-origin requests and all non-GET requests. Supabase authentication, database, storage and function traffic are never cached by this service worker; private learner/finance records and payment requests are not placed in an offline cache.
- Added a visible offline notice explaining that live records and payments require internet. Returning online shows a brief reconnect notice.
- This is an offline shell foundation, not full offline operation or background data synchronisation. No financial action is queued or falsely marked as successful offline. IndexedDB draft queues, conflict handling and idempotent server sync remain future work.
- Source re-fetched from the feature branch after commits. Browser/offline simulation testing and deployment remain outstanding.
- Commits: `11bbb7c` app UI/registration; `c1bde4c` service worker.


## 2026-11-04 — School leadership and position assignment
- Added an administrator-managed `school_position_catalogue` with seeded positions: Director, Headteacher, Deputy Headteacher, DOS, Main Bursar, Deputy Bursar, Matron, Patron, Senior Woman, Senior Man, Cook, Store Manager, Deputy Store Manager, Nursery Head, Lower Primary Section Head (P1–P4), Upper Primary Section Head (P5–P7), Class Teacher and Subject Teacher.
- Added authenticated staff read access and administrator-only catalogue management through RLS.
- Updated Staff Profiles so administrators select a school position when editing each employee. Department/class assignment remains editable, with quick suggestions for Nursery, Baby/Middle/Top, P1–P7, Lower/Upper Primary, Boarding, Catering and Stores. This supports multiple class teachers by recording each class in the assignment field.
- Existing account security roles (Admin, Teacher, Staff) remain separate from job titles; a title does not automatically grant financial or administrative permissions.
- Database catalogue and RLS were applied and verified. Browser testing with staff accounts and a real class roster remains outstanding.
- Commits: UI `795fb81`, `7bfd85e`; migration `201f614`, repeatability fix `42bb03a`.


## 2026-11-04 — Class curriculum and learner identifiers
- Added `students.lin` for the official Ministry of Education Learner Identification Number and `students.p7_index_number` for the P7 examination index. Both have case-insensitive unique indexes when populated. The admission form accepts them as optional; the school admission code continues to be generated by the existing admission workflow. The UI explicitly says not to invent a Ministry LIN or UNEB index.
- Student register now displays school code, LIN and P7 index. Term report identity block includes LIN and displays P7 index for P7 learners. Class list shows the active pupil count based on enrolled students.
- Added `school_curriculum_subjects` with role-protected read access and administrator-only management. Seeded the requested curriculum groups: Nursery (Numbers, Language Development, Reading, Health Habits, Social Development, Writing, Drawing); P1–P3 (English, Mathematics, Literacy I, Literacy II, Local Language, Religious Education); P4–P7 (English, Mathematics, Science, Social Studies). Shared subjects are reused because the subjects table has a unique subject-name constraint.
- Live database changes were applied and learner identifier columns verified. Curriculum row counts should be checked with an authenticated session; the execute_sql response returned the last statement's column verification only. No learner records were altered.
- Existing academic assessment and class performance modules already support subject marks and provisional class ranking; report currently shows marks totals and percentage. Automatic Uganda division/aggregate rules are not yet implemented because the school's approved grading/aggregate mapping has not been specified. Do not publish guessed divisions.
- Browser testing and deployment remain outstanding. Development branch only.
- Commits: UI LIN/class counts `ce13c0c`, report identity `3e5fa28`; migration `877d591` (repeatability fix follows); tracker update pending.


## 2026-11-04 — Curriculum-aware mark entry and class position
- Assessment subject selector now filters to the saved curriculum group for the selected class: Nursery, P1–P3 or P4–P7. Classes not matching the naming conventions retain the full subject list so the school can still operate while class names are being set up.
- Individual term report now displays total marks, percentage/grade and a position among active learners in the same class who have marks recorded for the selected term. Learners without marks are not ranked.
- This does not yet calculate Uganda PLE aggregate/division; the school's approved grade-to-aggregate/division mapping must be configured before that result is published. Tied percentages currently receive sequential positions, not shared ranks; this should be improved before official ranking use.
- Code commit: `6215517`. Browser testing remains pending; no student fixtures were created.

- Offline service-worker review found an older `service-worker.js` already registered by the app. Removed the second registration to avoid competing service workers; retained the existing same-origin-only, GET-only shell cache. Fix commit: `2a81f8e`.
- Preview deployment check: no deployment exists for the current feature commit. Vercel team plan confirmed Hobby (free). Preview creation was rejected with HTTP 402 `payment_required`, specifically the 24-hour `api-deployments-young-hobby-team-24h` limit (retry after 24 hours). No upgrade, billing, payment method, or paid service was enabled. Production remains untouched.


## 2026-11-04 — Academic reporting and mark-sheet improvements
- Individual report ranking now uses competition ranking for tied percentages (equal scores share a position); the report shows active class size, total marks, percentage and grade.
- Class performance now shows school admission code, subjects scored, total marks and average percentage, with tied learners sharing positions.
- Bulk class mark sheet now displays each learner's LIN and P7 examination index number beside the school admission code.
- Code commits: `7532f24`, `e1aa730`. No live learner marks were available for browser/E2E validation. Aggregate/division remains intentionally uncomputed until the school's approved grade-to-point and division thresholds are configured; no PLE rules have been guessed.

- Follow-up report correction: report preview now explicitly prints active class size and learner position; P4–P7 reports state aggregate/division is awaiting school-approved configuration rather than displaying an invented result. Class performance excludes inactive learners. Fix commit: `024a791`.


## 2026-11-04 — Learner record editing and safe class placement
- Added an administrator-only Edit action to each learner register row.
- Editing loads the existing learner details into the admission form and saves changes to the same learner record; it does not create a duplicate admission.
- The update path does not regenerate or replace the permanent school admission number. Class/stream placement can be corrected through the existing class selector.
- Existing bursary validation is retained; editing bursary details updates the learner record and does not create a second admission-time bursary charge.
- Code commit: 287aaaa. Source change is committed to `feature/cornhill-v3-foundation`; browser/E2E verification remains pending. Production remains untouched.

- Follow-up safety fix: learner profile edits preserve the existing bursary status, approved amount and bursary note. This prevents a profile-only edit from silently changing the financial arrangement. Commit: `793ff8c`.


## 2026-11-04 — Parallel learner, class, teacher and report improvements
- Learner register now offers a read-only profile view for administrators and assigned teachers. The profile displays school code, Ministry LIN, P7 index, identity, admission, class and learner type; guardian contact, home address and bursary details are limited to administrator view.
- Added print-ready individual learner profiles.
- Added class register views with alphabetical learner listing, serial numbers, gender totals, active totals, guardian contacts, and print action. Teachers can open registers only for classes already exposed by their existing class/subject assignments.
- Teacher navigation now exposes read-only learner and class registers alongside academic mark entry. Class creation remains administrator-only.
- Added client-side duplicate checks for Ministry LIN and P7 index before admission, plus a same-name/date-of-birth confirmation. Existing class/stream duplicates are rejected.
- Added print-only output for term report cards. Teacher report preview no longer queries the administrator-only publication table; approval remains administrator-only.
- Learner edit now explicitly saves SMS consent as true/false, so withdrawing consent is respected.
- Existing database RLS remains unchanged. No production schema, production records, or live deployment were modified.
- Commits: `3169a22`, `2c77f1d`, `6540837`. Static/browser end-to-end testing is still pending; these changes are not yet declared production-ready.

- Final learner form polish: added learner status selection (Active / Inactive / Transferred), explicit Cancel edit action, and clear Edit learner heading. Commit: `435c609`.
- Vercel Git preview for this development branch reports `READY` (latest code commit `435c609`; docs-only tracker commit `10de2b7` also has a READY preview). This is a preview only (`target: null`), not a production release. Browser sign-in and role-based end-to-end checks remain outstanding.

- Static markup integrity check: 188 declared element IDs, no duplicate IDs, and no missing literal `$('id')` references in the current HTML. Vercel confirms the code preview deployment is READY.
- Important limitation: duplicate LIN/P7 checks currently run in the registration UI; database-level unique indexes are not yet installed, so a concurrent duplicate submission could still race. A reviewed Supabase migration and admin/teacher browser tests are required before production release. Production database schema and records were not changed during this work.


## 2026-11-04 — Teacher register privacy and database duplicate protection verification
- Restricted guardian names, guardian phone numbers and bursary status/amount in both the learner register and class register to administrator views. Teacher views show restricted placeholders; learner profile already limits guardian, address and bursary details to administrators.
- Queried the connected Supabase catalogue and confirmed existing unique indexes: `students_lin_unique` on `upper(trim(lin))` when LIN is non-empty, and `students_p7_index_number_unique` on `upper(trim(p7_index_number))` when P7 index is non-empty. The permanent admission number also has its existing unique index.
- This confirms database-level duplicate protection already exists; no new migration was necessary. The SQL operation was read-only and no production schema or records were changed.
- Code commits: `d50c111` (guardian contacts), `0089f5d` (bursary privacy). Browser role verification and print testing remain outstanding; production release is not approved by these source changes alone.


## 2026-11-04 — Teacher data minimisation follow-up
- Teacher learner-list requests now select only classroom essentials (identity, admission identifiers, class, learner type, status and previous school). Administrator requests retain the full learner record.
- This reduces accidental transfer of guardian and financial fields into the teacher browser session. It is **not** a substitute for database column-level security: the current students SELECT RLS policy authorises assigned teachers to read matching student rows, and PostgreSQL table-level SELECT may still permit direct API column selection. A separate protected admin-only data access design is needed before describing guardian/bursary fields as inaccessible at API level.
- No database grants, policies, schema, or records were changed. Admin/teacher browser sign-in and printing tests remain pending.


## 2026-11-04 — API-level privacy audit (release blocker)
- Confirmed via PostgreSQL privilege inspection that `authenticated` currently has table-level SELECT on `public.students`, including guardian names/phones, home address, guardian email, bursary details and SMS consent. The current assigned-teacher RLS policy restricts which learner rows teachers can read, but does not restrict columns on those rows. The `anon` role also has table-level SELECT privilege; row-level policy behavior still applies.
- Therefore the UI hiding fields and teacher query projection are defence-in-depth only; they do **not** prove sensitive columns are inaccessible through direct PostgREST/API requests. Do not release to production until a reviewed column-privilege/admin-RPC design is implemented and tested.
- No privileges, RLS policies, schema, or records were changed. Production remains untouched.


## 2026-11-04 — Local appearance preferences
- Added an administrator-only Settings & themes panel to the application navigation.
- Added eight built-in colour themes (Forest, Ocean, Royal, Sunrise, Ruby, Midnight, Slate and Teal) and 24 system-font choices, plus an optional subtle transition effect with reduced-motion support.
- Theme, font and motion preferences are stored locally in the current browser/device. They do not alter school-wide settings or other users' devices; no database schema or external font service is required.
- Added a reset-to-default action and a live preview. Preferences are applied on app load and can be changed from Settings & themes.
- Commit: `423143c`. Browser/device visual testing remains outstanding. No production database changes or production deployment were made.


## 2026-11-04 — Learner privacy hardening (development branch)
- Rechecked the connected Supabase project using read-only catalog queries. The `public.students` table currently has broad table privileges for both `anon` and `authenticated`, including access to guardian contact, address and bursary columns. Existing RLS limits rows but does not hide selected columns from an assigned teacher. This is a production release blocker.
- Added reviewed migration file `supabase/migrations/202611040014_student_data_column_privileges.sql`. It revokes broad table privileges, grants teachers/staff only non-confidential roster columns, keeps insert/update behind the existing authenticated administrator RLS policy, and adds two administrator-checked SECURITY DEFINER read RPCs: `admin_list_students()` and `admin_list_active_finance_students()`.
- Updated the frontend so the administrator learner register and finance learner picker use those RPCs. Teacher roster reads remain direct but select only the safe roster projection. The admission insert response now returns only non-confidential identifiers.
- Git commits: migration `8a17e1a`; app RPC integration `d72da21`; safe admission response `da05a7a`.
- **Not applied to Supabase.** No database grants, policies, functions or records were changed during this work. The migration needs review and then a separately authorized maintenance/test deployment. Test admin and teacher accounts against direct REST column reads, RPC denial for teachers, admission insert/edit, roster, finance, bursary and receipt workflows before production use.
- Existing Supabase security advisor still reports the authenticated-executable `is_school_admin()` SECURITY DEFINER function and disabled leaked-password protection. Review those settings separately; do not disable a required policy helper without replacing its use safely.

- Added `docs/LEARNER_PRIVACY_TEST_PLAN.md` with read-only SQL privilege checks and administrator/teacher staging test cases. Commit `03af53f`.


## 2026-11-04 — Learner privacy migration review correction
- A deeper read-only check of `information_schema.column_privileges` showed that both `anon` and `authenticated` also held explicit column-level SELECT/INSERT/UPDATE/REFERENCES grants on learner fields. PostgreSQL table-level REVOKE does not remove independent column-level grants.
- Corrected migration `202611040014_student_data_column_privileges.sql` to explicitly revoke all column-level privileges on every current `students` column from PUBLIC, anon and authenticated before granting the safe roster projection and administrator-only write columns.
- Expanded `docs/LEARNER_PRIVACY_TEST_PLAN.md` to verify anonymous guardian-phone access and authenticated guardian phone/email, address and bursary-field SELECT privileges are all false after applying the migration.
- Commits: migration correction `01a809f`; test-plan correction `30ae312`.
- This correction is still development-branch source only. No Supabase privileges or records were changed; migration must be tested in staging and explicitly approved before application.


## 2026-11-04 — Frontend syntax verification follow-up
- Full inline JavaScript parse check found another literal backslash-n sequence immediately before `loadStaffProfiles()`. It prevented the main application script from parsing, which would stop the application before staff features load.
- Replaced the literal escape sequence with a real line break. Re-ran JavaScript parsing on both inline scripts successfully. Static HTML ID check found no missing literal `$('id')` references; two duplicate-ID matches are dynamic HTML template strings, not duplicate static markup IDs.
- Commit: `57fcf85`. This is a source-level syntax check only; browser sign-in and workflow tests remain pending.


## 2026-11-04 — Daily attendance potential overtime review
- Extended the Uganda-time daily attendance dashboard with a potential extra-time total and per-staff minutes where the final clock-out is later than the assigned schedule end.
- Handles schedules that cross midnight by comparing against the correct next-day schedule end in East Africa Time (UTC+03:00).
- Clearly labels the figure as potential extra time for manual review. It is not approved overtime, does not include an approval workflow, and is not used for payroll.
- Both inline application scripts pass JavaScript syntax parsing after this change. Static element-reference check reports no missing literal element IDs.
- Commits: calculation/UI `91fa713`; explanatory wording `014efe3`. Browser verification with real event data remains pending; current attendance event table has no real event records, so no numeric example could be validated.


## 2026-11-04 — Staff attendance privacy and import validation
- Restricted the staff self-service attendance history query to the currently signed-in staff user's own `staff_user_id`, in addition to the database access controls.
- Hardened the attendance CSV timestamp parser: accepts explicit ISO timestamps with timezone offsets and unzoned local Uganda date-times, converts unzoned values from EAT (UTC+03:00), and rejects invalid dates/times and ambiguous non-ISO formats instead of relying on browser-dependent date parsing.
- Verification: both inline JavaScript blocks parse; test samples confirm an unzoned 08:15 EAT timestamp maps to 05:15 UTC, a +03:00 ISO timestamp maps to the same instant, a Z timestamp is preserved, and an impossible February 30 date is rejected.
- Commits: self-service filter `a1a9730`; strict timestamp validation `b1444ba`.
- This is source-level verification only. No Supabase schema, permissions or records were changed, and real device export/browser testing remains outstanding.


## 2026-11-04 — Consolidated inventory and school reporting foundation
- Added an Inventory tab for administrators: categories, item catalogue, units, reorder thresholds, receiving and issuing stock, current stock balances, and low-stock flags.
- Added a database migration `202611040015_inventory_stock_ledger.sql` with categories, items, append-only stock movements, a security-invoker stock summary view, administrator-only RLS policies and explicit grants. A database trigger locks the item row and rejects issues that would make stock negative.
- Added a School Reports tab with active learner totals, class count, assessment count, class-by-class learner summary, and CSV export of a privacy-limited learner register (admission code, names, class, gender and LIN; no guardian contacts, address or bursary fields).
- The learner report calls the existing administrator-only `admin_list_students()` RPC; it does not read sensitive learner columns directly from the frontend.
- Both inline JavaScript blocks parse successfully. Static element-reference scan found no missing literal element IDs. Two duplicate-ID matches are template-string fragments, not static markup IDs.
- Commits: inventory schema `9dbc722` plus negative-stock guard `13bc010`; inventory and reporting UI `74e5255`.
- Important: migration and screens are committed to the development branch only. The inventory migration has not been applied to Supabase. Browser workflow, role testing, CSV download, and staging migration tests remain pending. No live data or database permissions were changed.

- Follow-up UI correction `24f566b`: CSV uses an actual UTF-8 BOM for spreadsheet compatibility, and the Inventory/Reports tabs are hidden in read-only demo mode.
- Added `docs/INVENTORY_AND_REPORTS_TEST_PLAN.md` (commit `857e772`) covering admin-only access, receipt/issue ledger arithmetic, negative-stock rejection, append-only movements, CSV privacy and role restrictions.

- Final source verification after the follow-up commits: both inline JavaScript blocks pass parsing; no missing literal element IDs or duplicate static HTML IDs; inventory/report tab wiring, admin guards, learner-report RPC use, UTF-8 CSV BOM, RLS enablement on all three inventory tables, security-invoker stock view, append-only movement grants and negative-stock trigger are present.


## 2026-11-04 — Consolidated finance and academic report exports
- Added UTF-8 CSV export for the selected academic class/term performance table, including competition positions for tied percentages, learner code/name, subjects scored, total/max marks and average percentage.
- Added CSV export for the fee collection report by class, including term/class filter labels, learner counts, charges, allocated posted payments and outstanding balances.
- Added CSV export for the daily cash collection receipt audit, including Uganda-local received time, receipt number, learner code/name, payment method, status and amount in UGX.
- Exports use one CSV encoder with quote escaping and a UTF-8 BOM. Academic export follows the existing assigned-class report filter; finance exports are administrator-only.
- Static verification: both inline JavaScript blocks parse with new Function; 218 static HTML IDs have no duplicates; all literal element references resolve except three intentionally dynamic report/profile buttons that are created in their respective rendered templates.
- Source commit: b32122c. Browser download tests and reconciliation against live records remain outstanding.

## Remaining completion blockers (not represented as finished)
- Supabase currently has no development branches. The connected organization is on the Free plan; provisioning a Supabase branch can incur hourly compute/usage charges and requires a cost quote/confirmation. Therefore no staging database exists in the connected project yet, and migrations 202611040014_student_data_column_privileges.sql and 202611040015_inventory_stock_ledger.sql remain unapplied. Production was not modified.
- Full offline data sync is not enabled. The current service worker caches only the app shell and deliberately excludes API/auth data. A safe offline marks outbox still needs conflict detection, re-authentication, permission re-check and device data-protection decisions; offline finance payments must never be silently queued or receipted.
- Fingerprint attendance has a CSV import path and device-user mapping, but no live terminal integration has been verified. The exact fingerprint device make/model, firmware, export/API protocol and USB driver/bridge are required to build and test a reliable adapter.
- No real browser end-to-end run has been performed. Static parsing is not browser testing; the latest preview/deployment must be checked and tested with administrator, teacher and staff accounts before release.


- Latest preview deployment for application commit b32122c is READY at https://cornhill-school-e1zdpd4vp-cypher-projects1.vercel.app (preview target, not production). The Vercel deployment record confirms the commit and READY state. This is not a completed browser end-to-end test; direct HTTP access from this runtime was unavailable, and sign-in/role workflows have not been exercised.
- Pure logic checks for the new CSV escaping and competition ranking passed. These do not replace a browser download test.


## 2026-11-04 — Live database migration repair and verification
- Corrected learner privacy migration SQL: PostgreSQL column-level revoke syntax is now `REVOKE ALL (columns) ON TABLE ...`, rather than the invalid ordering previously committed.
- Corrected inventory migration trigger function dollar quoting from a single `$` delimiter to valid `$$` delimiters.
- Tested each corrected migration in an explicit transaction followed by ROLLBACK against the live database. Both transactional dry-runs completed successfully and left no persistent changes.
- With the owner's conditional approval, applied migrations `202611040014_student_data_column_privileges` and `202611040015_inventory_stock_ledger` to the live Supabase project. Supabase migration history records both.
- Post-apply checks: no table-level SELECT/INSERT/UPDATE grants remain on `public.students` for anon/authenticated; authenticated users have only the 16-column safe roster SELECT projection; no sensitive guardian/address/bursary/SMS-consent column has SELECT permission; administrator-only RPCs exist and anon cannot execute them.
- Authenticated INSERT/UPDATE grants remain on sensitive admission columns by design, but the existing `Admins manage students` RLS write policy limits those operations to school administrators.
- Inventory verification: all three tables exist with RLS enabled and administrator-only policies; the stock summary view uses `security_invoker=true`; authenticated users cannot UPDATE/DELETE/TRUNCATE stock movements; the negative-stock trigger is enabled.
- The student table still has 0 rows at verification time. These migrations changed database permissions and added inventory schema/functions/triggers; they did not update or delete learner records.
- Supabase security advisor now flags the two administrator RPCs as SECURITY DEFINER functions, alongside the pre-existing `is_school_admin()` helper. This is intentional because the RPCs must return protected columns to administrators while denying teachers; each RPC checks `auth.uid()` and `is_school_admin()`, uses an empty search_path, and is not executable by anon. Keep these functions guarded; do not remove SECURITY DEFINER without replacing the admin-only data path.
- Leaked-password protection remains disabled in Supabase Auth and is a separate account-security setting; it was not changed as part of these schema migrations.
- Browser end-to-end testing with the actual owner/admin and teacher accounts is still outstanding. Static/database checks do not establish that all frontend flows work in a real browser.

- Additional RPC verification: simulated the existing Admin profile's JWT claim and confirmed both administrator learner-list RPCs execute successfully (0 rows returned because no learners have been admitted yet). Simulated an identity with no Admin profile and confirmed `admin_list_students()` rejects it with SQLSTATE 42501. No test identity or school record was created.
- Latest Vercel Git preview for the corrected branch is READY at https://cornhill-school-ldpmnuu95-cypher-projects1.vercel.app (commit `64c1644`, preview target). The deployment record confirms the commit and READY state. Automated browser sign-in testing remains unavailable from this runtime; owner/admin and teacher flows still need a real browser check.

## 2026-11-04 — Staff profile privilege hardening
- A follow-up permission audit found `public.user_profiles` had unnecessary table-level grants to anon and authenticated roles. RLS already had policies limiting reads to the signed-in user's own profile or administrators, and updates to administrators only.
- Added and applied `202611040016_user_profile_privilege_hardening.sql`: removed all table grants from PUBLIC/anon/authenticated, then granted authenticated only SELECT and UPDATE. RLS policies remain unchanged.
- Verified anon has no table privileges; authenticated has only SELECT and UPDATE. Profile creation on signup remains handled by the existing SECURITY DEFINER `handle_new_user()` trigger, which inserts new accounts as `Staff`; the trigger remains intact.
- The live database currently has one profile with role `Admin`. Staff cannot self-promote: profile updates are governed by the administrator-only RLS policy, and signup assigns `Staff` by default.
- The migration was first tested in a transaction and rolled back, then applied. No user profile records were modified.

- Role-boundary check: ran a transaction as PostgreSQL role `authenticated` with a non-admin JWT subject. An attempted update of the existing Admin profile returned no rows (RLS denied it), and a call to `admin_list_students()` was rejected with SQLSTATE 42501. The transaction was rolled back; no profile data changed.

## 2026-11-04 — Daily Collections & Records and duplicate receipts
- Added and applied migrations `202611040017_daily_collection_register_and_receipt_copies` and `202611040018_payment_payer_details`.
- Added `school_payments.collection_item` and `payer_name` so every new receipt can identify the purpose (fees, sweater, sportswear, graduation, examination, or a custom item) and the person who brought the money.
- Added `daily_collection_records` with RLS enabled and administrator-only policy. The saved record stores a date-based record number, posted/reversed totals, totals grouped by payment item, and a JSON snapshot of each receipt with learner name/code/class, receipt number, item, method, status, timestamp and receiver name.
- Added a database trigger that refreshes the corresponding Africa/Kampala daily record whenever a payment is inserted or its status, received time, amount or collection item changes. Reversals remain in the audit record and are separately totalled; only Posted payments count as collections.
- Added an administrator screen for opening a date's saved record, searching within that day's entries by learner name, admission code, receipt, class, item or method, viewing totals by item, and printing the complete daily register on A4.
- Payment entry now requires a payment reason/item and optionally captures the payer's name. For custom reasons the bursar can select “Other / specify” and enter the exact item.
- New receipts and receipt reprints now render two consecutive copies (payer copy and school-retained copy), with receiver name, receiver signature line, payer name and payer signature line. Both copies share the same receipt number and payment details.
- Database migration dry-runs completed inside transactions followed by ROLLBACK before application. Verified RLS enabled, administrator-only policy, authenticated execute permission on refresh RPC, anon denied, and trigger enabled. A simulated Admin call succeeded; a non-admin call was rejected with SQLSTATE 42501.
- Frontend inline JavaScript syntax checks passed; static markup has no duplicate IDs. No live payment was posted for testing because the school currently has no learner records. Actual payment-trigger and thermal-printer behavior still require an enrolled test learner and a physical printer.
- Security advisor still reports the pre-existing/intentional SECURITY DEFINER administrator learner RPCs and the existing disabled leaked-password protection. The new daily-record functions are SECURITY INVOKER and add no new SECURITY DEFINER warnings.

- Frontend commit `d303fcc` validates the payment reason before posting (so an empty custom reason cannot create a payment) and saves the selected item plus payer name to the posted receipt. JavaScript syntax and static duplicate-ID checks passed after the change.
- Deployment note: Vercel rejected a fresh preview build with HTTP 402 because the free Hobby team's 24-hour deployment API quota is exhausted. I did not retry or upgrade the plan. The existing READY preview still points to the earlier `64c1644` commit and therefore does not yet contain this new feature; the latest code is saved in the GitHub development branch. Wait for the free quota window to reset before deploying again.
