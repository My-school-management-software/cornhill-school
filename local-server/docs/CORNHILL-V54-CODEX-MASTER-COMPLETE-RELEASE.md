# CORNHILL V54 — One-Batch Codex Master Implementation and Safe Acceptance Prompt

You are working in the existing local-first CORNHILL NURSERY AND PRIMARY SCHOOL repository. School motto: WE SHARE ONE DREAM. This is a Uganda school. The user is the Director and main owner. Staff work on Windows 10/11, Android and 30+ school devices. Current local source path is C:\Users\hp\cornhill-school with local-server under that folder, Windows PowerShell, Node 24, PostgreSQL 17. Local server is HTTPS loopback at https://localhost:4174. The V52 Guardian Portal correction is successfully installed on the user's working computer and must NOT be overwritten.

## Non-negotiable safety and working practices

- You may inspect, repair and test source code now. Do not change the working school database schema, live school data, cloud Supabase, real bank or financial records, real staff login credentials, or official posted receipts without an explicit separate approval tied to the exact reviewed change. Do not automatically migrate, promote learners, issue fees, post receipts, merge to main or deploy production.
- Keep the hosted CORNHILL site available as fallback. Never erase the 484 learner records or change permanent pupil codes, LINs, admission identifiers, guardian associations, payments or academic histories. Preserve existing staff identities, permissions, accounts and local custom changes.
- The working repository has many locally modified paths (an earlier V49 report counted 125 tracked changes). Never run destructive reset, clean, hard checkout, force pull, or overwrite any existing local file. Before editing, capture `git status --porcelain=v1 -uall` and manifest hashes of selected source; stage/reconcile changes path-by-path using a temporary workspace. Do not print .env credentials, tokens, database passwords, PIN hashes, backups, real personal data or private log contents.
- Don't trust the GitHub branch to match the working computer. Compare V52 local Guardian Portal and all seven workspaces to the tested source before integrating.
- The V50 candidate is GitHub branch `feat/cornhill-v50-annual-fee-income-groups-20261128`, draft PR #79. Source updates through V54 may be ahead of the installed computer. This branch is **not** a green light for live migrations; use only as a candidate and compare with local source.
- Provide one or two LARGE PowerShell batches, not many repeated tiny commands. If a test fails, automatically diagnose, fix code, rerun the targeted test, and include the result in a single safe JSON report saved to Downloads. Report real % for known checks and never invent a system-wide 98% completion estimate.

## Phase A: Full inventory, accurate parity and local data safety

1. Identify actual local Git branch/HEAD, all 7 module shell and API changes, migrations applied (SELECT only), and Windows install/desktop/native versions without displaying private credentials.
2. Inspect independent staff/parent/finance authentication, class assignments, Director-only permissions, read-only staff offline access, kiosk device control, local HTTPS and service worker. Test that two accounts cannot open each other's data.
3. For every source module (School Office, Academics, Finance, Leadership, Staff Operations, Attendance/Imports, Guardian Portal), trace each UI action to a protected handler, repository and required DB function. Compile concrete API parity diffs and fix missing routes **in the reviewed source workspace**.
4. Treat failed `workspace-api-contract-batch` tests as possible local V52 fixture/source drift; repair matching source/tests without weakening the contract or removing functionality.
5. Compute table counts by reading the database only if configured read-only. Preserve actual target count 484 and reconcile learner identities with source IDs, without exporting names/guardian phones into public logs.
6. Payment identity safety gate: prior V20 comparison: cloud 8 Posted, local 9 Posted, 0 matches by learner+amount, payment method or date. Never assume which nine are legitimate and never sync/post/replay them without a human-verified immutable receipt match. Return `FINANCE_SYNC_SAFE=false` until resolved.
7. Require verified encrypted PostgreSQL 17 backup plus checked restore into a disposable DB before every working-db migration.

## Phase B: Academic year, term and learner-by-learner advancement

1. The school Director/authorised reviewer must decide for **every individual learner** whether Promote to next level, Repeat same level, or for P.7 Complete Primary. A learner not selected remains pending. Term changes never promote automatically.
2. Show a complete class-scoped roster with statuses Pending, Approved/Promoted, Repeated, Graduated. Filter all new-year class screens by academic period so older P.7 candidates don't appear as current new-year P.7 learners before approved processing. Preserve previous-year histories, guardian links and financial balances.
3. Enforce manual explicit confirmation, reason, role and class permissions, CSRF, transaction locks and idempotent duplicate decision rejection. Batch 1–100 selected learners must be all-or-nothing. Never advance whole school by year activation.
4. Classes Baby/Middle/Top/P1–P7. Curriculum: Nursery 7 learning areas (including Numbers), P1–P3 six, P4–P7 four. Existing P4–P7 grading is UNEB; respect the school band cutoffs, sets, P6/P7 aggregates, P7 index numbers and missing marks rules. Never invent division bands not authorised by school.
5. Build and verify A4 report cards, one page per learner; nursery feedback and P7 graduation history. Do not delete or mutate immutable report-card snapshots.
6. Link annual material obligation periods and repeaters without accidentally resetting last year's paid or issued items.

## Phase C: Finance, annual rates, Income A/B and official receipts

1. Implement Director-reviewed annual School Fees rate UI per class and Day/Boarding. Continue previous year's rate by default, or approve a documented revision once for a new Planned academic year. Only future year fees are affected; never reprice old obligations or edit posted receipts. Source migration 098 stores rate approvals but user-facing approval workflow and charge enforcement are incomplete.
2. Expose a secure, audited Income B price-change UI by year and effective date for graduation, Top Class graduation, mock/pre-mock, municipality exams, trips and Western Paradise. Restrict to authorised finance fee managers. Do not allow arbitrary historical edits.
3. Income A items: School Fees, breakfast, lunch, boarding, uniforms and approved school incomes. Income B items: graduation, trips and special exams. Keep Income A and Income B totals separate but allow one receipt with multiple line-item allocations and the individual remaining balances. Handle retained credit once, reversals, split payments, previous-term debt reminders, bursary and boarding hair fee 3,000 UGX. Avoid reclassifying historical transactions without evidence.
4. Link Expense A categories to Income A and Expense B categories only to Income B, using independent approval, evidence requirements and dates. Preserve bank account references and school history without exposing full account numbers.
5. Separate finance.reports_read access from finance.payments_record; report readers must not be able to post payments and payment-only staff must not see restricted income reports. V54 source includes this repair; integrate after local parity review.
6. Official thermal 58mm and 80mm receipt preview, recipient staff legal name, amount in words and figures, learner permanent code/class, item allocation, Income A/B totals, current and previous balances and reprint audit. No fabricated receipt numbers. Verify receipt/ledger consistency using synthetic disposable data only.
7. Protect all financial mutation routes with role permissions, TLS, CSRF, idempotency, immutable payment/receipt evidence and independent approvals.

## Phase D: Parent Portal, materials, attendance, staff & permissions

1. Preserve installed V52 Parent Portal. **Always use learner permanent code first, then school-registered guardian telephone, then school-issued PIN**. Staff issues PIN after verifying registered guardian contact; do not automatically disclose PIN. Guardian can view only approved learner data; siblings only if separately approved. Reject revoked links/changed contacts and prevent enumeration.
2. Parent Portal must preserve report cards, finance, term dates, learning resources and school notices; never expose staff internal data.
3. Nursery materials are physically collected from the office and recorded per learner, item, quantity, date, staff issuing/receiving and outstanding quantity. Migrations 096–097 need reviewed clone acceptance, not blind application. Print individual material checklists.
4. Director alone controls staff code issuance/revocation and explicit user permissions. Teachers, Headteacher and DOS sign in with Director-issued codes. Bursar/Deputy use email-password invite verification plus Director approval. Protect payroll/finance separation.
5. Attendance kiosk limited to authorised devices; school policy manages clock-in/out, break, special morning/evening/Saturday sessions, absent/late/approved reasons, salary deductions and audit history. Run synthetic payroll/attendance regressions.
6. Verify uploaded Excel learners/staff, duplicate guard, code/LIN, guardian phone normalization and import preview; do not overwrite real user data.

## Phase E: Local-first installation, hardware, offline and GitHub CI

1. Protect Windows localhost HTTPS service and PostgreSQL 17. PostgreSQL must never be exposed unauthenticated on the school LAN. A separate authenticated HTTPS LAN gateway is required, with proper server certificates, network allowlists and per-role sessions. Do not turn PostgreSQL port 5432 into public listener to make phones connect.
2. Maintain usable local mode without internet and a secure reconnection process. Implement/test conflict resolution, write queues, source IDs, idempotent replay, role/session expiration and encryption. Never replay irreversible finance posts until identity reconciliation.
3. Stage unsigned/test-only Windows EXE and Android APK builds if toolchains permit, with clear no-distribution labels; a trusted code-signing certificate / Android private keystore remain separate adult-administrator responsibilities. Do not fake or auto-generate official signing credentials.
4. Run npm/Node syntax checks, isolated PostgreSQL 17 migrations 001–latest, synthetic attendance/finance/guardian/academic regression, and backup+restore from a disposable DB; retain named pass/fail evidence, and do not claim unexecuted tests passed.
5. Test 30+ device LAN acceptance or mark as NOT RUN. Desktop start/stop/restart and printer access need acceptance.
6. Fix code/test failures on a safe source branch and push reviewed changes to PR #79. Never merge to production without release gate evidence.

## Deliverables (one consolidated report)

- `CORNHILL-V54-COMPLETE-RELEASE-REVIEW.json` in Downloads with source branch/HEAD, changed file counts, tests passed/failed/skipped, blocked/cleared release gate codes, migration ledger stage, backup/restore state, learner/source parity and posted payment reconciliation status, secrets/database writes all false; don't include private records.
- `CORNHILL-V54-SAFE-INSTALL-PLAN.md` with exact prerequisites and rollback for Windows 10/11 and Android, no unknown credential assumptions.
- A conflict-safe Windows source installer that snapshots the **exact** local affected paths, preserves V52 customisations, stages work before replacing files, runs focused tests, and rolls back if anything fails.
- An isolated clone-only migration installer gated behind a reviewed, testable backup; a separate Director-approved working migration option later. Never run live migrations during this Codex batch.
- Clear progress percentages: percent of tests actually passed; 0/5 or proven number of formal release blockers cleared; never an invented global 98%. Where blocked, report exact blockers and next approved action.
- Avoid further micro-prompts. Complete as many safe source development and test tasks as possible in this batch, then return the consolidated results.
