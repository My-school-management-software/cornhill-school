# CORNHILL Finance Acceptance Tests

**Review date:** 6 November 2026  
**Environment:** connected Supabase project; read-only inspection only  
**Important:** no test payment, receipt, allocation, reversal or school finance record was created or changed during this review.

## 1. Live schema and migration checks

| Check | Observed result | Status |
|---|---|---|
| Finance tables protected by RLS | school_payments, payment_allocations, learner_charges, school_expenses and fee_items have RLS enabled | Passed (metadata) |
| Atomic payment posting migration | Applied: atomic_school_payment_posting | Passed (migration history) |
| Duplicate charge allocation protection | Applied: prevent_duplicate_fee_charge_allocations | Passed (migration history) |
| Reversal audit migration | Applied: audited_school_payment_reversals | Passed (migration history) |
| Separate enrolment-period finance | Applied: learner_re_admission_and_separate_enrolment_finances and balance view hardening | Passed (migration history) |
| Current-term-first allocation | Applied: current_term_first_payment_allocation | Passed (migration history) |
| Bursary admission integration | Applied: connect_admission_bursary_to_enrolment_finance | Passed (migration history) |
| Health advisor | Zero health lints at review time | Passed (health check) |

## 2. Read-only data snapshot

The Supabase table metadata endpoint reported:

- Learner charges: 1 row
- School payments: 2 rows
- Payment allocations: 0 rows
- Learner enrolment periods: 2 rows
- School expenses: 0 rows
- Fee items: 13 rows
- Expense categories: 13 rows

These are table row counts only. They do not establish that each payment's allocation or balance is correct. No payment amounts, learner names, phone numbers or private payment references were read in this check.

## 3. Source-level control review

The applied payment-posting migration was reviewed:

- Requires a signed-in active school administrator through `is_school_admin()`.
- Requires a positive whole-UGX amount and an allowed payment method.
- Serializes payment posting per learner using a transaction advisory lock.
- Confirms a selected charge belongs to the learner's active enrolment period.
- Rejects repeated charge IDs in a manual allocation list.
- Rejects allocations above the remaining charge balance or above the payment amount.
- Writes the payment and allocations in one database transaction.
- Automatically allocates only to the current open term.
- If no current open term exists, or no current-term charges remain, the remainder stays as unallocated learner credit.
- Previous-term and unassigned charges are paid only when explicitly selected by the administrator.
- The reversal RPC requires an administrator, a posted receipt and a reason of 5–500 characters. It locks the receipt, changes status to Reversed and records who/when/why without deleting the original payment or allocations.

The UI was reviewed for the previous-term opt-in, payment submission busy guard, receipt allocation summary, enrolment-period balance label and confirmation before reversal. This is source review, not a browser test.

## 4. Required transaction tests — pending

These tests must run in a dedicated isolated test project or approved test dataset, never by experimenting with real school payments:

1. Post an exact payment against one current-term charge; verify receipt, allocation and balance.
2. Post a partial payment; verify remaining charge balance.
3. Submit a payment with a manually selected previous-term charge; verify the chosen old balance is paid and unticked old balances remain unchanged.
4. Submit a payment without selecting previous-term charges; verify only current-term charges are allocated.
5. With no configured current term, post a payment and verify it remains unallocated rather than silently paying historic charges.
6. Submit duplicate charge IDs; verify the transaction is rejected with no payment/receipt rows created.
7. Submit an allocation above the charge balance; verify rejection and no partial writes.
8. Submit an allocation total above the payment amount; verify rejection and no partial writes.
9. Attempt to reverse a receipt with an empty/short reason; verify rejection.
10. Reverse a posted test receipt; verify the original receipt remains visible, reversal audit fields are populated, and its allocations no longer count toward paid balances.
11. Attempt a second reversal; verify rejection because the receipt is no longer Posted.
12. Verify the receipt print preview on a standard printer and a portable thermal printer, including learner, class, payer, receipt number, allocation and balance.

## 5. Current outcome and boundary

**Passed:** migration presence, table/RLS metadata, health advisor, source-level checks of posting and reversal controls.

**Not yet tested:** authenticated RPC execution, database transaction rollback, actual receipt/charge balance reconciliation, previous-term allocation in a real session, reversal audit rows, duplicate/concurrent payment behavior, receipt printing and thermal-printer output.

No live school finance rows were changed during this review. Do not use the two existing payment rows as test records or reverse them. A school-authorised isolated test environment and test-only learner/charges are required for the pending transaction tests.
