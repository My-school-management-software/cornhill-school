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


## 2026-11-06 — Combined read-only finance batch: 24 database checks

A second grouped verification ran 24 read-only SQL checks against the connected project. No INSERT, UPDATE, DELETE, reversal, payroll payment or test transaction was executed.

| # | Check | Result |
|---:|---|---|
| 1–6 | RLS enabled on payments, allocations, charges, expenses, salary agreements and salary advances | PASS |
| 7 | No anon table grants on the inspected finance tables | PASS |
| 8–12 | Positive payment/charge/expense amounts and bounded unallocated amounts | PASS |
| 13–15 | Allocation totals do not exceed receipts; allocated + unallocated reconciles; posted allocations do not overpay a charge | PASS |
| 16–18 | Receipt numbers unique; expense numbers unique; reversal audit fields complete | PASS |
| 19–20 | Paid payroll items have a posted expense; no duplicate payroll-expense links | PASS |
| 21–24 | Advance outstanding amounts bounded; salary agreement dates valid; salary agreements do not overlap per staff member; voided expenses have reason and timestamp | PASS |

### Scope and limitations
- Current row counts at test time: 2 school payments, 0 payment allocations, 1 learner charge, 0 school expenses, 0 payroll items, 0 salary agreements and 0 advances.
- The checks passed, but empty payroll/expense tables make some payroll/expense invariants vacuously true. They do not prove the workflows work end to end.
- Inspected RLS policies: payments, charges, allocations, expenses, salary agreements, salary advances, payroll items, payroll periods and daily collection records are administrator-scoped where applicable; staff have a separate own-advance SELECT policy.
- Inspected payroll triggers: attendance deductions run before payroll item insertion; paid payroll items create a linked salary expense; approved advance recovery is settled on payroll status transition. The expense trigger requires an Approved/Part-paid payroll period and a Salaries & wages category.
- Inspected database constraints for positive UGX amounts, unique receipt/expense identifiers, one expense per payroll item, valid payment methods/statuses, and bounded advance balances.
- These were read-only structural and current-data integrity checks. No authenticated administrator/bursar/teacher session was simulated; no RPC transaction, concurrency, receipt print, thermal printer or payroll workflow was executed.

**Still pending:** isolated test-environment transaction tests for payment posting/reversal, expense voiding, payroll payment/expense creation, advance recovery, daily collection refresh, role-specific browser workflows, and standard/thermal receipt printing. Do not use existing school records as test fixtures.
