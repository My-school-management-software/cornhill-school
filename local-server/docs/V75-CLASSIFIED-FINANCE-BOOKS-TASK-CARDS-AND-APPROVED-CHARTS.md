# CORNHILL V75 — Finance Centre, Income/Expense books and role-scoped task cards

Director request dated 28 November 2026: the entire Bursar/Finance page is overcrowded and its School Income A / Activity Income B / School Expense A / Activity Expense B classifications are not separated or explained sufficiently. Keep **Finance** as one top-level navigation entry, but open distinct, professionally designed task panels for each: four books, set fees, bursaries, pupil account balances, expenses, banking, bank reports, expense/bank approvals, receipt reprints and historical records.

## V75 local Windows UI package (staged, not yet accepted)

- Conversation ZIP: `CORNHILL-V75-FINANCE-CENTRE-REORGANISATION.zip`. It targets the exact three V54 Finance UI sources `local-server/public/bursar.html`, `bursar.css` and `bursar.js`. It does not overwrite other modules, access the DB, restart the server or activate any new posting endpoint.
- Strict source SHA256 checks against the user's 28 Nov V54 read-only source snapshot, SHA256 for all package fragments, PowerShell 5.1 BOM, Node source syntax check, 13 automated source regression tests, backup and rollback. On unexpected source edits it refuses rather than overwriting.
- Independent cards for Income A (school money: fees, school charges, breakfast/lunch, boarding, uniforms), Income B (activities: graduation/trips, Western Paradise, mock/pre-mock, municipality), Expense A (food, firewood, utensils, medical, salaries, development, maintenance, sanitation, academic and office/classroom supplies, communications, transport, miscellaneous), Expense B (expenses funded from those activity funds). Item descriptions are *school-requested categorisation guidance*, not claims that classifications/values are posted.
- True classified totals and small four-book bar charts appear **only after a permitted user loads a finance report** and the existing authenticated API returns validated UGX book totals. Income is net of reversals, spending uses actual posted categories, missing data is shown as a dash, and locally verified data is never labelled as cloud-synchronised. Financial report print snapshot includes the approved chart when available.
- In-app cards show only sections with backend-confirmed visibility derived from existing finance permissions; only one pane is shown at a time. Ordinary Director oversight does not automatically gain payment-posting controls. No new payment/expense/fee writes.
- Desktop 1280px and phone 390px synthetic previews passed without horizontal overflow; synthetic navigation switching and test ledger response rendering passed. Tests are **13/13**. Installed Windows acceptance is still pending.
- Requires user to test Bursar role, Director role, book reports, receipts, fee settings and mobile width. For V54 baseline SHA mismatch, request *source-only* Bursar review ZIP rather than force patch.

## Separate open operational issue: duplicate local server

After V74 install, Director ran `npm run start:auth` in a second PowerShell session and got `EADDRINUSE 127.0.0.1:4174`. This means another process already owns port 4174; it does **not** prove V74 handler loaded in the active process. To activate the V74 protected route, stop the original CORNHILL listener in its PowerShell window with Ctrl+C and start exactly **one** instance. Do not kill unrelated Node processes, delete data, or change the port without deliberate approval. V75 static UI patch does not require a restart itself.

## Nonnegotiable safety

The school Windows DB has 140 applied source-matched migrations while the older GitHub V50/V70 lineage has only 100 with collisions at 096–100. No migrations, finance sync, live payments or new high-risk permissions. Historical payment identity mismatch: 9 local vs 8 cloud posted payments, no verified cross-ledger receipt match. Five full-system release blockers remain 0/5 independently cleared.

**This document is a task/acceptance record. It does not assert V75 is installed on the Director's computer.**
