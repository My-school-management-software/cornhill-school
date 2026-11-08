# CORNHILL Banking & Daily Deposits

## Access
Open `/banking.html` from the main school navigation. The page uses the staff member's own CORNHILL sign-in. Access is limited to active administrators and active staff whose job title is Bursar, School Bursar, Deputy Bursar or Deputy School Bursar. The administrator can register bank accounts and approve/reject withdrawals. A bursary operator can enter deposits and submit withdrawal requests.

## First-time setup

1. An administrator confirms the Deputy Bursar has an active staff profile and the correct job title.
2. On a controlled test phone, the administrator opens **Evidence Capture** and creates a device pairing code assigned to the Deputy Bursar's staff account.
3. The Deputy Bursar opens `/evidence.html` on the phone, signs in with their own staff account and claims the one-time code before it expires.
4. The administrator checks that the phone shows as Active and its last-seen time updates.
5. The administrator opens Banking & Daily Deposits and registers the school's bank account. The app stores the bank name, account label, account holder, opening balance and optional last four digits only. Do not enter a PIN, password or full bank login details.
6. Use a designated test environment/account and a non-financial test capture before entering any real deposit.

## Daily deposit flow

1. The Deputy Bursar selects the bank account, enters the date, amount in whole UGX shillings, description and bank reference.
2. They select an active authorised phone and record the deposit.
3. The bank transaction is stored as **Awaiting evidence** and a ten-minute photo request is created for that phone.
4. The phone user receives the request inside Evidence Capture, photographs the bank-issued slip, checks the photo and submits one or more pages.
5. The administrator opens Evidence Capture, checks the slip against the amount, date, bank and reference in the transaction, then records an explicit approval or rejection.
6. Only an approved evidence review changes the transaction to **Verified** and includes it in the bank balance.

## Withdrawal flow

1. The Deputy Bursar records the requested amount, recipient and reason. No phone is required at this first step.
2. The transaction remains **Awaiting approval** and does not change the verified bank balance.
3. An administrator checks the request and either rejects it with a reason or approves it while selecting an active phone for evidence.
4. Approval creates a ten-minute request for the withdrawal slip and supporting receipts.
5. The selected phone submits the evidence. The administrator reviews it separately.
6. Only approved evidence marks the withdrawal **Verified** and reduces the verified balance.

## Verified balance rule

The displayed balance is:

`Opening balance + verified deposits - verified withdrawals`

Awaiting approval, awaiting evidence, rejected evidence and cancelled records are excluded. The system stores a transaction history and separate audit events. A photograph is evidence, not an approval by itself.

## Security and operating limits

- Only the last four digits of the bank account number are stored. Never enter full bank credentials, PINs or passwords.
- Each phone has its own assigned staff account. Revoking a phone blocks future capture requests for that device.
- Each photo request expires after ten minutes. The database enforces the expiry during upload/submission.
- Evidence files are stored in a private bucket. Signed review links are time-limited.
- The bank ledger and capture system require an internet connection. Do not use the offline shell to record real banking transactions.
- Do not test with real deposits, withdrawals, learner payments or confidential IDs unless the school has approved the test.
- If evidence is unclear, use **Needs clearer photo**. For bank evidence, the replacement request is created through the bank audit workflow so the linked bank transaction returns to awaiting evidence without affecting its verified balance.
- Browser push after the browser is closed is not yet implemented. Keep the Evidence Capture app open while expecting a new request.

## Status

The Banking & Daily Deposits screen and its connected database workflow are present on the development branch. The schema checks confirm the bank tables, role policies, RPC functions, evidence-review trigger and private capture bucket. The connected new bank and evidence registers are currently empty. Authenticated user testing and a fresh deployment preview are still required before operational use.
