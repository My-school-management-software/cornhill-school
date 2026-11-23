# V124C — Director-supervised staff account activation and acceptance

**Director instruction (23 November 2026):** The Director approves installation in principle and requests activating the staff accounts to review the available information with the responsible staff.

**Status:** AUTHORISATION REQUEST RECORDED; NO REAL ACCOUNT ACTIVATION PERFORMED. The current V124B acceptance report remains BLOCKED (one failing regression, one skipped, real logins untested). New V124C reporting components are not integrated or installed. Bursar email delivery remains unconfigured.

## Staff account activation policy

1. Identify **existing** accounts for Director, Bursar, Deputy Bursar, Headteacher, Deputy Headteacher, Director of Studies and Teachers, recording only account ID/role/status; do not duplicate staff or reset credentials.
2. Establish staff employment/appointment and verify role-to-person ownership. Never share the Director password or disclose a Bursar password to the Director.
3. Use Director-authorised and audited staff-account activation through a *reviewed* local service, only after safe migration and isolated acceptance. The older staff administration endpoint supports listing, creating accounts and changing role grants; it does **not** offer an approved activate-existing-account endpoint. Do not try direct SQL updates as a workaround.
4. Bursar/Deputy Bursar invitation email flow remains disabled and cannot be activated until delivery configuration, invitation lifecycle, verification, independent approval and permission tests pass. No invitation email should be sent yet.
5. Each staff member signs into **their own** account in the Director's presence. Require privacy of passwords, an authenticated session, visible staff name, role and status, and the expected module access. Do not use someone else's credentials.
6. Start with **read-only acceptance**: inspect screens and report data. Only perform synthetic transactions in a disposable test environment; do not create real receipts, mark staff attendance or enter genuine learner grades for testing.
7. The Director accesses a separate oversight interface. Normal school-fee payment entry must be denied server-side; Bursar operations stay in Bursar account. Do not grant a broad finance permission to force through missing reports.
8. Block launch if the display is empty because historical learners have not been imported: compare record counts in read-only mode, and do not populate fake learners.
9. Verify school year and term configuration, pupils' account balances, financial history, staff directory, admissions and marks according to the responsible role.
10. Reconcile authoritative balance-sheet totals; never present prototype's placeholder relief/credit values as real school amounts.

## Director-supervised acceptance record (fill only after actual verification)

| Role | Existing account found | Active/eligible | Real login verified | Expected screens | Report data accurate | Result |
|---|---|---|---|---|---|---|
| Director | Not checked | Not checked | Not checked | Leadership/oversight | Not checked | PENDING |
| Bursar | Not checked | Not checked | Not checked | Fees, receipts, balances | Not checked | PENDING |
| Deputy Bursar | Not checked | Not checked | Not checked | Delegated finance only | Not checked | PENDING |
| Headteacher | Not checked | Not checked | Not checked | Academic/staff leadership | Not checked | PENDING |
| Deputy Headteacher | Not checked | Not checked | Not checked | Delegated leadership | Not checked | PENDING |
| DOS | Not checked | Not checked | Not checked | Academic administration | Not checked | PENDING |
| Teachers | Not checked | Not checked | Not checked | Assigned class mark sheets | Not checked | PENDING |

## Operational note

The existing checked-in local module offers `GET /api/v1/security/role-management` under Director control, with staff usernames, roles, account statuses and employment statuses, and an admin UI at `/leadership`. It offers create-account and role-permission modifications, **not approved existing-account activation**. Also the checked-in GitHub branch may be older than the latest V124B Windows source. Therefore a real activation requires a safely reconciled and installed version and verification of the actual local account inventory.

**Do not confuse GitHub branch changes with local activation.** The V124B single failing regression and source conflict must be fixed. Installing/activating is a separate, logged operation. 
