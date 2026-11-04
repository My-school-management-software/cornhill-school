

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
