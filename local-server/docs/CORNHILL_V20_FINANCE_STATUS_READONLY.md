# CORNHILL V2.0 — Phase C: Finance status count reconciliation (READ ONLY)

## Why this review was added

On 27 November 2026 the Director's Windows inventory returned:
- Local payment_records: **9**
- Local learners: 484; linked source-record fields: 484 populated
- Local marks: 1,991; local assessments: 169

A separate read-only query to the hosted Supabase project returned:
- public.school_payments: **8**
- Status distribution: **Posted = 8**, no other statuses in that snapshot.

**The difference of one in total rows does not prove an extra posted receipt, duplicate payment, or data loss.** The local payment table can also contain Draft, Voided and Reversed entries. Nor would matching Posted counts prove payment identities/amounts/allocations match.

## Implementation and protections

The diagnostic queries local cornhill_school.payment_records with exactly one aggregate SELECT in a PostgreSQL `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction. It reports only counts:
- TOTAL
- DRAFT
- POSTED
- VOIDED
- REVERSED

The diagnostic does not return payment IDs, learner IDs, receipts, dates, amounts, payer names, codes, rows, password hashes or secrets. Counts are reconciled; malformed results fail closed; the transaction is rolled back and the connection released.

Files:
- `src/sync/local-finance-status-audit.mjs`
- `scripts/review-local-finance-status.mjs`
- `test/local-finance-status-audit.test.mjs`

Run using the separately distributed ZIP's PowerShell wrapper from the Director's computer; **do not overwrite the installed local application**. The wrapper uses the existing private CORNHILL .env and local pg dependency only on that device, runs synthetic tests first, and emits count-only results.

The cloud figure `CLOUD_POSTED_AT_LAST_READ_ONLY_CHECK=8` is a historical reference point, **not a live cloud fetch** by the diagnostic.

## Interpretation

- Local Posted = 8, plus one Draft/Voided/Reversed: posted counts align, **but no payment identities have been matched**.
- Local Posted = 9: additional review of financial history is needed, without deletion or re-posting.
- Local Posted < 8: additional investigation needed; do not infer missing receipt without source-identity reconciliation.

## Release limitations

**No finance sync, payment mutation, charge allocation, receipt update, hosted deployment, local Windows update, EXE/APK installation or firewall change occurs in this phase.**

This PR remains draft, and the five formal release blockers remain uncleared. Financial replication remains disabled until independent idempotency, reversals, credit/allocations, identity mapping, audit evidence, backup/restore and multi-device acceptance.
