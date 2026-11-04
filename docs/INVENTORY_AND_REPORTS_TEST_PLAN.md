# Inventory and school reports verification plan

## Safety boundary
- Apply `202611040015_inventory_stock_ledger.sql` only to a separate staging Supabase project first.
- Do not apply this migration to production until reviewed and explicitly approved.
- Use test accounts only; do not place real school stock or learner data in staging without authorization.

## Inventory role and access tests
1. Signed-out / anon requests to `inventory_categories`, `inventory_items`, `inventory_movements` and `inventory_stock_summary` must be denied.
2. A Teacher or Staff account must not read or modify inventory tables or the stock summary.
3. An Admin account can create a category and item, then read the stock summary.
4. Receive 10 units; verify the balance becomes 10.
5. Issue 4 units; verify the balance becomes 6.
6. Attempt to issue 7 units; the database trigger must reject it and the balance must remain 6.
7. Confirm movements cannot be updated or deleted through the authenticated API.
8. Confirm low-stock status is raised when on-hand quantity is less than or equal to the reorder level.
9. Verify concurrent issue attempts cannot drive stock below zero.

## School reports tests
1. Admin report summary should match the count of active learner rows, class rows and assessments.
2. Class counts should match the learner register grouped by class, including an Unassigned group when applicable.
3. CSV export should open as UTF-8 in spreadsheet software and contain only admission code, learner names, class, gender and LIN.
4. Confirm guardian name/phone/email, address, bursary details, and SMS consent are absent from the CSV.
5. Teacher, Staff and Demo roles must not open the reports panel or invoke the export.

## Browser regression
- Test phone width and desktop width.
- Test item/category forms, duplicate item codes, decimal quantities, empty inventory, and database-unavailable messages.
- Test report refresh with zero learners and with active/inactive learners.
- Verify no action reports success when the database returns an error.

## Current status
- Source syntax checks and static element-reference checks pass.
- No browser end-to-end or staging database test has yet been performed.


## Finance and academic report export checks
1. Generate class performance for a selected term/class; export CSV and confirm tied percentages retain shared competition positions.
2. Confirm academic CSV contains only the selected class/term and includes code, learner name, subject count, marks, maximum and average percentage.
3. Generate fee collection report with and without term/class filters; export CSV and reconcile each class row to the displayed totals.
4. Generate cash collection report for a Uganda-local date range; export receipt audit CSV and reconcile receipt numbers, statuses, methods and UGX amounts.
5. Open all three exports in spreadsheet software; confirm UTF-8 names and correct comma/quote escaping.
6. Verify teachers can export only the class results already available to their assigned class, while finance exports remain administrator-only.

## Offline and fingerprint acceptance gates
- Offline academic drafts must be retained without sending financial payments or issuing receipts while disconnected.
- On reconnection, sync must authenticate the current user, re-check teacher class assignment, detect server-side mark changes and present conflicts rather than silently overwriting newer marks.
- Do not cache Supabase auth/API responses or confidential learner records in the service worker.
- Fingerprint-device acceptance requires the exact make/model, firmware, supported export/API protocol, USB driver/bridge, and a physical test terminal. A CSV import is not proof of live biometric integration.

## Daily Collections & Records / duplicate receipt tests
- [ ] Post payments for multiple learners in different classes on one Kampala-local date, with different purposes (fees, sweater, sportswear, graduation and a custom item).
- [ ] Confirm the database creates/refreshes one `DCR-YYYYMMDD` record for that Uganda date, with correct receipt count, totals by item, overall total and learner/code/class details.
- [ ] Confirm a payment posted near midnight is grouped by Africa/Kampala local date, not UTC date.
- [ ] Confirm a reversed receipt remains visible as Reversed and is excluded from posted collection totals.
- [ ] Search the daily record by learner name, admission code, class, receipt number, payment method and item; confirm no unrelated day is included.
- [ ] Print the A4 daily sheet and verify all learner rows, category totals, date, record number and signatures fit legibly.
- [ ] Print a new thermal receipt and a reprinted receipt on both 58 mm and 80 mm rolls; verify payer and school copies have identical receipt numbers and amounts, and both signature lines are visible.
- [ ] Confirm payer name and custom payment reason persist after refreshing the app and are present on receipt reprints.
- [ ] Confirm teacher/non-admin accounts cannot read, refresh or modify daily collection records.
- [ ] Perform these checks with a real test learner before using the feature for actual school collections. Do not create dummy financial payments in the live school ledger.

## Receipts amount in words
- [ ] Verify new payment receipts show both UGX figures and correctly spelt English amount, including UGX 1, 20, 105, 1,000, 125,000 and larger school payment amounts.
- [ ] Verify receipt lookup/reprint also shows the same amount in words as the original payment.

## School expenses and payroll
- [ ] Create expense entries for examinations, tests, food, utilities, teaching materials, transport and repairs; verify categories, UGX totals, CSV and A4 print.
- [ ] Void a test expense with a reason; confirm it remains in the register, displays Voided and is excluded from posted totals.
- [ ] Add a staff profile and a monthly salary agreement; create a monthly payroll period and verify only active monthly agreements covering the dates are included.
- [ ] Repeat for termly and yearly salary agreements and confirm they are not mixed across payroll frequency.
- [ ] Close an old salary agreement, enter a new effective salary and confirm past payroll remains unchanged and the new agreement applies only to its dates.
- [ ] Confirm overlapping active agreements for the same staff member and frequency are rejected.
- [ ] Confirm payroll cannot be paid before approval; approve it and record an actual salary payment.
- [ ] Confirm one salary expense is created automatically with the correct staff name, UGX net pay, date and payment method; verify repeated attempts cannot create duplicate linked expenses.
- [ ] Test allowances and deductions, including invalid deductions greater than gross pay.
- [ ] Confirm staff/non-admin accounts cannot view salary agreements, payroll, or expenses.
- [ ] Perform final payroll tests with the actual authorized staff list and approved salary amounts; never use guessed salaries.
