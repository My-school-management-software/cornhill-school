# CORNHILL Banking & Daily Deposits

## Purpose
The separate Banking workspace supports daily deposits, controlled withdrawals, Bursar/Deputy Bursar expense requests and administrator oversight. Amounts are recorded in UGX.

## Current workflow
- An active Admin, Bursar or Deputy Bursar can record a bank deposit. A deposit requires an active authorised capture device and creates a bank transaction plus a ten-minute phone evidence request linked by the transaction ID.
- A deposit contributes to the displayed verified bank balance only after an administrator approves the bank slip in Evidence Capture.
- A withdrawal starts as Awaiting approval. Only an administrator can approve or reject it. Approval selects an authorised phone and issues a ten-minute evidence request. Only approved withdrawal evidence affects the verified balance.
- A Bursar/Deputy Bursar expense starts as a request and is not a posted school expense. The administrator sets a per-expense and daily limit through a guarded RPC. The database checks the limits, active staff status and job title.
- An approved expense is paid first, then its receipt/invoice is photographed. The existing School Expenses ledger is updated only after the administrator approves the receipt evidence.
- A clearer-photo decision creates a separate ten-minute replacement request. The original file and review stay in the audit history.
- Bank balances are calculated from the opening balance plus verified deposits less verified withdrawals. Pending, rejected or cancelled items do not alter the displayed verified balance.

## Roles
- Admin: registers bank accounts, views all authorised devices, sets bursar limits, approves/rejects withdrawal and expense requests, and verifies evidence.
- Bursar/Deputy Bursar: records deposits and submits bounded expense requests. A non-admin bursar can send deposit evidence requests only to their own active authorised phone. They cannot approve withdrawals, change spending limits or approve evidence.
- Other roles: no banking workspace access.

## Security controls
- Bank transaction reads use RLS for active finance operators.
- Direct client INSERT/UPDATE/DELETE privileges on school_bank_transactions are revoked. Transaction creation and state changes are performed only by guarded RPCs or database evidence-review triggers.
- Bank slip and expense files use a private Storage bucket with a 15 MB per-file limit and JPEG, PNG, WebP or PDF MIME allowlist.
- Admin review actions are stored separately from uploaded files. A photograph alone does not approve a transaction.
- School bank account balances are shown through a security_invoker view and require the same finance-operator access as the underlying records.

## Current validation boundary
Database schema and workflow functions exist in the connected Supabase project. The latest code is committed on the development branch. No real bank accounts, deposits, withdrawals or expenses were inserted for testing. No test transaction was posted to a school's live ledger. Browser interaction with real staff accounts, live phone notification delivery, and current-commit Vercel deployment still require external runtime verification.
