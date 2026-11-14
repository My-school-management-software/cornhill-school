# CORNHILL Local Server — Migration Development Scaffold

This branch contains the school-controlled local backend foundation for moving CORNHILL away from hosted Vercel/Supabase dependencies. It is separate from the live application and is not yet a replacement school system.

## Included foundations

- Node.js health-only server and status page.
- Separate loopback-only HTTPS authentication server and launcher.
- Argon2id staff/guardian authentication, secure cookies, CSRF validation, session expiry/revocation and rate limiting.
- Explicit role permissions, staff class assignments and guardian-to-learner scope checks. Role grants remain empty by default.
- Eight additive PostgreSQL migrations:
  1. Staff/guardian identity and session records.
  2. Permission catalog, role permissions and staff class assignments.
  3. Failed-login rate-limit indexes.
  4. Separate NOLOGIN authentication runtime group/API role with limited column grants.
  5. Local learner/admissions records, permanent pupil codes, LIN and guardian contacts.
  6. Academic years/terms, subject catalogue, class mappings, assessments and learner marks.
  7. UGX fee obligations, bursary rules, payment allocations, immutable receipt snapshots and consent-based SMS outbox.
  8. Staff profiles, employment terms, attendance device imports, attendance summaries, approved corrections and staged payroll.
- Local schema verifiers for authentication, learners, academics, finance, attendance and payroll.
- Windows unit-test CI and Linux/PostgreSQL 17 integration CI.

## Validation status

GitHub Actions has successfully:
- Run the Node test suite on Windows.
- Applied all eight migrations to a disposable PostgreSQL 17 test database.
- Re-applied all migrations and verified their stored checksums.
- Verified schema, role catalogues, zero automatic role grants and PUBLIC isolation.
- Exercised sample learner, admission, academic, finance, attendance and payroll constraints using synthetic records rolled back after testing.

This is CI validation only. The migrations have **not** been applied to the school's Windows computer, and no real school data has been imported.

## Run only the health-only scaffold

Use Node.js 22 or later. From this folder:

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm start`.
4. Open http://127.0.0.1:4173 on the same computer.
5. Press Ctrl+C to stop.

The status page is not a school-data application. Do not enter real learner, staff, guardian, finance or payroll information. Do not run `npm run start:auth`: the runtime database login is deliberately NOLOGIN and the local certificate/private configuration has not been provisioned.

## Important safety boundaries

- These migrations are only for a brand-new, isolated local PostgreSQL database. Never run them against the live Supabase project.
- No live Vercel or Supabase resources have been changed.
- No production learner, guardian, staff, finance or payroll records have been copied.
- The authentication HTTP handler and runtime are foundations; they are not yet wired into the health-only server or the main school application.
- No finance, learner, academic, attendance or payroll API routes are enabled.
- Database runtime roles remain NOLOGIN. No runtime password has been provisioned.
- The server and HTTPS launcher bind to loopback only. Do not change this to 0.0.0.0 or expose the service to the school LAN.
- LAN access, Android access, offline synchronisation, backups and recovery must wait for the remaining API, deployment, security and restore tests.

The live CORNHILL PWA remains on its current hosted backend until a separately approved migration and cutover.
