# CORNHILL Local Server — Migration Development Scaffold

This branch contains the school-controlled local backend foundation for moving CORNHILL away from hosted Vercel/Supabase dependencies. It is separate from the live application and is not yet a replacement school system.

## Included foundations

- Node.js health-only server and status page.
- Separate loopback-only HTTPS authentication server and launcher.
- Argon2id staff/guardian authentication, secure cookies, CSRF validation, session expiry/revocation and rate limiting.
- Explicit role permissions, staff class assignments and guardian-to-learner scope checks. Role grants remain empty by default.
- Twelve additive PostgreSQL migrations:
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
- The Bursar screen is served at `/` or `/bursar` by the separate HTTPS service. It includes staff sign-in, learner search, term-by-term fee balances, optional previous-term allocations, UGX payment entry, idempotent posting, printable receipt preview and permission-gated audited reprinting with a reason. The audit logs a requested reprint action, not a printer-success signal. Its finance HTTP routes remain disabled unless a separate finance database runtime credential is privately provisioned; the example `.env` leaves this setting as a placeholder. Unallocated credit is recorded, but later allocation remains pending. A separate credit-allocation workflow has not yet been implemented.
- Authentication and finance runtime roles remain NOLOGIN by default. No runtime password is provisioned by the installer.
- The server and HTTPS launcher bind to loopback only. Do not change this to 0.0.0.0 or expose the service to the school LAN.
- LAN access, Android access, offline synchronisation, backups, recovery, thermal-printer hardware compatibility and the full school-wide UI remain pending. The Bursar print view is not yet verified on a physical thermal printer.

The live CORNHILL PWA remains on its current hosted backend until a separately approved migration and cutover.
