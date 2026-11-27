# CORNHILL V33 actual Windows results and V33B safe finance audit correction

**27 November 2026 Uganda.**

Director ran V33, with **V33_ISOLATED_AUTHENTICATED_API_TESTS=PASS**, **V33_LOCAL_SOURCE=INSTALLED**, 2 new source files and 1 reviewed academic handler patched, source backup created. Zero database/finance writes, zero server restart, new academic conflict-preview URLs **still NOT live** until an approved main server restart. V33 finance read-only audit **BLOCKED** with generic READ_ONLY_QUERY_OR_CONFIGURATION_ERROR; no credit reconciliation or synchronization was done. Formal release blockers 0/5.

## Root causes identified directly in archived V33 code (not guesswork)

The V33 PowerShell runner launches its finance helper via `node script.mjs` without loading the school's `.env`; unlike earlier finance verifiers it doesn't pass `--env-file=.env`. Also the helper unconditionally selects `unallocated_amount_ugx` from **local** `cornhill_school.payment_records` and references `cornhill_school.payment_credit_allocations` and `cornhill_school.payment_credit_allocation_batches`. The original verified local migration 007 creates `payment_records` with `amount_ugx` but **not** `unallocated_amount_ugx`; the latter is a **hosted Supabase public.school_payments** column. Therefore the V33 credit-check SQL is incompatible with the documented local schema. The exact first runtime failure is not isolated because V33 collapsed all errors into one generic reason.

## V33B fix prepared — independent ZIP and no production source modifications

Created `CORNHILL-V33B-SAFE-ACADEMIC-AND-FINANCE-VERIFY.zip`, **7,230 bytes**, **SHA256 `9bd489a1dab09700829798e4340d0d73d4fcea179e8bc91e8b161c41f1ddf106`**, valid ZIP CRC + per-file SHA256SUMS. **23/23 Node tests PASS** (isolated test runtime); Windows execution pending.

The PowerShell runner:
1. checks that V33's installed backend handler SHA256 is `00029d425536ea64db6f5373f71e65d615a57ff7120b9ff8b24c07d3cf680488` and the module SHA256 is `13512761e1e06a063681d3b44be06e65e4b0515a0cc51dd1118ba5ae338df00b`, otherwise fails closed;
2. runs installed V33 21 mock-auth API tests (without live data) and 23 finance safety tests;
3. uses **`node --env-file=.env`**, connected to *only* PostgreSQL17 cornhill_local on loopback:5432 via `cornhill_local_admin` and `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
4. verifies actual schema columns in `information_schema.columns` for the three local finance tables, then performs readonly aggregate queries for local Posted count, receipt count, missing/orphan receipts, missing idempotency/time stamp, duplicate posted idempotency, orphan allocations, overallocation, fully/partially allocated and reversed counts. Does not query **hosted-only fields** or assume hosted and local allocations have matching structure.
5. prints phase-specific safe errors; no learner info, individual payment amounts, IDs, secret logs, files, cloud access, live application or DB writes. Main server listening status is read-only and source activation remains pending normal approved restart.

This audit **does not establish row-by-row financial identity**. Supabase cloud 8 posted payments (all 8 with retained credit, zero regular allocations) vs local 9 Posted remains unresolved; FINANCE_SYNC must remain OFF. No auto academic commit, signed Windows installer, Android APK, or full offline-cloud sync delivered by V33B.

After V33B confirms source and local finance audit, director can restart main Node server normally in its *own* PowerShell window (Ctrl+C then `Set-Location 'C:\Users\hp\cornhill-school\local-server'; npm run start:auth`), **never stop Windows PostgreSQL service**; then independently test authenticated staff API against live HTTPS listener. Do not claim API live until verified. Formal five release blockers 0/5 cleared.