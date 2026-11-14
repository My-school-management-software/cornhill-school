# CORNHILL Local Finance — Payment Posting Batch 15

## Local-only implementation

- Migration 010 adds payer name, collection item and unallocated UGX credit to payment records.
- The posting invariant is now: allocated amount + unallocated credit = total amount received.
- The new atomic posting routine checks active staff, active employment and an explicit `finance.payments_record` permission before posting.
- It validates active learners and open fee balances belonging to that learner, serializes payments for a learner, prevents over-allocation, and uses an idempotency key to make retries safe.
- Receipt snapshots preserve learner code/name, payer, collection item, amount, allocation details and unallocated credit.
- Posted payment data and posted allocations are protected against edits.
- A separate finance API database role inherits a restricted finance runtime role. Both roles remain NOLOGIN. The API role has no direct payment, allocation, receipt or sequence access; it can execute only the scoped posting function.

## Automated verification

The new finance verifier checks role privileges and performs a synthetic 85,000 UGX receipt inside a transaction that is rolled back:
- 50,000 UGX allocated to an old-term obligation.
- 25,000 UGX allocated to a current-term obligation.
- 10,000 UGX retained as unallocated credit.
- Same-key retry returns the same payment and receipt.
- Changed-payload retry, missing permission, over-allocation and posted-payment edits are rejected.
- Receipt snapshot and guardian-consent SMS queue are checked.

CI and Windows installer checks have been updated. **The new CI run has not yet been observed**, so these checks are added but not yet reported as passed.

## Not included yet

No payment screen or HTTP API route is enabled. The later allocation of previously retained credit, expense approval, bank ledger/reconciliation, thermal receipt print/reprint, SMS sender, and real-data migration remain separate work. No hosted data or Supabase/Vercel resources are changed.
