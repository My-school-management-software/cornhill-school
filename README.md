# CORNHILL NURSERY AND PRIMARY SCHOOL Management System

Mobile-friendly school management system for CORNHILL NURSERY AND PRIMARY SCHOOL, Uganda. Currency: UGX.

## Current development scope

The active development branch includes these application areas:
- Staff sign-in, administrator/staff roles and access-controlled modules.
- Learner admission, learner search, class and stream management, LIN and admission identifiers.
- Learner status history, class promotion history and private learner photo storage.
- Academic subject structures, mark entry, P4–P7 absence handling, UNEB-style grade/aggregate calculations and report-card workflows.
- Finance fee schedules, learner charges, bursary-related learner charges, payment allocation, receipts, statements and fee reports.
- Atomic payment posting and administrator-audited receipt reversal.
- Daily collection reporting, expenses, inventory, staff attendance/import workflows, staff communication and settings/themes.

## Work area 6 — secure phone evidence capture

The branch includes the shared CORNHILL Evidence Capture portal at `/evidence.html`, linked from the school navigation and installable on an authorised phone. An administrator can pair a device to a specific active staff account, revoke it, select it for a ten-minute request, and review multiple uploaded photos or PDFs. Files are stored in a private Storage bucket and administrators receive short-lived signed links. See [Phone Evidence Capture](docs/PHONE_EVIDENCE_CAPTURE.md) and the [Evidence Capture Test Plan](docs/EVIDENCE_CAPTURE_TEST_PLAN.md).

**Completion boundary:** the database tables, row-level security, private bucket and policy hardening are applied and schema-checked. The portal still requires authenticated manual tests on designated accounts and Android devices. Realtime and browser notifications work while the page is open and connected; reliable background push after the browser is closed is not implemented. Real uploads, account isolation and ten-minute expiry still need end-to-end acceptance testing.

## Work area 7 — Banking & Daily Deposits

A dedicated `/banking.html` workspace is linked from the main school navigation. It includes administrator registration of school bank accounts (only the last four account digits are stored), daily deposits entered by an authorised bursary operator, withdrawal requests, phone evidence selection, bank transaction history and a verified bank-balance view. Deposits remain pending until their slip evidence is separately reviewed and approved. Withdrawals require administrator approval before evidence is requested; verified withdrawals alone reduce the displayed balance. The banking tables, role helper, transaction RPCs, approval/rejection functions, evidence-review trigger and database policies are present in the connected Supabase project.

**Completion boundary:** the banking screen and connected database workflow are implemented on this branch, but no school bank accounts, transactions or capture devices have been registered in the new banking/evidence registers. Do not enter live bank transactions until the school has configured an account, authorised the Deputy Bursar's phone and completed controlled acceptance tests. Evidence review is linked to a bank transaction; requesting a clearer bank slip reissues evidence through the bank audit workflow. See [Banking & Daily Deposits](docs/BANKING_DAILY_DEPOSITS.md).


## Work area 5 — staff fingerprint attendance

The attendance workspace is prepared for a single office fingerprint terminal and approximately 30 staff. It includes staff/device ID mapping, work schedules, CSV preview/import, attendance review and administrator guidance. The Settings module contains a five-model shortlist and connection instructions. See [Fingerprint Attendance Integration](docs/FINGERPRINT_ATTENDANCE_INTEGRATION.md) before purchasing a terminal.

**Completion boundary:** ready for device connection; not physically hardware-tested. USB-host export is treated as USB flash-drive export, not assumed to be direct PC USB communication. Direct network/ADMS/SDK integration requires the exact purchased model, firmware and a demonstrated vendor protocol. Automatic salary deductions remain OFF by default.
- Installable web app shell with offline shell caching and a clear offline status warning.

This is active development, not a declaration of production readiness. Authenticated end-to-end acceptance tests, hardware tests and final operational sign-off are still required.

## Work area 8 — public website, admissions and School Services Hub

The branch now contains three coordinated application entry points:

- `/school.html` — public school information and navigation to the separate guardian portal and admission enquiry page. School contact details, fees and dates are intentionally not invented.
- `/admissions.html` — basic public admission enquiry form. It submits learner name, class of interest, guardian contact and an optional question. It does not create a pupil record, issue a permanent code, accept payment, or collect identity/medical documents.
- `/school-services.html` — isolated staff sign-in using a per-tab Supabase Auth storage key. It brings together administrator-reviewed admission enquiries, staff leave requests, own-payslip viewing, class-scoped learning resources, library catalogue/loans, restricted transport and welfare workspaces, provider setup, basic system checks and biometric-kiosk guidance.

The database foundation is additive and uses RLS on the new tables. Teacher learning-resource access uses the existing class-teacher guard. Welfare access is restricted to administrators and the approved Matron / Senior Woman / Senior Man / School Nurse titles. Transport is restricted to administrators and approved transport job titles. The public admissions table accepts anonymous INSERT only for pending enquiries; anonymous SELECT is not granted.

**Payroll integration:** the new portal reuses the existing `payroll_periods`, `payroll_items`, salary agreements and advance workflow. Staff can read only their own payroll items; administrators retain payroll creation, approval and payment controls in the main Finance workspace. The temporary duplicate payroll table was removed while empty.

**Integration boundary:** MTN / Airtel Mobile Money, SMS and Google Drive entries are setup registers only. No provider credentials are stored in browser code and no live transactions or messages are claimed. The fingerprint kiosk is guidance only until the exact device and supported integration protocol are confirmed. Public admissions currently has client-side honeypot/cooldown checks only; add server-side abuse protection before advertising the public form widely. The welfare module is a restricted factual follow-up register, not a medical-record or diagnosis system.

**Acceptance boundary:** code and simulated database-role tests do not replace real browser sign-in, guardian isolation, mobile device checks, payment provider certification, or live hardware testing.


## Work area 9 — P.5, P.6 and P.7 workbook grading analysis

The upper-primary class-mark workspace reproduces all three analysis sections shown below the marks in the original P.5, P.6 and P.7 Excel workbooks:

- **B.O.T:** P.5 Beginning Assessment; P.6 and P.7 Set I.
- **M.O.T:** P.5 Midterm Assessment; P.6 and P.7 Set II.
- **E.O.T:** P.5 End of Term Assessment; P.6 and P.7 Set III.
- Each section reports Division I, II, III, IV, U and X counts (plus separate incomplete-mark counts), average performance in English / Mathematics / Science / Social Studies, the strongest and weakest subject averages, performance by boys and girls, and the number of learners whose division was adjusted by the English/Mathematics gateway rule.
- P.7's additional Set IV remains in the marks table; the workbook contains only three grading-analysis sections.

The class workbook grade boundaries are D1 89–100, D2 79–88, C3 74–78, C4 69–73, C5 59–68, C6 49–58, P7 44–48, P8 39–43 and F9 0–38. The four grade points are added for the aggregate. The current PLE aggregate bands used by the software are I 4–12, II 13–23, III 24–29, IV 30–34 and U 35–36.

## Work area 10 — P.4–P.7 English and Mathematics gateway grading

The shared P4–P7 grading helper is used by the teacher marks grid, report-card summary and P.5–P.7 class analyses:

- A P7 or P8 in English or Mathematics caps the result at Division II. It cannot remain Division I, even when the raw aggregate is 12 or better.
- An F9 in either English or Mathematics caps the result at Division III. The aggregate may still place the learner in Division IV or U when that is the lower result.
- If the aggregate already produces a lower division, the gateway rule does not upgrade the learner.
- A printable report card shows the reason whenever a gateway adjustment changes the division. The marks-grid division cell also exposes the explanation.

These English/Mathematics caps are implemented as the CORNHILL grading rule requested by the school. Public descriptions of PLE grading also describe Division I as requiring credit or better across all four subjects, and Division II as requiring passes across the subjects; therefore this software adjustment should be treated as the school's stated internal gateway policy, not as a substitute for checking the latest UNEB instructions for official PLE certification. See [Uganda Radio Network's explanation of PLE divisions](https://www.ugandaradionetwork.net/story/the-face-of-disappointing-ple-results).

The four core subject grade-band rows in Supabase have been aligned to the source Excel formulas for English, Mathematics, Science and Social Studies. Active 2026 Term 3 assessment columns are present for P.4 (12), P.5 (12), P.6 (12) and P.7 (16, including P.7 Set IV). These are blank assessment columns ready for teachers; no learner marks were fabricated or imported.

**Acceptance evidence:** 13/13 synthetic division-helper cases passed, including aggregate 10 with English/Mathematics P7/P8, aggregate 12 with a gateway F9, both English and Mathematics F9, absence handling, class subject aliases, and the current aggregate boundaries. The three analysis panels for each of P.5, P.6 and P.7 passed synthetic rendering checks. Real teacher sign-in and live browser acceptance with actual marks remain pending.

## Work area 11 — School Services and communications applications

The active App Centre now has 18 valid destinations. The combined School Services Hub includes the following separate permission-controlled workspaces:

- **Visitor & Gate Register:** reception/security staff can check visitors in and out. Visitor identity, purpose and pass-code fields are not editable during check-out; authenticated updates are limited to status and check-out audit fields.
- **School Assets & Maintenance:** active staff can submit a maintenance report and read their own reports. Administrators and approved operations/store/property/maintenance/ICT operators can view the asset register and manage work. Asset managers can update location, condition, status and notes, but not asset codes or purchase costs.
- **Staff Communications & Events:** a separate staff-only app for administrator-authored notices and school calendar events. Teachers and staff see only published entries addressed to their own role. Inactive profiles are excluded by the database policies as well as the sign-in screen.
- **Existing Guardian Portal:** remains separate from staff communications and administration. Guardian PIN verification, learner-scoped portal sessions and private parent-to-school text/voice messages remain in the dedicated Parent Portal. Parent portal messages and staff notices use different tables and access paths.

The service worker is at shell cache v56. Public website, admissions, School Services, Staff Communications, Banking, Evidence and Guardian routes use separate cache keys. Only the main school system writes to the root application cache; opening a separate portal no longer replaces the cached main dashboard. The service worker caches the application shells only. It does not make server-backed records, sign-in, submissions or payments available offline.

**Role checks:** 12 synthetic database tests passed for teacher/admin separation across visitor, asset, maintenance and staff communications records. Further synthetic role tests passed for Store Managers (asset read/update permissions and protected asset identifiers) and Security Guard (visitor read/check-out permissions and protected visitor identity). All test rows and temporary profile title changes were rolled back. No reception, security or store-manager staff accounts currently exist in the active live profile list; their first real sign-in must be tested after the administrator creates those profiles.

**Page checks:** JavaScript syntax and static DOM-ID checks passed for School Services and Staff Communications, and all 18 App Centre file/anchor destinations resolve. Actual browser sign-in and device testing remain required.

## Current preview

The active development branch is `fix/assessment-selection-save-preview-20261108`. The latest preview available during this work was built from an earlier service-portal commit and does not include the final admissions page, public website, payroll policy changes or latest front-end fixes. Vercel's Free daily deployment API quota returned a payment-required limit, so no new preview was confirmed for the latest commit. Do not use an older preview to accept these new pages. The production main branch has not been changed by this development branch.

## Offline limitation — important

Offline support currently caches the application shell only. The live Supabase database, authentication, photos/storage, payments and other server operations require internet access. The app does not yet provide a durable IndexedDB record queue, conflict resolution or automatic data synchronisation. Do not enter school records or accept payments while offline.

## Data protection and safe updates

- The live school database is separate from the web application files. Publishing a new frontend build must never recreate, truncate, seed, or replace the live database.
- Database changes must be reviewed, version-controlled migrations. Apply compatible additive changes first; preserve existing learner, finance, academic, staff, attendance, and audit records.
- Before every production migration, take and verify a fresh backup, test the migration against a non-production copy, and define a rollback/recovery plan. Do not use destructive reset commands against production.
- Keep the production application URL stable so installed home-screen apps continue opening the same address after approved releases.
- The current encrypted Google Drive export is an application-level snapshot, not a complete disaster-recovery image. It omits private communication content, Supabase Storage objects, Auth users/passwords, database schema, and platform configuration. Its restore process is not yet implemented or proven.
- The scheduled cloud export currently runs daily at 5:00 AM Uganda time. A successful upload is not proof of restore readiness; an administrator must validate the encrypted file and the school must complete an isolated restore exercise before relying on it for recovery.
- Offline support currently caches the application shell only. Server-backed records and transactions require internet access; do not record real payments offline.

## One-time Supabase setup and security

1. Create the first administrator through Supabase Authentication.
2. Assign the administrator role through the reviewed school-admin provisioning process.
3. Create staff accounts and assign only the roles/classes they need.
4. Keep Row Level Security enabled.
5. Never place a Supabase service-role/secret key in browser code or share it in chat.
6. Enable leaked-password protection in Supabase Auth password security settings before production use.
7. Review all Supabase security advisor findings before school-wide launch.

## School launch acceptance

Before daily use, complete the authenticated test checklist in [docs/ACCEPTANCE_TESTS.md](docs/ACCEPTANCE_TESTS.md). Test using designated test accounts and sample learners, never real payments or live learner records unless the school has approved the test.

## Repository workflow

Work is on fix/assessment-selection-save-preview-20261108. Review the branch and acceptance evidence before creating/merging a pull request into main. A successful Vercel preview build does not by itself prove that database permissions, school workflows, printers, biometrics or offline synchronisation work.
