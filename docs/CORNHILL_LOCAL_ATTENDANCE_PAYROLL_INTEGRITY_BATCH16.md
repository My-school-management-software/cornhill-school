# CORNHILL Staff Attendance & Payroll Integrity — Batch 16

## One connected batch: migrations 054–063

This batch tightens the linked device → attendance → review → salary → payroll path:

1. A date-ranged fingerprint terminal staff-ID mapping, restricted to active staff and protected against overlapping mapping periods.
2. Device attendance imports resolve each terminal user ID to its mapped CORNHILL staff account, use the Africa/Kampala event date, require the matching processing batch and start as pending review.
3. Import batches have a one-way lifecycle, exact final row totals, retained-event reconciliation and immutable completed/failed records.
4. Terminal identity cannot be rewritten or deleted once mapping or event history exists.
5. An ordinary attendance incident must match the staff member and date on its source attendance day.
6. Salary agreements require an active independent approver and cannot be rewritten after linked payroll has advanced.
7. Employment terms cannot overlap, be reassigned or be edited in ways that rewrite recorded attendance or advanced payroll.
8. Work schedule definitions cannot be changed after recorded attendance has used them.
9. Attendance-linked payroll items must belong to the same staff member and fall inside the payroll period.
10. Editing an allowance/deduction item requires a new active independent approval.

## Batch verification

The migration inventory and CI database verifier are extended for all 63 migrations. The PostgreSQL verifier exercises mapped terminal events, unmapped-ID rejection, pending review, completed-batch immutability, device identity, mismatched incident identity, contract overlap, schedule history, salary history, cross-staff and out-of-period attendance adjustments, and payroll-item re-approval. The static batch suite checks the ten migration definitions. Windows and PostgreSQL CI then run the same branch.

## Completion boundary

These are local database safeguards and test coverage. They do not mean the school has purchased or physically connected a terminal. Fingerprint templates remain on the device; no automatic salary deductions are activated. Authenticated browser and real-device acceptance tests remain separate work.
