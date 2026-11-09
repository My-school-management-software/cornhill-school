# CORNHILL whole-system improvement programme

Updated: 10 November 2026
Working branch: `feat/offline-first-workspaces-20261109`

## Delivery rule

Treat the main management system and every linked app as one school platform with one identity model and one Supabase source of truth. Separate app interfaces and install identities without duplicating learners, staff, payments, marks, or guardian records. Preserve current workflows and use additive, reversible migrations. Never manufacture school data to satisfy a readiness check.

## Workstream 1 — learner information completion

**Current implementation:** class-wise learner completion sheet in the administrator Learner Register. Includes class roster, search/filter, separate full-date and birth-year completion states, guardian details, LIN and P.7 index number, sequential previous/next navigation, validated Save & open next, print/CSV, and existing advanced register actions.

**Acceptance:** test one designated test learner per class, verify the update in the main learner profile and database, verify the permanent pupil code and historical code link, confirm teacher/guardian roles cannot open the administrator editor, and confirm export contains only the selected class/filter.

## Workstream 2 — truly independent app front ends

**Observed:** 12 app routes still rewrite to `school-services.html?workspace=...`; the shared page uses workspace filtering. This is not yet a separate application implementation for each route.

**Plan:** extract each workspace into a dedicated entry page or separately bundled app module, retaining the existing authenticated Supabase client/session and exact role checks. Use a shared design-system package for typography, spacing, responsive tables, navigation primitives and status indicators. Keep each app's route allowlist strict. A direct link to one app must not expose other workspace routes or data.

**Acceptance:** for every app, test direct URL, refresh, back/forward, installed PWA launch, sign-in expiry, administrator, teacher and relevant specialist roles. Verify cross-app navigation is only through authorised links and every database table remains protected by RLS.

## Workstream 3 — main application modularisation and layout

**Observed:** the main `index.html` is an oversized single document with extensive inline logic. This increases change risk and makes module-specific tests difficult.

**Plan:** move one bounded feature at a time into versioned assets/modules: learner register, academics, finance, staff/HR, attendance, notifications, settings. Keep a small entry shell and shared components. Avoid a one-shot rewrite.

**Layout acceptance:** no horizontal page overflow at 360px, 768px, 1366px and 1920px; content uses available width without colliding with the sidebar; cards wrap instead of clipping; long labels wrap; tables scroll within their own container; forms remain readable; keyboard focus and touch targets remain visible.

## Workstream 4 — data quality and learner audit trail

- Provide a review queue for missing/invalid LIN, P.7 index number, DOB/year, guardian contact and class enrolment.
- Record who changed a learner field, when, and the previous/new value for sensitive identity fields.
- Keep DOB day/month separate from year-only knowledge; never infer missing dates.
- Reconcile duplicate staff/teacher directory entries only after human confirmation.
- Preserve pupil-code history and admission provenance.

**Acceptance:** audit events are append-only for ordinary users; only authorised administrators can correct identity fields; test code stability and code-correction history.

## Workstream 5 — academic integrity

- Keep marks scoped by explicit class, subject, assessment and academic term.
- Prevent importing marks when worksheet term/class identifiers disagree with the selected destination.
- Validate numeric marks against the assessment maximum; report invalid cells and rows without partial import.
- Produce administrator class summaries from the same saved teacher scores, grouped by class and subject.
- Keep Nursery, P.1–P.3 and P.4–P.7 grading/report structures distinct.
- Verify English and Mathematics grading rules against the school's approved policy before changing calculations.

**Acceptance:** teacher-entered scores, administrator summaries, report cards and exports reconcile for the same class/term/assessment; import rollback is atomic.

## Workstream 6 — finance reconciliation

- Reconcile existing unallocated payments with the bursar; do not allocate by guessed learner.
- Validate fee schedules by class and term before posting charges.
- Preserve previous-term debt allocation, bursary charges, split payments, receipts and UGX balances.
- Add audit trails for reversals, allocations and corrections; never delete a posted receipt to hide a correction.

**Acceptance:** sample end-to-end receipt, previous-term allocation, bursary payment, partial payment, reversal and statement reconciliation with the bursar.

## Workstream 7 — notification centre

- Keep the central inbox/history/archive.
- Verify that every notification links to the correct restricted app and record.
- Keep sensitive welfare content generic in notifications; show details only after role-authorised navigation.
- Distinguish unread, read, archived and restored state per user.
- Do not promise closed-browser push until a push provider/subscription flow is configured and tested.

**Acceptance:** event-to-notification tests for admissions, attendance, payroll, welfare, maintenance, visitor register, report publication and bursary awards, with role and recipient checks.

## Workstream 8 — backup, security and offline

- Run an isolated restore drill and record restore timestamp, restored schema, row counts and verification result.
- Enable leaked-password protection in Supabase Auth settings.
- Review permissive RLS policies and SECURITY DEFINER functions individually; do not blanket-revoke working scoped functions.
- Keep private files private and use short-lived signed links.
- Keep offline mode limited to cached public shell and explicitly safe local drafts until encrypted, conflict-aware sync is implemented. Payments, approvals, published marks and messages must not appear to succeed offline.

**Acceptance:** restore test, RLS negative tests, expired-session tests, offline/reconnect tests and duplicate-submit protection.

## Workstream 9 — real integrations and device acceptance

- SMS/WhatsApp: configure an approved provider, sender, templates, costs and consent before sending.
- Fingerprint attendance: confirm terminal make/model, export format, Windows bridge, employee mapping and duplicate-event handling.
- Portable thermal printers: validate 58mm/80mm receipts, print preview and browser print on actual devices.
- Test Android installation and Windows 10/11 installation as independent PWAs, not nested tabs.

**Acceptance:** supervised real-device test using test accounts and non-production transactions.

## Workstream 10 — release and deployment discipline

- Keep development changes on the working branch until tests pass.
- Require CI green, migration review, role/RLS tests and preview smoke test before merging/releasing.
- Verify the deployment commit SHA and production alias after every deployment.
- Respect Vercel Hobby quotas; do not change the user's plan or incur paid charges.
- Distinguish source-committed, preview-deployed and production-live status in every progress report.

## Current release boundary

The learner completion sheet is committed on the working branch. It is not to be described as live until a deployment containing its commit is verified. The prior audit also records that real-device acceptance, backup restoration, guardian onboarding, SMS provider configuration, fingerprint hardware commissioning and bursar reconciliation remain operational tasks.