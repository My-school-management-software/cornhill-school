# CORNHILL platform architecture and storage rules

Status: architecture baseline for the staged reliability work, 12 November 2026.

## 1. Architecture boundaries

- The Supabase Postgres database is the authoritative source for structured school records: learner identities, enrolments, marks, finance entries, staff assignments, communication metadata, evidence metadata and audit events.
- Application modules remain independently routed and are not allowed to duplicate a second source of truth for the same school entity.
- Shared platform services own authentication, role/permission checks, audit logging, notifications, attachment metadata, scheduled work, backups and monitoring.
- A module must not directly modify another module's private records. Cross-module work should use an approved database function or service contract with explicit permissions.
- Large lists must use pagination or bounded queries. Avoid loading whole-school records when a page needs only the current class, term or page.
- Schema changes are versioned migrations. Every change must be checked against a representative role matrix and verified before production promotion.

## 2. File and evidence storage

- Store actual file bytes in private object storage, not in Postgres rows or inline page source.
- Store only metadata and references in Postgres: owner, linked learner/staff/record, category, size, media type, checksum, created time, retention rule and access scope.
- Keep signed or authenticated downloads short-lived. Never make evidence, identity documents, staff media, learner photos or finance evidence public.
- Phones and office computers may keep temporary encrypted offline drafts and upload queues. They are not the authoritative archive.
- The existing encrypted Google Drive backup is a recovery copy, not the live attachment store.
- A future external cloud provider must be accessed through a server-side storage adapter. Provider credentials stay in server-side secrets; the browser receives only short-lived upload/download authorisations.
- Provider selection must account for data residency, privacy, encryption, access auditing, retention, restore capability, monthly request charges and egress fees. Do not migrate current objects until a copy-and-verify test passes.

## 3. Reliability and capacity

- Measure database bytes and private file-object bytes independently.
- Capacity thresholds: 70% warning, 85% urgent, 95% critical. These are early-warning triggers, not guaranteed failure points.
- Capacity checks run on a schedule and generate deduplicated administrator notifications. A successful dashboard check is not a substitute for external uptime monitoring.
- Backups must be checked for completion and separately restore-tested in an isolated environment. A backup record alone does not prove recovery.
- Vercel hosting usage, external storage usage and Supabase database/storage usage are separate meters and must not be represented as one combined percentage.

## 4. Safe release sequence

1. Inspect the current production revision and identify the smallest compatible change.
2. Make the change on a dedicated branch; never edit production source in place.
3. Review migrations, RLS/grants and role boundaries.
4. Run static checks and targeted regression tests.
5. Deploy a preview, verify the actual route and key workflows, then promote only after successful checks.
6. Keep a known-good deployment available for rollback and preserve school records throughout.

## 5. Current plan baseline

The current capacity-monitor configuration reflects the Supabase Free allowance measured for this project on 12 November 2026. If the provider subscription changes, update the private capacity configuration through a reviewed migration before relying on its percentages.
