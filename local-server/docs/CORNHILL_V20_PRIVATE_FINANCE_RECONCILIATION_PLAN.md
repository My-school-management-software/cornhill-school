# CORNHILL V2.0 — Phase F, privacy-preserving candidate reconciliation (27 Nov 2026)

## Verified evidence

- Windows (Director test): 9 posted payments; on Uganda dates 22 Nov = 5, 23 Nov = 4. All nine have the same received/created calendar date. No drafts, voids or reversals.
- Hosted Supabase: 8 posted payments; 22 Nov = 7, 23 Nov = 1. All eight have the same received/created calendar date.
- The difference is **not** an error due only to choosing `created_at` versus `received_at`: the reported distribution remains different.
- The actual payment identities, amounts, allocations and receipt totals have **not** been reconciled. Do not infer duplication, loss or a safe payment to transfer.

## Next one-shot Director-only diagnostic

A separate, **private** Windows ZIP `CORNHILL-V20-PRIVATE-RECONCILIATION-READONLY.zip` was created and verified (15/15 synthetic Node 22 tests). It is **not** committed to GitHub because it contains a one-time audit key and pseudonymized hashes of live school payment metadata.

The standalone ZIP contains a cloud snapshot that was computed using `extensions.hmac` inside Supabase read-only SQL: a keyed HMAC of the sorted set of 484 cloud learner UUIDs, plus three keyed HMACs for each of eight posted cloud payments:

1. source student UUID + exact UGX amount;
2. the above + normalized payment method;
3. the above + Uganda received day.

Cloud database query disclosed **only** keyed digests and counts, not raw learner/student IDs, names, phone numbers, receipt numbers, financial amounts or payment references.

The Windows script loads existing local PostgreSQL credentials from the installed `.env` (no upload), opens a single `READ ONLY` `REPEATABLE READ` transaction, reads `cornhill_school.learners.source_record_id` plus Posted payment metadata joined to their corresponding source learner IDs, computes the matching HMACs **in Windows process memory** using the one-time audit key, and prints **only aggregate candidate-match counts**. It ROLLBACKs and closes the DB connection, never sends local data to the network, and never writes records.

The learner UUID set digest equality verifies **only that the set of source UUIDs** matches cloud IDs; it does not verify name, class, gender, personhood, or source-link correctness per individual.

A payment fingerprint match is only a candidate match because multiple payments of identical amount for the same learner can look alike. Do not treat these matches as receipt identity, ledger reconciliation, idempotency evidence, or data synchronization acceptance.

## Safety and release status

No installed Windows EXE, APK, GitHub production main, Vercel deployment, Supabase tables, local PostgreSQL rows, financial posting rules, firewall settings or application credentials were changed. The ZIP is **private school audit evidence**; it should not be shared/uploaded or committed to a public repository. Formal full-release blockers: **0/5 cleared**. Next steps remain independent finance provenance/ledger audit on approved devices, then offline sync acceptance.
