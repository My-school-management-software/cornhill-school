# CORNHILL Local Learner and Admissions Foundation — Batch 12

## Scope
This batch adds the first local school-data domain after the isolated authentication and authorization foundations. It is additive and exists only in the migration branch.

## Added
- `cornhill_school` schema, with PUBLIC access revoked.
- Class catalogue seeded with Baby, Middle, Top and P.1–P.7, with section/order constraints.
- Automatic unique pupil codes in `CH-YYYY-NNNNNN` format using an isolated sequence and Kampala local year.
- Database trigger that rejects any later pupil-code change.
- Separate optional LIN field with uniqueness enforcement.
- Learner profile fields for admission date/year, class, gender, date of birth/birth year, Day/Boarding, P.7 index number, status, bursary amount/category/reason, meals, archive metadata and admission completion.
- Guardian contacts with +256 phone validation, communication consent, active/primary status and one-active-primary-guardian constraint.
- Enrolment periods with class history, re-admission linkage and one-active-period constraint.
- Admission event audit and admission enquiry workflow.
- Five additional permission catalogue entries; no permissions are assigned to staff roles.
- PostgreSQL integration verifier and source-level migration tests.
- CI runs local school schema verification after the authentication/runtime-role checks.

## Validation
- The migration runner discovers the new numbered migration and checks it is transactional.
- GitHub Actions is configured to apply all five migrations to a disposable PostgreSQL 17 service, rerun them to check idempotency, and execute the learner schema verifier.
- The Windows job runs the full Node test suite.
- Actual CI outcome for this new migration must be read from the newest workflow run; it is not assumed from local source checks.

## Safety boundaries
- No live Supabase table was altered.
- No learner, guardian, or admission data was copied.
- No production data was read for this implementation; earlier schema inventory was used only to map fields and constraints.
- No app routes or LAN listeners were enabled.
- No database runtime grants were issued for `cornhill_school`.
- Existing Vercel/Supabase-backed school PWA remains unchanged.

## Remaining
- Execute and verify this migration in CI.
- Build the local learner/admissions repository and protected API routes.
- Rehearse a read-only export/import mapping, preserving every existing admission number/pupil code and LIN exactly; do not import until the school approves a backup and reconciliation report.
- Add academic term/class subject/assessment structures and guardian portal profile projections with strict learner scoping.