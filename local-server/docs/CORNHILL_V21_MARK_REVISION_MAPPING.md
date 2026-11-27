# CORNHILL V2.1 — Local mark revision and verified source mapping

**Date:** 27 Nov 2026 (EAT). **Status:** GitHub draft development only; not installed, not approved for Windows migration. Formal release gates cleared: **0 of 5**.

## Blockers advanced

- **Blocker 2 (API/data parity):** new `src/db/academic-draft-verifier.mjs` verifies the matching active learner (using the hosted learner UUID stored as `cornhill_school.learners.source_record_id`), local Open assessment, active term, currently active enrolment, class-assigned active subject and current mark record. It uses a repeatable-read **READ ONLY** PostgreSQL transaction and statement timeout; it returns only class ID, assessment max, a revision number and a keyed SHA-256 baseline fingerprint. No names, phone numbers, marks or comments are returned. **This is a backend repository function, not yet an authenticated HTTP endpoint**.
- **Blocker 4 (offline conflict infrastructure):** new **migration 096**, `096_local_offline_mark_revision_baseline.sql`, adds `offline_sync_revision` to `cornhill_school.learner_marks`. A before INSERT/UPDATE trigger sets initial revision to 1 and automatically increases it on any later update, protecting against client revision reuse. The verifier constructs its fingerprint from saved score, maximum, comment, current revision, existence state and source identifiers using a private backend HMAC key. A newly created mark differs from an absent mark even if both have revision 1. Changes in remarks or marks invalidate prior baselines.

The verifier resolves **local assessment and subject IDs**. It does **not** prove those assessment or subject IDs have the same identity in hosted Supabase. The prior 484-learner cloud/local source-ID set comparison is only learner-level proof, and cannot be extrapolated to subject/assessment parity.

## Safety

- The migration is an additive code artifact on a **draft, unmerged GitHub branch** and has **not** been executed against the Director's working `cornhill_local` database or against Supabase.
- Do not run `npm run db:migrate` or apply migration 096 to a working Windows installation until the actual installed source has been reconciled and a private verified PostgreSQL 17 backup has been tested.
- The verifier reads only local PostgreSQL tables. It does not upload, post, publish, queue, synchronize or delete any marks.
- `createOfflineMarkDraftAdmissionService` already rejects attempts to stage if the required mapping proof, positive version, Open assessment status, correct class assignment or role permission is missing; that service has **not yet been wired to an authorised HTTP route**.
- There is no device-bound encryption key provisioning, Windows ACL acceptance, authenticated replay, signed acknowledgements or class/term end-to-end acceptance. The offline draft queue cannot safely be enabled for teachers until those exist.
- Finance remains excluded because cloud (8 Posted) and Windows (9 Posted) ledgers have zero candidate matches on learner + amount.

## Tests and release

- New synthetic tests in `test/academic-draft-verifier.test.mjs` exercise missing/duplicate mappings, strict UUIDs, SQL read-only rollback, status/term/class gating, score/revision validation and fingerprint changes.
- The dedicated V21 Linux and Windows GitHub Actions matrix runs these tests along with encrypted vault, staff permissions and academic UI loss-prevention tests.
- The full Linux PostgreSQL 17 pipeline runs migration 096 on a disposable isolated DB and performs source/backup/restore checks. CI results must pass before any further integration.
- **No release blocker may be marked cleared from these tests alone**. Main/production/installed Windows software remain unchanged.
