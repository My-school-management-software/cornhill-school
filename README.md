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

The branch now includes a first implementation of the shared CORNHILL Evidence Capture portal at `/evidence.html`. It supports administrator-issued one-time phone pairing, ten-minute evidence requests, phone camera/file uploads, private evidence storage and administrator review records. See [Evidence Capture Test Plan](docs/EVIDENCE_CAPTURE_TEST_PLAN.md).

**Completion boundary:** the additive database migration has been applied and its tables, RLS, private bucket and policies have been verified. The portal still requires authenticated manual tests on designated staff accounts and Android devices. Browser notifications work while the portal is open and connected; background push delivery is not yet implemented. Evidence requests currently store a context label and optional amount; direct attachment to the saved Banking, Expenses, Staff ID and other module records is the next integration phase. The latest branch changes have not yet been deployed to a new Vercel preview.

## Work area 5 — staff fingerprint attendance

The attendance workspace is prepared for a single office fingerprint terminal and approximately 30 staff. It includes staff/device ID mapping, work schedules, CSV preview/import, attendance review and administrator guidance. The Settings module contains a five-model shortlist and connection instructions. See [Fingerprint Attendance Integration](docs/FINGERPRINT_ATTENDANCE_INTEGRATION.md) before purchasing a terminal.

**Completion boundary:** ready for device connection; not physically hardware-tested. USB-host export is treated as USB flash-drive export, not assumed to be direct PC USB communication. Direct network/ADMS/SDK integration requires the exact purchased model, firmware and a demonstrated vendor protocol. Automatic salary deductions remain OFF by default.
- Installable web app shell with offline shell caching and a clear offline status warning.

This is active development, not a declaration of production readiness. Authenticated end-to-end acceptance tests, hardware tests and final operational sign-off are still required.

## Current preview

The feature/cornhill-v3-foundation branch has a Vercel preview deployment. Use the latest preview link supplied in the project delivery notes; preview deployments may change after each commit. The production main branch has not been changed by this development branch.

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

Work is on feature/cornhill-v3-foundation. Review the branch and acceptance evidence before creating/merging a pull request into main. A successful Vercel preview build does not by itself prove that database permissions, school workflows, printers, biometrics or offline synchronisation work.
