# CORNHILL Local Staff, Attendance and Payroll Foundation — Batch 15

## Added
- Staff profiles linked to the separate local staff authentication accounts.
- Employment terms with contract type, salary basis, UGX base salary, payment frequency and expected work schedule.
- Attendance device registry for USB, LAN and manual imports.
- Import batches with SHA-256 source checksums and duplicate-import protection.
- Device attendance events with external event de-duplication, review status and reviewer attribution.
- Daily attendance summaries and separately audited correction requests.
- Attendance corrections require a reason and a second person to approve them.
- Payroll periods, payroll runs, individual staff payroll lines and detailed allowance/deduction items.
- Gross and net pay are calculated in UGX; payroll line totals must match the detailed items.
- Payroll lifecycle is Draft → Reviewed → Approved → Posted, with a reasoned reversal path.
- The preparer cannot approve their own payroll run.
- Payroll lines lock after review; allowance/deduction items must be separately approved.
- An attendance-linked payroll deduction is rejected unless its attendance adjustment has already been approved.
- Four additional staff permissions; role grants remain empty.

## Safety choices
- No fingerprint templates, face templates, biometric samples or biometric credentials are stored.
- The device layer records attendance event metadata only. No fingerprint machine has been connected or physically tested.
- A USB/LAN import adapter still needs the exact device model, vendor protocol or sample export file.
- Attendance does not automatically deduct salary. Any payroll deduction must be deliberately entered as a separately approved payroll item.
- Payroll and attendance APIs are not yet enabled, and no real staff or salary data has been imported.
- PUBLIC and browser roles receive no direct database grants.

## Validation
- Eight local PostgreSQL migrations apply and rerun with matching checksums in CI.
- Windows unit suite and PostgreSQL 17 integration job pass.
- Integration checks verify USB device import, event verification, independent attendance approval, payroll totals, payroll approval separation, prevention of skipped approval and locking after review.
- Test records are synthetic and rolled back; they do not modify school records.

## Still pending
- Staff, attendance and payroll API routes and administrator/bursar screens.
- Real attendance device integration and a school-specific import mapping.
- School-approved salary rules, leave calendars, overtime/allowance policy and payroll permission matrix.
- Finance posting and payroll disbursement workflows, statements and backups.
- Provisioning on the school Windows computer and LAN security review.