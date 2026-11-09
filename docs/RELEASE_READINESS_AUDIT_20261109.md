# CORNHILL release-readiness audit — 9 November 2026

## Scope and decision

This review checked the development source, the connected Supabase project, the Vercel production project, PWA installation metadata, app links and key operational-data prerequisites. It is a release-readiness review, not a claim that every real school workflow has passed end-to-end.

**Decision: the core management workspace can be opened by authorised staff, but the school is not yet ready to declare every module fully operational.** The remaining work is mainly official school-data provisioning, configuration of third-party services, backup recovery validation and real-device acceptance. Do not create artificial learner, mark, guardian, attendance or payment data to make the checklist appear complete.

## Source changes in this review

- Added a shared in-page Install control to Banking and Evidence Capture, using the existing offline foundation.
- Added an Install CORNHILL control to the main dashboard.
- Added scalable 192×192 and 512×512 SVG app icons based on the existing CORNHILL badge, retaining the PNG fallback.
- Updated all nine web app manifests and moved the service-worker shell/static caches to v70; the new icons are included in the shell precache.
- No uninstall wording was added. Existing native browser/Windows uninstall controls were not modified.
- The main application still starts in normal sign-in mode: demo mode defaults to false. The optional read-only demo helper remains in the source but is not the default path.

## Automated checks completed

### Source and PWA checks

- **88/88 source assertions passed** across the main application, admissions, parent portal, evidence, banking, notifications, records, communications, school services, school website and service-worker/offline shared scripts.
- The source assertions covered responsive viewport metadata, manifest links, service-worker registration, no duplicate static element IDs, local HTML links, shell-cache entries, existing Install prompt handlers, the shared/main Install controls, and absence of uninstall wording.
- **36/36 manifest assertions passed** across nine manifests: valid JSON, working start routes, scalable 192/512 icon references, and PNG fallback.
- **8/8 additional SVG/service-worker assertions passed**: both icon files are validly structured with the embedded school badge, and the v70 service worker precaches them.
- All ten checked HTML app routes referenced local HTML targets that exist in the repository.
- The main app's optional demo helper is present, but `demoMode` initializes to `false`.

These are source assertions, not a real Chrome/Edge/Android installation test. A generated PWA Install button only appears when the browser fires `beforeinstallprompt`.

### Supabase release-invariant checks

**17 of 23 database invariants passed.** The six outstanding checks are genuine onboarding or recovery-readiness prerequisites, not anonymous database access failures.

Passed checks:
- Row-level security is enabled on all 106 public tables.
- No public `SECURITY DEFINER` function is executable by the anonymous role.
- All 94 inspected public `SECURITY DEFINER` functions set a fixed `search_path`.
- Permanent pupil/admission codes are present and unique (487 records).
- All 484 active learners have a class and an active enrolment with class, term and academic year.
- All 10 active teacher accounts have a class-access mapping.
- Both existing posted payment rows have valid, unique receipt numbers and internally valid amount/unallocated fields.
- The private evidence bucket, evidence index and auto-index trigger are present.
- Four scheduled CORNHILL jobs are active, with no failed run recorded in the last seven days.
- All 23 active App Centre entries have URLs.
- Exactly one current academic year and one current term are configured.

Security observations:
- 56 public SECURITY DEFINER functions are callable by authenticated accounts. They were not bulk-revoked: sample bodies and the parent PIN RPCs enforce identity/role checks or delegate to scoped helpers. Trigger-only functions are separately revoked from client execution.
- Supabase's leaked-password protection advisor remains disabled and needs an administrator to enable it in Supabase Auth settings.
- The advisor also reports multiple permissive policies and the pg_net extension in the public schema. These require targeted review; broad policy or extension changes could break legitimate workflows.
- The four Edge Functions are active. Parent PIN verification is backed by hashed PINs, row-level attempt counters and a 30-minute lock after five failed attempts; its privileged RPCs are not executable directly by anon/authenticated clients.

## Live school-data and configuration gaps

These are the six failing operational checks and additional related observations:

1. **Ministry identifiers:** all 484 active learners lack LIN; all 34 active P.7 learners lack a P.7 index number. Admission records remain marked incomplete until LIN is recorded. Obtain the official identifiers from the school/Ministry; never generate substitutes.
2. **Guardian onboarding:** zero active learners have a provisioned active guardian contact with a PIN. Two guardian-contact rows exist, but neither is PIN-ready for an active learner. The isolated parent portal is coded, but families cannot use it until verified contact numbers and PIN/recovery credentials are issued.
3. **Finance reconciliation:** two posted payments total UGX 30,000 and all UGX 30,000 remains unallocated; there are currently zero allocation rows and one learner charge. Receipt numbers are present and unique. A bursar must reconcile the actual payer/learner/charge before amounts are allocated.
4. **Backup recovery:** daily backup is enabled. There are nine successful backup runs and two older failed runs; the latest successful completion was 9 November 2026 at 02:00:09 UTC and the largest recorded run contained 1,314 rows. There are zero independent validation records. A successful encrypted upload is not a tested restore.
5. **SMS/provider setup:** there are two SMS outbox rows but zero communication-provider settings, zero templates and zero delivery-event rows. No SMS/WhatsApp delivery should be promised until the school configures a provider, sender, costs and consent process.
6. **Attendance hardware/setup:** there are no paired fingerprint devices, device-user mappings, attendance events, imported batches, work schedules or schedule assignments. The attendance screens and import workflows exist, but the physical fingerprint integration is not commissioned.

Other readiness observations:
- 73 assessments exist but there are zero saved assessment scores and zero published report cards. This may simply mean the school has not started mark entry for the current period.
- There are 37 active fee schedules, one learner charge, and no payment allocations. Confirm the applicable class/term schedules and charges before collecting fees.
- The evidence workflow and Records Centre are installed in the code/database, but there are currently zero paired capture devices, evidence requests, uploaded files or indexed records.
- One non-active learner's historical enrolment has no class; two non-active historical enrolments have no term/year. No active learner enrolment has these gaps, so historical rows were not rewritten.
- The SMS provider, attendance hardware and portable thermal printer require external setup and real-world validation.

## Deployment and device test boundary

The source branch is `feat/offline-first-workspaces-20261109`. The Vercel project uses the Hobby plan. The PWA supports browser installation on compatible Windows 10/11 and Android browsers; this is not a packaged Windows `.exe` or Android `.apk`.

The service worker caches the public app shell and approved static libraries. It does not cache learner, guardian, payment or other private server data. A few safe drafts can be retained locally; payments, official marks publication, approvals and other database transactions still require a connection.

No physical Windows 10/11, Android camera/microphone, fingerprint reader, thermal printer, parent sign-in, teacher mark-save or live payment workflow was exercised in this review. Vercel Hobby log retention is limited; no production error log entries were returned for the latest 30-minute window, which is not a substitute for full monitoring.

## Go-live conditions

Before describing the whole school operation as fully commissioned:
- the school administrator must enter/verify every LIN and P.7 index number;
- the office must provision active guardian contacts and PIN/recovery credentials;
- the bursar must reconcile the UGX 30,000 unallocated payments and confirm the term/class charge setup;
- an administrator must validate a backup by restoring it in an isolated environment;
- the school must configure communication providers/templates and complete a consent-aware delivery test;
- the attendance terminal must be identified, mapped and tested with a sample export;
- staff must complete the real-account acceptance checklist for teacher restrictions, marks, report cards, receipts, print output and Android/Windows installation.

No real school data were inserted, changed, reversed or deleted as part of this audit.
