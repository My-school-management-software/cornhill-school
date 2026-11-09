# CORNHILL Parent Portal and Guardian Contact Security — 127 Checks

**Review date:** 6 November 2026  
**Environment:** Live Supabase schema/function/policy inspection, read-only data-integrity checks, and two applied schema/function migrations. No guardian phone numbers, learner records, or audit rows were changed.

## Verification summary

- 95 parent-portal and teacher visiting-day source/policy checks.
- One initial teacher-role source-text assertion was too exact about whitespace/formatting. Direct inspection of the live function and a corrected role-fragment check confirmed the Teacher-role restriction is present.
- 32 post-migration guardian contact, consent, audit, phone-format and permission checks all passed.
- Total: 127 checks reviewed; 126 automated assertions passed directly and the remaining assertion was manually rechecked and confirmed. No underlying access-control failure remained.

## Parent portal findings

Verified:
- Guardian must be signed in.
- The phone in the Auth JWT must match the signed-in Auth user and be confirmed.
- The learner pupil code must match a learner linked to that exact phone through an active guardian contact.
- Anonymous execution is revoked; authenticated invocation is guarded inside the function.
- Learner output is an allowlisted profile subset; it omits home address, guardian phone, bursary decision fields and internal staff data.
- Assessment scores are returned only for the learner and a report publication with an approved timestamp.
- `report_card_publications.approved_at` and `approved_by` are NOT NULL, and publication management is administrator-only. The earlier suspicion that pending publication rows could appear in the parent's published-report list was not a live defect: the table schema requires approval metadata for every row.
- Payment history is scoped to that learner and Posted receipts only.
- Balances use the active enrolment-period balance view, including credit.
- Conduct reports are learner-scoped and require guardian visibility, a publication timestamp and a timestamp not in the future.
- Guardian contact and change-log tables are RLS-protected and not exposed to anonymous users.

Teacher visiting-day lookup:
- Requires a signed-in, active Teacher profile.
- Requires an active learner in a class assigned to that teacher.
- Assessment results are restricted to the learner and their class.
- Conduct records are restricted to the learner.
- Anonymous execution is revoked.

## Improvements applied

### Migration 20261106203230 — guardian consent and audit invariants
- Database checks now require a phone number whenever SMS consent is enabled.
- Database checks require a WhatsApp number whenever WhatsApp consent is enabled.
- A unique partial index enforces at most one active primary guardian contact per learner.
- Guardian contact audit now records old/new relationship, active status and primary status, in addition to names, phone numbers and channel consent.
- Administrator update RPC checks active administrator access, a meaningful reason, Ugandan phone format and consent/number consistency.

### Migration 20261106203301 — canonical Uganda phone validation
- Reasserted the canonical `+256` E.164 validation for both SMS and WhatsApp numbers in database constraints and the administrator update function.
- Verified a valid `+256` sample passes; short, long, local-format and alphabetic examples fail.
- No actual guardian phone values were edited.

## Post-migration verification

All 32 post-migration checks passed:
- consent/number constraints,
- active-primary uniqueness,
- new audit columns and trigger behaviour,
- admin-only contact update guard,
- consent/number validation,
- Uganda phone format and malformed sample rejection,
- guardian RLS and RPC grants,
- existing guardian records still satisfy the constraints,
- no duplicate primary guardian,
- no data rows or audit rows created by the migrations.

## Not yet tested

- Actual guardian OTP delivery and login on a phone.
- Browser parent portal flow using real approved guardian test accounts.
- Browser test that a non-guardian phone cannot access another learner.
- Real guardian contact edit through the administrator UI and resulting audit row.
- Windows/Android browser operation and deployment.

## Supabase advisor status

- Health advisor: zero lints.
- Security advisor: six informational service-only tables with RLS but no client policies; one pg_net-in-public-schema warning; 20 authenticated SECURITY DEFINER function notices; leaked-password protection disabled. These existing findings were reviewed but not broadly changed because they include intentional guarded administrative RPCs and service-only tables. Each should be handled in a targeted security review.

No learner, guardian, finance, attendance or academic rows were changed.
