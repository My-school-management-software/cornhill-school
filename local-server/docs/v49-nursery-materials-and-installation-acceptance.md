# CORNHILL V49 — Nursery materials receiving, teacher withdrawal, Records Centre and installation preparation

**Status: DRAFT. Installation on the Director's real Windows computer NOT approved/performed.**

## Director-approved workflow to implement and accept

1. The School Office records Nursery materials **for each learner individually** (learner UUID, permanent pupil code and class are selected, not typed by the browser). Date, item, quantity and receiving staff are audited in immutable receipts (migration 096).
2. When a teacher collects part or all of a learner's supplies, the School Office records an **issue to teacher** against that learner and item, with the receiving active teacher (assigned to the learner's class), actual Uganda date, quantity, note and office staff account.
3. Materials are not considered consumed simply because a teacher collected them. A **used for learner** entry reduces what the teacher owes back; a **return to School Office** entry increases the office's stock. The system prevents returning/using more than the named teacher holds and issuing more than the office has.
4. A **Director-approved surplus transfer** requires the Director's own logged-in session, an explicit quantity, date, reason and per-unit UGX valuation. This reduces verified office stock but does **NOT** automatically create personal profit, school income, payment receipts, or a financial ledger posting. It is an auditable transfer requiring separate ownership/accounting reconciliation, including any legitimate disposal proceeds.
5. School Office **Records Centre → Nursery Materials** displays each learner's received, issued, used, returned, office remaining, teacher-held outstanding, Director-approved surplus and valuation, with printable A4 layout. Original V47C upper ribbon, Back/Forward/Home, navigation and sign-in are not edited by this change.

## Ledger accounting (for each learner and separately by item)

- Office remaining = received at office − issued to teachers + returned by teachers − Director-approved surplus transferred.
- Teacher outstanding = issued to teachers − materials documented as used for that learner − materials returned.
- Total items still physically held by the school = office remaining + teacher outstanding.
- A teacher handover always identifies the named teacher in the immutable ledger. Historical times and recorder identities are retained.
- No negative balance may be recorded; a transaction-level advisory lock serializes concurrent movements of the *same learner + item*, while an independent transactional SQL check verifies availability on the movement date.
- All movements have unique request UUIDs for idempotency. Server derives **recorder identity from the verified session**; a browser cannot supply an alternate actor ID.
- Teacher must be an active staff account with a teaching role and a current assignment to that learner's class.
- The Director's valuation is not automatically revenue, profit or a payment.

## Installation preparation gates

1. **GitHub**: complete Windows Node24 and isolated PostgreSQL17 workflow checks (full source-syntax/test suite; schema migration 001–097; auth + finance least-privilege checks; backup/restore against a second isolated database). Review latest head, not older passing commits. Merge is intentionally NOT authorized.
2. **Windows PC**: preserve 484 school learners, grades, staff and finance. Record SHA256 of the three accepted V47C interface files; never overwrite the accepted ribbon. Inspect local Git status, pending commits and local migration ledger without sharing `.env`, login details, database passwords or learner exports.
3. **Clone first**: create an encrypted/verifiable local PostgreSQL17 backup outside the repository and rehearse restore onto a disposable database with a different name; validate original learner/payment/academic counts and migration checksums. Stop if incomplete/untrusted.
4. **Explicit separate Director approval required** to apply migrations 096 and 097 to the **working** database. Until then, no school-record or finance writes and no presentation of this draft feature as active in the installed software.
5. **Role acceptance** on disposable data: office receives 5 crayons for one Nursery learner; issues 3 to assigned teacher on dated receipt; teacher uses 2 and returns 1; final office balance is 3, teacher balance 0; Director-authorized transfer of 1 leaves office 2, teacher 0, transfer 1. Other learners' materials unchanged. Repeat identical request ID must not double count; altered request or overspending must return HTTP 409; guardian/unassigned teacher must return HTTP 403.
6. **Records Centre**: Director can print the per-learner ledger; teachers/guardians cannot read Director's school-wide overview. A limited preview must be labelled and **cannot** be mistaken for a complete school-wide financial total.
7. **Sign-off**: manual Windows/phone usability and backup recovery tests must pass; finance cloud 8 vs local 9 payment identity mismatch is unresolved, so **all financial synchronization stays disabled**. Release blockers remain **0/5 cleared** until a separate full-system acceptance.

## No destructive deployment

This branch is a **draft pull request**, not a production deploy. Do not run `npm run db:migrate` or enable LAN/synchronization as part of installation preparation. No destructive rollback or deletion of previously recorded materials: correct an error only through a separately approved, immutable compensating transaction process (not implemented in this phase).

## Acceptance and accounting clarification

The user described remaining materials as 'Director's profits'. Preserve this intent in the workflow as a **Director-authorized surplus allocation**, but do not book personal profit without substantiated ownership, receipt, valuation and finance approvals. Materials physically remaining in the school are an accountable inventory balance, not automatically earned income.

Tracks GitHub issue #77 and draft PR #78.
