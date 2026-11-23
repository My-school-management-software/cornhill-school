# CORNHILL V124C — Finance balances and Director oversight implementation contract

Status: **DESIGN / SAFE STAGING ONLY**. This branch is based on the last GitHub integration branch commit `b4c5bf5` (2026-11-17), **not** the user's newer local V124B staged source. Do not merge or deploy until the newer Windows source is compared and reviewed. No database migration or live configuration is authorised by this document.

## 1. Account boundaries

| Action | Bursar | Deputy Bursar | Director |
|---|---|---|---|
| Record payment and issue original receipt | Yes | Only if separately granted | **No** |
| Look up learner and account balance | Yes | As granted | Yes, read-only |
| View all-learner balance sheet and collection summaries | Yes | As granted | Yes, read-only |
| Request transaction corrections/reversals | As granted | As granted | Review and approve/reject |
| Configure fee schedules, delegations, and financial policy | No | No | Yes, through audited workflows |
| Amend or delete posted receipt values directly | No | No | No |

The Director's dashboard is an oversight/control surface, not a second fees-collection screen. Avoid linking its ordinary navigation to a writable Bursar payment screen. Enforce this boundary **server-side on every mutation endpoint** as well as in UI visibility. Broad Director permissions must not implicitly grant `finance.payments_record`; review existing permission inheritance and migrate safely only after approval. Account-specific Bursar permissions should not be granted merely because an account can view reports.

## 2. Pupil Account Balances Sheet

Place a balance-sheet view in Bursar/Deputy Bursar > Fees Collection and Director > Finance Reports & Oversight. Both consume the same protected **read-only reporting service** and authoritative finance ledger/snapshot; do not duplicate balances in browser storage or create a second finance ledger.

Columns: learner name, permanent learner code, class, year, term, previous-term outstanding, current-term billed charges, current-term payment allocations, approved bursary/adjustment totals, current-term outstanding, overall outstanding, payment status. Provide drilldown for itemised history, receipts and allocations. Display **one combined amount due** as the canonical headline; explanatory components may be shown without changing the combined-balance policy.

Support search by learner name/code, class/year/term/status filtering, pagination, stable sorting, authorised A4 PDF/print and CSV/Excel-compatible export. A real .xlsx export may be added only with a verified writer and an approved data contract. Do not export PINs, passwords, guardian private contacts, evidence, session tokens or unnecessary identifiers. Encode CSV defensively against spreadsheet-formula injection. Limit large exports and record audit metadata.

Totals: across **exactly the filtered result set**, and separately disclose all-school totals when authorised. Differentiate receipts collected from allocations against balances, retained credits, reversals, bursary relief and cash collected; do not double-count. Use integer UGX and show the as-of timestamp. Avoid treating unallocated credit as settled debt before an authorised allocation.

Snapshot consistency: report rows and totals under the same database transaction/snapshot. Never calculate authoritative balances solely in JavaScript. Guard against a deleted/withdrawn learner disappearing from historical reporting; explicitly distinguish active and historical scope.

## 3. Read-only API and access controls

Suggested contract (verify existing route conventions before implementing):
- `GET /api/v1/finance/reports/pupil-balances?year=&term=&class=&status=&query=&page=&pageSize=`
- `GET /api/v1/finance/reports/pupil-balances/export?format=pdf|csv|xlsx&...`
- `GET /api/v1/finance/reports/collections?period=daily|weekly|monthly&...`

Use separate `finance.reports_view` and optional `finance.reports_export` permissions where compatible with the actual permission catalogue. Never protect reporting solely with `finance.payments_record`. Authenticate all calls; explicitly authorise the Director and authorised financial roles. Deny anonymous/guardian/teacher access unless narrowly and separately authorised. Error responses must not leak financial rows or SQL internals; protect exports from caching and cross-origin access.

Mutating `POST` routes for ordinary fee collection must reject the Director principal even if its other administrative permissions are broad. Keep CSRF, session, idempotency, actor attribution, and database permissions. Report viewing **must not** call payment-posting operations.

## 4. Reconciliation and audit

- Preserve source-of-truth ledger, immutable receipts, authorised reversals and append-only audit events.
- Preserve current-term-first allocation with explicit previous-term allocation and optional skip.
- Reconcile opening debt + current charges - authorised relief - allocated payments +/- approved corrections = closing outstanding, using actual existing ledger semantics. Account separately for retained credit.
- All authorised Director changes must have actor, timestamp, reason, before/after or referenced event, independent reviewer where required.
- Avoid direct SQL edits of receipts or fake payment records to correct balances.
- Preserve official receipt reprinting and receipt number history.
- Identify historical handling of withdrawn/re-admitted learners before writing migrations.

## 5. End-to-end acceptance tests (synthetic data only)

1. Bursar posts one UGX payment -> receipt created exactly once -> same balance appears on both reporting screens.
2. Director can read rows and totals but is denied ordinary payment mutation at HTTP and database permission boundaries.
3. A normal teacher and guardian cannot enumerate balance-sheet rows.
4. Deputy Bursar with no reporting privilege is denied; with reporting privilege reads only authorised scope.
5. Current/previous-term split, skip and repeat reminder produce expected outstanding totals.
6. Partial/full payment, bursary adjustment, reversal and retained credit reconcile correctly and do not double-count.
7. Two simultaneous payments: no stale report writes, duplicate receipt or lost update.
8. Filters, pagination, sorting, year/term boundaries and class subtotals align with exact row set.
9. Export matches the displayed totals and filters, escapes CSV formulas, redacts sensitive fields and has correct no-store headers.
10. Audit logs record report export and authorised amendment decisions, not payment collection by Director.
11. View/report APIs remain read-only and do not alter receipts, allocations or audit transactions except explicitly authorised access logs.
12. Existing finance, leadership, admissions and school-office regression tests continue passing.

## 6. V124B gate status and next integration

Uploaded V124B safe JSON reports `1572 total / 1570 pass / 1 fail / 1 skipped`, `independent_pg17=PASS`, `synthetic_backup_restore=PASS`, `real_logins=NOT_TESTED`, `physical_printer=NOT_TESTED`, `production_install_approved=false`. It does **not** identify the failing test case. Obtain its detailed test log; fix failure without deleting assertions.

The current GitHub branch was last updated **before** V124/V124B local staging. To avoid overwriting newer `public/leadership.html` and other files: compare hashes and use a source-aware three-way merge in isolation before touching runtime files. Test against a disposable PostgreSQL 17 database. Do not run `npm run db:migrate` against the working DB, send real invitations, issue real staff codes, reset accounts or overwrite local source without explicit Director approval.

### Acceptance gate

Report separate statuses for: (a) design, (b) code implemented, (c) isolated tests, (d) approved installation, (e) real-device acceptance. Never use automated-test pass percentage as an overall release-readiness percentage.
