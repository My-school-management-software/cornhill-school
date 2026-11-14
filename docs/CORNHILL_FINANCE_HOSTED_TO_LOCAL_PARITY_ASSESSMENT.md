# CORNHILL Finance Hosted-to-Local Parity Assessment — Pass 1

Date: 2026-11-14
Branch baseline: `7022cbe98fe8226ad98a32469ae030e71e2fd255`
Scope: read-only comparison of hosted finance migrations and local migrations 001–016. No hosted database, local Windows database, learner records, payment records, or production settings were changed.

## Executive result

The local database has a usable finance foundation, but finance parity is not complete. Do **not** create migration 017 merely to mirror table names. First translate each hosted workflow into explicit local server operations, authorization checks, state transitions, audit events, evidence handling, and tests.

## Existing local finance foundation

Inspected local migrations:
- `007_local_finance_foundation.sql`: fee catalogue, fee obligations, bursary validation, payment records, allocations, receipt snapshots, notification outbox, finance audit events, and balance view.
- `010_local_finance_payment_posting.sql`: controlled payment posting.
- `011_local_finance_learner_lookup_api.sql`: scoped learner lookup.
- `012_local_finance_audited_receipt_reprints.sql`: receipt reprint audit.
- `013_local_finance_credit_allocation.sql`, `014_local_finance_credit_source_lookup.sql`, `015_local_finance_credit_allocation_recovery.sql`: retained-credit allocation and recovery controls.
- `016_local_finance_payment_recovery.sql`: actor-scoped recovery of an uncertain payment request.

These are implementation foundations, not proof that hosted finance table definitions, policies, routines, triggers, grants, and data semantics have been reconciled.

## Hosted finance object groups identified

The source table-name inventory includes these finance-related groups:

| Hosted source objects | Business purpose | Local parity observation |
|---|---|---|
| `fee_items`, `fee_schedules`, `learner_charges`, `school_payments`, `payment_allocations`, `daily_collection_records` | Fee catalogue/schedules, learner charges, collections, payment ledger and allocation | Local fee catalogue/obligations/payment/allocation/receipt foundation exists; exact column, constraint, status, trigger, policy and workflow parity remains unverified |
| `expense_categories`, `school_expenses` | Expense classification and posted expense ledger | Local migration 007 has an audit event category for expenses, but the inspected local migrations do not yet provide the hosted expense ledger/workflow |
| `school_finance_operator_limits`, `school_expense_requests`, `school_expense_request_events` | Bursar limits and controlled expense request/approval/evidence workflow | No corresponding local workflow found in migrations 001–016 |
| `school_bank_accounts`, `school_bank_transactions`, `school_bank_transaction_events` | Bank account register, deposits, withdrawals, decisions and event history | No corresponding local banking ledger/workflow found in migrations 001–016 |
| `evidence_capture_devices`, `evidence_capture_requests`, `evidence_capture_files`, `evidence_capture_reviews` | Phone-assigned evidence capture and administrator review | No corresponding local evidence-capture subsystem found in migrations 001–016 |

The finance-related source inventory also depends on staff identities, active-employment checks, role/title checks, audit records, and private storage. Those dependencies must be included in the local design rather than copied as isolated finance tables.

## Hosted workflow controls observed in source migrations

1. **Bank deposits:** an authorised finance operator selects an active school bank account; a deposit is not considered verified simply because it was entered. It waits for evidence captured through an active, assigned phone and administrator verification.
2. **Bank withdrawals:** a withdrawal begins in an awaiting-approval state. Approval and evidence are separate stages; rejection requires an administrator and a reason, and records a transaction event. An unapproved withdrawal must not be counted as a verified bank balance movement.
3. **Direct-write protection:** hosted bank transaction table writes are revoked from ordinary client roles; guarded RPCs and evidence-review triggers own state changes.
4. **Expense requests:** a bursar request is not posted to the expense ledger until the approval/evidence workflow reaches its verified state. Non-admin operators require an enabled administrator-set single-expense limit and daily limit. The request path checks both.
5. **Auditability:** approval, rejection and evidence decisions have event records. Local replacement must make audit writes transactionally reliable and must not silently accept a financial state change when its required audit event fails.
6. **Bank account allow-list:** the inspected source includes a school-specific institution constraint. The exact approved institution list must be confirmed as a school configuration decision before local implementation; do not hard-code it from an unreviewed snapshot.

## Gaps and required local work

| Work item | Status after this pass | Required next evidence |
|---|---|---|
| Full finance table-by-table definitions | NOT VERIFIED | Capture every column, constraint, index, FK, owner, grant and RLS policy for each finance source table |
| Finance RPC/routine translation | NOT VERIFIED | Extract all finance routine bodies, owners, grants, search paths, transaction boundaries and callers |
| Expense categories and posted expense ledger | GAP IDENTIFIED | Design local tables/API, posting rules, reversals, audit and reconciliation |
| Bursar expense limits | GAP IDENTIFIED | Local admin-only limit-setting route; atomic daily-limit enforcement under concurrent requests |
| Expense request approval/evidence | GAP IDENTIFIED | State machine, separation of requester/approver where required, reasoned rejection, evidence verification, duplicate prevention and event audit |
| Bank accounts and transactions | GAP IDENTIFIED | Local account register, safe account identifiers, deposit/withdrawal workflow, approval, evidence, event history and balance calculation |
| Phone evidence capture | GAP IDENTIFIED | Device enrollment/assignment, short-lived requests, private file storage, content validation, review/re-request, expiry and audit |
| Finance permission matrix | NOT VERIFIED | Translate source policies into explicit local role/resource/action checks; verify Bursar, Deputy Bursar, Director and other admin boundaries |
| Offline behavior | BLOCKED pending workflow design | Financial posting, bank approvals and evidence verification must not be replayed as ordinary offline drafts without explicit idempotency and approval safeguards |
| Automated tests | NOT RUN for new work | Add route, authorization, state-transition, concurrency, audit-failure, duplicate, expiry and PostgreSQL migration tests after design |

## Migration decision

**No migration 017 is justified by this inspection alone.** The identified gaps are real, but the next migration must follow a reviewed local design that includes the finance APIs, permissions, evidence subsystem dependencies and test strategy. A table-only migration would be incomplete and could create unsafe write paths.

## Safety boundary and verification

- This pass was repository-source inspection only.
- No hosted Supabase data or settings were changed.
- No user's Windows PostgreSQL database was changed.
- No migration beyond 016 was created or applied.
- No finance parity rows are marked VERIFIED.
