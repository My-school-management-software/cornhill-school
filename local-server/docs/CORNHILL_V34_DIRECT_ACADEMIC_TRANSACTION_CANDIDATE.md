# CORNHILL V34 — DIRECT DEVELOPMENT WITHOUT CODEX

Director said **CODEX IS NOT AVAILABLE**. We therefore developed the next safe code candidate **directly**, without requiring Runar or Codex and without asking the Director for additional manual source edits.

## Artifact created

**CORNHILL-V34-DIRECT-ACADEMIC-TRANSACTION-CANDIDATE.zip**

SHA256: `9fc11c4f695c116029389e570b484a1941aff4eba06158ff2e64217486c72a7b`. ZIP CRC PASS, per-file SHA256 manifest included. Packaged files:
- `src/security/v33-offline-mark-preview.mjs` — exact V33 preview fingerprint reference, copied from verified V33 source.
- `src/security/v34-offline-mark-commit.mjs` — validates a batch UUID, max 100 distinct operations, numeric score precision, V33 baseline fingerprints, detects stale marks and school/class/subject conflicts, deterministic actor+batch+payload SHA256 digest.
- `src/db/v34-offline-mark-transaction.mjs` — PostgreSQL transaction repository candidate: assessment row lock (synchronizes with existing mark save path), school/class/subject/enrollment checks, staff_marks_scope authorization, atomic all-or-nothing change and rollback on conflict or error, idempotent same-actor/same-payload batch replay with journal, immutable audit existing database trigger.
- `migrations/122_local_offline_mark_batch_protection.review.sql` — **REVIEW ONLY**, creates two append-only idempotency tables; runtime role limited to SELECT/INSERT, no finance objects.
- `test/v34-offline-mark-commit.test.mjs`, `test/v34-offline-mark-transaction.test.mjs` — synthetic Node 22 mock-data tests for optimistic conflicts, duplicate replay, unauthorised users, closed assessments, invalid marks and error rollback.
- README and integrity manifest.

## Results and critical safety limits

**25/25 Node 22 focused tests passed, 0 failures**. This test run used **mock PostgreSQL transaction clients, not a real PostgreSQL17 isolated DB**, so it is NOT sufficient to deploy or declare real synchronization accepted.

The package is explicitly **not installed on the Director's Windows database or active HTTPS server**; its SQL migration is named `.review.sql` to avoid automated migration. **NO finance/cloud/school data writes, no live schema changes, no app restart, and no native installer release.** It is a code candidate ready for independent disposable PG17 integration tests, exact Windows source-hash review, authenticated staff HTTP+CSRF integration, and explicit Director migration approval.

The V33 preview route was genuinely activated by Director after Node server restart (GET POST-only route returned 405). Existing V32C fresh encrypted database snapshot is verified but Windows CurrentUser-DPAPI bound. Cloud has 8 Posted payments, local 9; finance sync OFF. Formal release blockers remain **0/5**.

Next technical work without Codex: run isolated PostgreSQL17 acceptance (actual rollback+unique constraints), integrate behind a default-OFF feature flag for class-scoped staff HTTPS, and test physical client offline retry + server conflicts without enabling finance sync.