# CORNHILL Staff Operations & Payroll Batch 17

## Ten connected migrations: 064–073

This batch adds practical staff workflows beyond attendance capture:

- Staff leave requests with draft/submission/review/cancellation states, independent approval, immutable submitted details and overlap prevention.
- An append-only leave balance ledger for accrual, approved usage, adjustments and reversals. Usage must match an approved leave request, and the balance cannot fall below zero.
- Append-only daily attendance review events with a reviewer distinct from the employee and identity matching against the original attendance day.
- Security-invoker views for monthly attendance summaries, attendance review queues, leave review queues and leave balances.
- A payroll disbursement register for cash, bank transfer and mobile money evidence. It only records payments against posted payroll; it does not send money or connect to a bank/mobile-money provider.
- Independent payment verification, protection against paying more than net salary, immutable final evidence and a reconciled per-employee payment summary.

Six new staff permissions are added to the catalogue. No permissions are automatically granted to roles.

## Verification plan

The Windows test inventory now covers 73 transactional migrations. A new focused static suite checks all ten migration definitions. PostgreSQL verification exercises leave submission and overlap, approved leave usage and negative-balance rejection, immutable attendance reviews, payroll disbursement separation, overpayment prevention, and payment summary reconciliation.

## Safety and completion boundary

No salary deduction is automatically triggered by attendance or leave. The payment register is an audit and reconciliation record, not a payment processor. Role grants, user-interface screens, operational payroll policy, and real payment-provider integrations remain separate work.
