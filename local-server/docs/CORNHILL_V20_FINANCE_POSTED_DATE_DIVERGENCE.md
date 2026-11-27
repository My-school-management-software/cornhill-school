# CORNHILL Phase E — Finance Posted-Date Divergence (27 November 2026)

## Verified read-only evidence

**Hosted Supabase `public.school_payments`**: eight Posted payments, seven dated **2026-11-22**, one dated **2026-11-23**, Uganda time. The `created_at` Uganda calendar day matches the `received_at` day for all eight.

**Windows `cornhill_school.payment_records`**, owner-run diagnostic: nine Posted payments, five dated **2026-11-22**, four dated **2026-11-23**, Uganda time. Draft/Voided/Reversed: zero.

| Uganda day | Cloud posted | Windows posted | Windows minus cloud |
|---|---:|---:|---:|
| 2026-11-22 | 7 | 5 | -2 |
| 2026-11-23 | 1 | 4 | +3 |
| **Total** | **8** | **9** | **+1** |

This does **NOT** establish that any single receipt is duplicate, missing, incorrect or safe to transfer. It is not merely a one-row mismatch on one date: the distribution differs across both days. Received dates may have been changed during import, data might be different, or one version might include distinct transactions. No payment identities, amounts or allocations were compared.

## Safe follow-up diagnostic (separate ZIP)

`CORNHILL-V20-FINANCE-PAYMENT-TIME-READONLY.zip` provides a standalone Windows diagnostic and nine local synthetic tests. It groups the local Posted records by both **received_at Uganda day** and **created_at Uganda day**, reports only group counts, and counts how often the two date fields differ. It uses `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, `SET LOCAL statement_timeout`, aggregate `SELECT`, `ROLLBACK`; never displays receipts, identifiers, personal information or financial amounts.

The hosted read-only date-pair grouping was `received 22 / created 22 = 7`, `received 23 / created 23 = 1`. The owner has not yet run the local date-pair check. The standalone test suite passed 9/9 cases on Node 22 and script syntax validation was successful, but **this is not an actual database integration test**.

## No-write release boundary

Do not merge or deploy sync code, modify payments, auto-reconcile, overwrite receipt metadata, or migrate either database. A count/date reconciliation does not prove identity, amount, allocation, reversal status or idempotency. Finance replication remains disabled; release blockers cleared by this investigation: **0/5**.

The GitHub branch containing this note may lag the owner's installed Windows code; always use a separate safe diagnostic package rather than overwrite it.
