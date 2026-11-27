# CORNHILL V2.0 – Cloud/local integration: Phase A (safe foundation)

**Development only. No active synchronization, database migration, payment processing, hosted deployment, Windows updater or Android APK is included.**

## Verified starting point (27 November 2026)

- Android access to the existing **production** CORNHILL website was user-tested using mobile data: the page showed ONLINE, sign-in worked and school records appeared.
- The production alias is https://cornhill-school-swart.vercel.app/ and its Vercel deployment is READY from main commit 247d12a2be3fd7c0f19ee4e7009db685d41f4173. The old ir6okm37u URL is a separate preview.
- Supabase project yemhortbudwbcrzsoozk reports ACTIVE_HEALTHY. Only public schema **metadata** was queried for this phase; no student/guardian data or financial transactions were accessed.
- This branch is based on the GitHub local integration branch, currently older than the user's most recent Windows installation. Do not overwrite that installation with this development code.

## Production/local model comparison

| Domain | Hosted Supabase schema | Local PostgreSQL schema | Remaining prerequisite |
| --- | --- | --- | --- |
| Learners | public.students: id, admission_number, class_id, lin | cornhill_school.learners: id, source_record_id, pupil_code, class_id, lin | Prove source identity mapping, alias and re-admission behavior; source_record_id alone is not proof. |
| Marks | public.assessment_scores: assessment_id, student_id, score | cornhill_school.learner_marks: assessment_id, learner_id, subject_id | Verify learner, class, subject and assessment identity and grading parity. |
| Finance | public.school_payments and payment_allocations | cornhill_school.payment_records, payment_allocations and receipt ledger | No write synchronization until independent reconciliation, reversals, retained credit and idempotency are accepted. |
| Access | Supabase Auth, user_profiles, parent_guardian_contacts | Local cornhill_auth identities/sessions and guardian_contacts | Separate credentials; never replicate password/PIN hashes. Verify role and guardian isolation. |

## Files in this phase

- src/sync/cloud-sync-audit.mjs: strict **read-only** comparison of pre-authorized, non-identifying manifests for learner-profile and assessment-score metadata. Uses canonical UUIDs, positive revisions, 64-character digest fields and duplicate detection. Reports only counts. If a record differs, holds it for review; never generates write operations. All finance and guardian scopes are rejected.
- src/sync/public-cloud-probe.mjs: one non-credential public HTTPS GET to the known production site. No cookies, no request body, no redirects, no page-body processing. A 200 HTML response indicates only that the public shell is reachable, **not** that sign-in or synchronization works.
- scripts/check-cloud-access.mjs: run manually from local-server with node scripts/check-cloud-access.mjs. Read-only public frontend availability check.
- test/cloud-sync-audit.test.mjs and test/public-cloud-probe.test.mjs: synthetic failure-path and safety tests. No production connections or database modifications.

## Security requirements for next phase

1. Manifest producers must be authenticated, approved, least-privilege **backend** readers. Never provide raw school data or secret keys to the public browser.
2. Digests should be made server-side from a canonicalized record with an approved **HMAC-SHA-256 secret key**, avoiding low-entropy hashes of learner names or marks. Secure the key outside GitHub and browser bundles.
3. Only compare authorized, fully paginated and snapshot-consistent data. Empty results or stale caches do not prove a record is absent. Do not propagate deletions without separate approval.
4. Prove mapping between cloud UUIDs and local source identifiers independently. Do not equate unrelated local IDs to cloud IDs.
5. Do not expose local Windows PostgreSQL port 5432 or local auth server 4174 to the public internet. Phones use the hosted HTTPS application; any future local-to-cloud sync channel must be separately authenticated and audited.
6. Finance/receipt writes stay disabled. The cloud and local ledger models differ; do not double-post payments or overwrite historical receipts. No automatic last-write-wins.
7. Never collect or publish .env, private PFX, API service keys, guardian PINs, passwords, learner exports or school records in diagnostics.
8. The earlier experimental 4175 gateway was stopped and its firewall rules removed. Wait for a trusted school-owned secured router before LAN scale testing.

## Explicit future release acceptance

- Independently verify source identity, role equivalence and guardian isolation.
- Add dedicated backend-only, permission-scoped read manifests to BOTH systems; no production writes.
- Build a durable versioned outbox and idempotent conflict/replay model on disposable test databases.
- Independently validate finances, reversals, receipt numbering, credit allocation and ledger finality before considering live payment sync.
- Verify backup/restore, Windows/Android offline/reconnection, multi-device concurrency, and >30 client acceptance.
- Compare this branch with the owner's newer Windows source bundle before any updater or installation.

**Current formal release readiness: 0/5 blockers cleared by this phase.**
Run tests from local-server:
node --test test/cloud-sync-audit.test.mjs test/public-cloud-probe.test.mjs

The above tests cover only the new pure modules. They do NOT replace the complete local release suite, independent code review, cloud sign-in verification or hardware acceptance.
