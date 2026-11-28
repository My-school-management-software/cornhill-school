# CORNHILL V50: staged annual fees and Income A/B mixed receipts

## Status
SOURCE CHANGES ONLY — NOT INSTALLED. No working/local/cloud database migrations were run, no real payments posted, and no V49 working-PC changes were overwritten.

## Verified source behavior
- Source branch is based on `feat/cornhill-v49-direct-development-20261128` and does not overwrite the 125 locally modified tracked paths reported by V49.
- Migration 098 adds year-scoped approved School Fees decisions. The Director can approve Initial, Continued, or Revised rates only while a new year is Planned; annual rate decisions cannot be edited. Income B item price histories can receive dated revisions during the same year, without changing posted receipts.
- Migration 099 classifies individual allocations into Income A/B; posted retained-credit allocations are included once, not counted while unallocated. New receipt snapshots include each item's paid amount, independent remaining balance, income group, academic year/term, and receiving staff's legal name. Existing receipts remain unchanged.
- Migration 100 exposes Income A/B per learner obligation.
- The bursar screen supports one transaction allocating to multiple existing obligations (up to 100; this functionality already existed) and now shows separated receipt detail and a read-only Income A/B report.
- Staff session display names use staff legal names with username fallback.

## Critical release limitations
1. A full school-fee configuration/approval UI and a controlled Income B price/charge creation flow are **NOT YET IMPLEMENTED**. Migrations are not a substitute for operable settings screens. Present fee obligations still require an authorised creation workflow.
2. Annual rates are stored and immutable, but the legacy fee-obligation insertion/editor path is **NOT YET ENFORCED** to use them. Do not claim the annual fee increase restriction is production-ready.
3. Academic year advancement is now implemented **as source code only**: a Director-authorised reviewer selects each learner in each class and chooses **Promote**, **Repeat**, or **Complete primary school (P.7)**. Unselected learners stay pending. The reviewer can submit 1–100 selected decisions in a single atomic class-level transaction (all succeed or all roll back), or approve one learner. New-year decisions are blocked until the new year and Term 1 are Active. Existing progression events and immutable report cards are retained. **This is not installed or acceptance-tested on the working computer.** P.7 pending learners remain in older legacy class lists until explicitly processed; the new-year advancement review distinguishes pending from newly enrolled learners, but global School Office year-filtering and full period transition remain incomplete. Materials reset workflows are not implemented.
4. SQL migrations 098-100 have not been run on a disposable PostgreSQL 17 clone. Do not apply them to the working school database without clone testing, data backup, and separate Director approval.
5. Verify old accounting classifications before accepting historical Income A/B reporting; the new view classifies historical allocations using the fee item's current category, so classification changes could affect old reports.
6. Reconcile finance summaries with original posted payments, retained-credit allocations, reversals, and receipts. Never use income totals for bank reconciliation before verification.
7. Verify that the updated staff-session query has the necessary runtime SELECT permissions, without granting additional broad access.
8. Resolve HTTPS process startup discrepancy, PostgreSQL non-loopback listener security, and the five existing installation blockers separately.

## Acceptance requirements
Run full source checks and `npm run verify:release`, then isolated PostgreSQL 17 migration and finance tests; verify mixed school-fee + graduation + exam + trip allocations; print on 58mm and 80mm printers, reconcile Income A/B, and test P.7/term promotion independently before a live installation.

## Individual advancement interaction
1. Director opens Academics → Class-by-class annual advancement.
2. Choose one source class and the **new** academic year's Term 1.
3. Review the entire class roster. Every learner defaults to **Not yet decided**.
4. For each learner explicitly choose Promote to the next CORNHILL class, Repeat the same class, or (P.7 only) Complete Primary. Enter a reason.
5. Either approve one learner or **Approve selected learner decisions** for the class. Only selected learners change. The server rejects missing permission, CSRF, invalid/duplicate learner IDs, unactivated periods, and mixed-class submissions.
6. A database transaction prevents a partial class batch; the existing immutable progression-event function records each approved action and keeps old reports.
7. At a new school term **within the same academic year**, do not promote by default. Keep existing class placement and historical marks/obligations.
8. For P.7, new-year readiness review shows pending previous-year P.7 separately. To obtain an empty new-year P.7 roster before P.6 promotions, the global class and finance views still need period-aware roster filtering and acceptance tests.

### SQL/installation status
This feature reuses existing migration 095's controlled `record_learner_progression` procedure; it does not add another database migration. Migration 095 availability in the working database was **not confirmed**. If it is missing, the approval endpoints will not work. Do not apply migrations to real school data without clone rehearsal, verified backup and separate Director approval.
