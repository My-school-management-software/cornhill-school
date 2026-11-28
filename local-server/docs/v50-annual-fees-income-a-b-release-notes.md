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
3. Academic term/year advancement, P.7 graduation batch approval, and materials reset workflows from V50 are **NOT IMPLEMENTED** on this branch.
4. SQL migrations 098-100 have not been run on a disposable PostgreSQL 17 clone. Do not apply them to the working school database without clone testing, data backup, and separate Director approval.
5. Verify old accounting classifications before accepting historical Income A/B reporting; the new view classifies historical allocations using the fee item's current category, so classification changes could affect old reports.
6. Reconcile finance summaries with original posted payments, retained-credit allocations, reversals, and receipts. Never use income totals for bank reconciliation before verification.
7. Verify that the updated staff-session query has the necessary runtime SELECT permissions, without granting additional broad access.
8. Resolve HTTPS process startup discrepancy, PostgreSQL non-loopback listener security, and the five existing installation blockers separately.

## Acceptance requirements
Run full source checks and `npm run verify:release`, then isolated PostgreSQL 17 migration and finance tests; verify mixed school-fee + graduation + exam + trip allocations; print on 58mm and 80mm printers, reconcile Income A/B, and test P.7/term promotion independently before a live installation.
