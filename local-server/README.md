# CORNHILL Local Server — Migration Development Scaffold

This branch contains the school-controlled local backend foundation for moving CORNHILL away from hosted Vercel/Supabase dependencies. It is separate from the live application and is not yet a replacement school system.

## Included foundations

- Node.js health-only server and status page.
- Separate loopback-only HTTPS authentication server and launcher.
- Argon2id staff/guardian authentication, secure cookies, CSRF validation, session expiry/revocation and rate limiting.
- Explicit role permissions, staff class assignments and guardian-to-learner scope checks. Role grants remain empty by default.
- Ninety-four additive, checksum-verified PostgreSQL migrations (001–094), covering:
  1. Staff/guardian identity and session records.
  2. Permission catalog, role permissions and staff class assignments.
  3. Failed-login rate-limit indexes.
  4. Separate NOLOGIN authentication runtime group/API role with limited column grants.
  5. Local learner/admissions records, permanent pupil codes, LIN and guardian contacts.
  6. Academic years/terms, subject catalogue, class mappings, assessments and learner marks.
  7. UGX fee obligations, bursary rules, payment allocations, immutable receipt snapshots and consent-based SMS outbox.
  8. Staff profiles, employment terms, attendance device imports, attendance summaries, approved corrections and staged payroll.
  9. Attendance policy settings, staff work schedules, dated salary agreements, calendar exceptions, reviewed attendance incidents and Director-approved special sessions.
  10. Local atomic payment posting, payer/collection details, unallocated credit, immutable receipt snapshots and restricted finance runtime permissions.
  11. Permission-gated Bursar learner search and learner fee-account read functions, without direct finance-table grants.
  12. Permission-checked receipt reprints with a mandatory reason, print count and append-only finance audit record.
- Local schema verifiers for authentication, learners, academics, finance, attendance and payroll.
- Windows unit-test CI and Linux/PostgreSQL 17 integration CI.

## Validation status

CI passed on 2026-11-14 through Batch 18: **314 Windows unit tests passed (0 failed)**; PostgreSQL 17 successfully applied migrations 001–012, re-ran them with checksum verification, and passed the local school/academic/finance/staff/attendance/payroll schema checks plus finance integration checks. Batch 18 receipt reprinting passed its PostgreSQL integration and HTTP/UI checks. Latest verified branch commit: `2cee4c499999128a1692a32ac9c21dcbef972e83`.

This is CI validation only. The migrations have **not** been applied to the school's Windows computer, and no real school data has been imported.

## Run only the health-only scaffold

Use Node.js 22 or later. From this folder:

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm start`.
4. Open http://127.0.0.1:4173 on the same computer.
5. Press Ctrl+C to stop.

The status page on port 4173 is not a school-data application. The separate HTTPS Bursar service is not enabled by the installer: authentication/finance runtime roles remain NOLOGIN, and private TLS files must be provisioned outside the repository before it can start. Do not enter real school data into the health-only status page.

## Important safety boundaries

- These migrations are only for a brand-new, isolated local PostgreSQL database. Never run them against the live Supabase project.
- No live Vercel or Supabase resources have been changed.
- No production learner, guardian, staff, finance or payroll records have been copied.
- The authenticated HTTPS runtime composes the auth and finance handlers and can serve the local Bursar page. It remains separate from the health-only HTTP scaffold and the hosted main school application.
- The school workspace launcher is served at `/` and `/app`; the Bursar screen remains available at `/bursar`. It includes staff sign-in, learner search, term-by-term fee balances, optional previous-term allocations, UGX payment entry, idempotent posting, printable receipt preview and permission-gated audited reprinting with a reason. The audit logs a requested reprint action, not a printer-success signal. Its finance HTTP routes remain disabled unless a separate finance database runtime credential is privately provisioned; the example `.env` leaves this setting as a placeholder. Unallocated credit is recorded, but later allocation remains pending. A separate credit-allocation workflow has not yet been implemented.
- Authentication and finance runtime roles remain NOLOGIN by default. No runtime password is provisioned by the installer.
- The server and HTTPS launcher bind to loopback only. Do not change this to 0.0.0.0 or expose the service to the school LAN.
- LAN access, Android access, offline synchronisation, backups, recovery, thermal-printer hardware compatibility and the full school-wide UI remain pending. The Bursar print view is not yet verified on a physical thermal printer.

The live CORNHILL PWA remains on its current hosted backend until a separately approved migration and cutover.


### Batch 19 — retained learner-credit allocation (2026-11-14)

Migration 013 introduces a separate append-only ledger for allocating the unused credit retained on a posted payment. It requires the independent `finance.credit_allocate` permission, an explanatory reason and an idempotency key. Source payment, learner and fee-obligation rows are locked; the source payment must remain Posted; only open obligations belonging to the same learner may receive credit; and available retained credit and fee balances are checked inside the database transaction.

The original payment amount, unallocated amount and immutable receipt snapshot are not changed. The learner fee-balance view now includes both original payment allocations and later credit allocations. The shared posted-payment invariant checks both sources so a subsequent payment cannot overrun a balance already reduced by retained credit. A source payment with consumed credit cannot be reversed until an approved credit-release workflow exists.

The authenticated finance API exposes a separate permission-gated `POST /api/v1/finance/credits/allocate` route. The database finance API role receives function execution only, not direct access to the new ledger tables. Batch 19 CI verification is pending. The migration has not been applied to the school's Windows database.


### Batch 19 verification — 2026-11-14

GitHub Actions run [43587494430](https://github.com/My-school-management-software/cornhill-school/actions/runs/43587494430) passed both jobs:

- Windows unit suite: **318 passed, 0 failed**.
- PostgreSQL 17: migrations 001–013 applied and repeat-run checksum verification passed.
- School/auth/finance schema and least-privilege role checks passed.
- Synthetic finance integration passed: retained credit allocated, same-key retry returned the original batch, changed-payload retry and credit overdraw were rejected, original payment and receipt snapshot remained unchanged, the fee balance reflected the credit, and a subsequent payment that would exceed the remaining fee balance was rejected.

This is disposable CI verification only. Migration 013 has not been applied to the school's Windows database.


### Batch 20 verification — Bursar retained-credit workflow (2026-11-14)

GitHub Actions run [43587983581](https://github.com/My-school-management-software/cornhill-school/actions/runs/43587983581) passed both jobs:

- Windows unit suite: **324 passed, 0 failed**.
- PostgreSQL 17 applied migrations 001–014 and verified repeat-run checksums.
- The retained-credit source lookup was tested with its separate permission.
- The Bursar UI now lists available retained credit by original receipt and provides a reasoned allocation form for outstanding balances.
- Authenticated API, UI asset, permission, source listing and finance integration checks passed.

This is disposable CI verification only. Migration 014 has not been applied to the school's Windows database.


### Batch 21 — local workspace launcher (2026-11-15)

- Added a same-origin /app launcher to the local HTTPS application. It links to the locally served School Office, Academics, Bursar and Leadership workspaces.
- The launcher reads /api/v1/health and /api/v1/readiness rather than assuming that a module or the full application is ready. Finance navigation remains disabled unless the local HTTPS health response confirms that its protected finance API runtime is enabled.
- The launcher identifies the remaining full-application, API-parity, hosted-dependency, offline-sync and multi-device acceptance blockers. It does not proxy or publish the hosted PWA pages, Supabase client, credentials or external service URLs.
- Added navigation back to the launcher from each local workspace and automated source-level tests for the new asset routes, local-only status requests, conditional finance navigation, pending-release warnings and responsive layout.
- This batch is a local navigation and integration-observability improvement. It does NOT complete full frontend migration, remaining API parity, hosted-service replacement, offline synchronisation, LAN access or Android acceptance. The readiness gate must remain blocked.


### Batch 22 — safe desktop service refresh (2026-11-15)

- The Windows desktop updater now checks port 4174 before launching. When an existing listener is found, it stops only the Node process whose command and PowerShell/npm parent path positively match this CORNHILL local server.
- The updater sends a graceful SIGINT and confirms that port 4174 has been released before starting the updated service. Unknown listeners, multiple owners, mismatched launchers and timeout conditions fail closed; the updater never kills an unidentified process or starts a duplicate server.
- The `-Launch` option now opens the local workspace launcher at https://localhost:4174/app after the updated service starts.
- Added updater regression tests for listener identity, parent-path verification, graceful stop ordering, unknown-process safety and the launcher destination.


### Batch 23 — local Staff Operations API and workspace (2026-11-15)

- Added a permission-scoped Staff Operations workspace at `/staff-operations`, linked from the local launcher and Leadership page.
- Connected the local attendance read models for recent attendance days, monthly summaries and the independent attendance-day review trail.
- Added personal leave request history and balances, a leadership leave-review queue, Director-controlled staff-wide leave balance visibility, and read-only payroll period/run/disbursement summaries and staff payroll lines.
- Staff with the explicit `staff.leave_manage` permission can submit a leave request. The database transaction creates a Draft and submits it in one transaction; the database transition guard supplies the official submission timestamp. The signed-in staff identity is taken from the authenticated session, not from request input.
- Leave approval and ledger usage remain separate and are not presented as implemented actions. The page does not initiate bank or mobile-money transfers, does not write attendance results, and does not store fingerprint templates.
- Added migration 081 with narrow read-column grants and the minimum INSERT/status-only UPDATE rights for a leave request. No role permission grants are assigned automatically; the Director must review and assign role permissions.
- Added automated tests for migration privilege boundaries, SQL query scoping, transaction commit/rollback, permission checks, request validation, runtime composition, static routes and UI output escaping.
- Migration 081 has not yet been applied to the school's Windows PostgreSQL database. The attendance device import workflow, live fingerprint integration, leave approvals/balance posting, payroll preparation/review/approval/posting and full offline/multi-device acceptance remain separate work.


### Batch 24 — attendance device registry and audited CSV import (2026-11-15)

- Added the local Attendance Devices & Imports workspace at `/attendance-import`, linked from Staff Operations.
- Authorised staff with the explicit `staff.attendance_import` permission can register USB/LAN/manual-import terminals, activate or retire devices, map terminal staff identifiers to school staff with effective dates, import exported CSV attendance events, review batch history and inspect rejected rows.
- CSV imports accept up to 2 MB and 5,000 rows. The uploader maps the terminal's staff-ID and event-time columns; optional event-type and terminal-event-ID columns are supported. Naive local timestamps are interpreted as Uganda time (UTC+03:00); explicit ISO-8601 timezone timestamps are validated.
- The import repository records a SHA-256 checksum for the source file, hashes rejected source rows, prevents duplicate source/event identifiers, and keeps rejection evidence append-only. Accepted events remain Pending review and do not automatically create attendance-day decisions, salary calculations or payroll deductions.
- The migration adds an append-only rejected-row evidence table and final batch/rejection-count reconciliation guards. No role receives the import permission automatically; the Director must explicitly delegate it.
- USB in this batch means importing a CSV exported from a USB-connected terminal. It is not a live USB driver, fingerprint reader integration or biometric-template storage. The exact terminal model and export format must be selected and validated before device-specific integration.
- Automated coverage includes CSV parsing and timezone validation, row-level rejection, route permissions, guardian isolation, HTTPS/CSRF/origin enforcement, runtime wiring, static assets, and Windows/Linux Node test runs plus PostgreSQL migration/schema verification.
- This batch does not complete direct fingerprint capture, attendance-day reconciliation, payroll effects, Android/LAN access, offline synchronisation or the overall application readiness gate.


### Batch 25 — verify Director-controlled attendance import access (2026-11-15)

- Confirmed `staff.attendance_import` is already seeded as a high-risk staff permission by migration 008; no extra database migration is required.
- Added an explicit verifier check for the permission code, `staff` category and high-risk flag while retaining the existing 50-permission catalogue count.
- Confirmed no role receives the permission automatically. The Director can explicitly assign it to selected staff roles through Leadership → role permissions.
- Updated the single-run Windows desktop updater to report Attendance Devices & Imports as part of the installation release and explain that staff access requires Director delegation.
- The attendance workspace can be enabled by an explicit role grant after the existing update is installed. This does not change attendance records or biometric data.


### Batch 26 — independent staff leave decisions (2026-11-15)

- Added a separate HTTPS endpoint for approving or rejecting a submitted staff leave request.
- The reviewer identity is taken from the authenticated staff session. The database transition guard rejects self-review, assigns the official timestamp, and protects submitted request details from rewriting.
- Added `staff.leave_review` checks and an additive column-level permission migration (086). Rejection requires a meaningful reason.
- Leadership's leave queue now offers independent approve/reject actions. Approving a request does not automatically consume leave balance or create a salary deduction.
- CI run [43703760165](https://github.com/My-school-management-software/cornhill-school/actions/runs/43703760165) passed Windows and PostgreSQL 17 checks: 749 tests, 748 passed, 0 failed, 1 skipped; migrations 001–086 were applied and checksum repeatability verified in the disposable CI database.

### Batch 27 — attendance review and payroll payment evidence (2026-11-15)

- Staff Operations now supports append-only attendance-day review records (Verified / Correction Required) with required notes. The source attendance-day identity is loaded by the database, the reviewer comes from the active session, and staff cannot review their own attendance.
- Added payroll payment evidence entry for an already-completed cash, bank or mobile-money payment against a posted payroll line. The database prevents overpayment beyond net pay and requires a separate active verifier who is neither the recorder nor the beneficiary.
- Pending payroll evidence can be independently verified or rejected with a reason. Final evidence is immutable. This is a record-keeping workflow only; no bank or mobile-money transfer is initiated.
- Added migration 087 with narrow INSERT/UPDATE column grants and fixed-search-path SECURITY DEFINER helpers for source-row locks. The runtime role does not receive UPDATE privileges on attendance days, payroll runs or payroll lines.
- No staff role receives attendance-review or payroll-disbursement permissions automatically. The Director must explicitly delegate the relevant high-risk permissions.
- CI run [43704640654](https://github.com/My-school-management-software/cornhill-school/actions/runs/43704640654) passed both jobs: **755 Windows tests, 754 passed, 0 failed, 1 skipped**; PostgreSQL 17 applied migrations 001–087, verified checksum repeatability, and passed authentication, schema, runtime privilege and finance verifiers.

These are CI validations against disposable synthetic data. The new migrations and screens are not installed on the school's Windows database until the approved desktop updater is run. Full-school readiness remains blocked by the separate launcher release conditions.
