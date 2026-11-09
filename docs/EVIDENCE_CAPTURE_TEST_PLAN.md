# CORNHILL Evidence Capture — first implementation test plan

Branch: `fix/assessment-selection-save-preview-20261108`

## Implemented in this phase

- A shared evidence-capture portal at `/evidence.html`, linked from the main application navigation.
- A one-time device pairing flow. An administrator pre-assigns a device to an active staff account; the phone user signs in with their own account and claims the pairing code.
- Pairing codes are random 256-bit values, stored as SHA-256 hashes, expire after ten minutes and can be claimed once.
- Administrator-created capture requests are assigned to one authorised device and expire after ten minutes.
- Phone-side request list, Realtime in-app updates, camera/file picker, multiple file upload (up to eight files per request), preview, upload progress text and completion confirmation.
- Private Storage bucket `cornhill-private-evidence`, limited to JPEG, PNG, WebP and PDF, with a 15 MB per-file limit.
- Evidence metadata is stored separately from the private file object.
- Administrator evidence register, time-limited signed file links, and separate review decisions (Approved, Rejected, Needs clearer photo).
- Device revocation and audit fields for requester, assigned user, uploader and reviewer.
- Additive database migration `20261108190000_phone_evidence_capture_foundation.sql`.

## Verification already performed

- Supabase migration applied successfully to the existing CORNHILL project.
- SQL verification confirmed all four new tables exist with RLS enabled.
- SQL verification confirmed the evidence bucket exists and is private, with the configured 15 MB limit and allowed MIME types.
- SQL verification confirmed the expected table policies and three Storage policies exist.
- Pairing RPC exists and is SECURITY DEFINER by design because it must atomically verify a one-time hash without exposing pending pairing hashes. It checks `auth.uid()`, active employment, the pre-assigned staff account, code hash, expiry and pending status.
- Existing school payment, learner, marks and expense rows were not changed by this additive migration.

## Manual acceptance tests still required

Use designated test staff accounts and test phones only. Do not use real bank deposits, real expense transactions, or confidential staff identity documents during initial testing.

1. Administrator can open Evidence Capture from the main CORNHILL navigation.
2. Non-administrator cannot see the device registration, request creation or review controls.
3. Administrator can load the active staff account list.
4. Administrator can create a pending device for a selected staff account.
5. The generated pairing code is displayed once and is not stored in plaintext.
6. A different staff account cannot claim a code assigned to another account.
7. A code cannot be claimed after ten minutes.
8. A code cannot be claimed a second time.
9. A disabled/exited staff account cannot claim a device.
10. A successfully paired phone appears as Active in the administrator device list.
11. Administrator can revoke a paired phone.
12. A revoked phone cannot upload evidence to a new request.
13. Administrator can create a request for an active device.
14. Request is assigned to the exact device and staff account selected.
15. Phone receives an in-app Realtime notification while signed in and online.
16. Request countdown begins at ten minutes.
17. Expired request cannot accept a new evidence upload.
18. Phone can use its rear camera or file picker to select a document.
19. Phone can add multiple pages to one request.
20. Unsupported MIME types are rejected.
21. Files larger than 15 MB are rejected.
22. More than eight files in one request are rejected by the client.
23. Successful uploads create private Storage objects and metadata rows.
24. Request changes to Submitted only after evidence metadata is saved.
25. Administrator can open a short-lived signed link to each submitted file.
26. An administrator review is stored separately from the upload and includes reviewer identity and timestamp.
27. A phone cannot read another staff member's requests or evidence.
28. A phone cannot submit to a request assigned to another staff account.
29. Signing out and signing into another account in the same tab does not reuse the previous account's portal session.
30. Disconnecting the network during upload does not display a false success message; the user must retry while the request remains active.

## Banking & Daily Deposits integration now present

The branch now has a separate `/banking.html` workspace. The connected database has bank account, bank transaction, transaction-event and verified-balance objects. An authorised bursary operator can submit a deposit only after selecting an active phone for the bank slip. A withdrawal is first recorded as Awaiting approval; only an administrator can approve or reject it. Approving a withdrawal creates a ten-minute evidence request on the selected phone. A bank transaction's balance effect occurs only after evidence is separately reviewed and marked Approved.

Bank evidence requests use `context_type='bank_transaction'` plus the linked transaction ID. The review trigger records evidence verification/rejection on the bank transaction. If the administrator selects Needs clearer photo for bank evidence, the portal calls the bank's audited replacement-evidence RPC rather than merely reopening an unrelated request.

## Additional manual acceptance tests still required

Use designated test accounts, a test phone and a test bank account only. No fake deposits should be added to the live school ledger just to pass a test. Where a real test transaction is necessary, it needs the school's explicit approval and a matching real bank statement.

31. Banking navigation opens `/banking.html` from the main application.
32. A non-finance staff account cannot enter Banking & Daily Deposits.
33. An active Staff account with the Deputy Bursar/Bursar job title can open the finance-operator view.
34. A non-administrator cannot create or edit a bank account.
35. Bank account registration stores only the last four digits and rejects a malformed value.
36. A finance operator cannot submit a deposit without selecting an active authorised phone.
37. The deposit request is created against the selected device owner and the matching bank transaction ID.
38. A withdrawal can be submitted without selecting a phone; it remains Awaiting approval and does not reduce the verified balance.
39. Only an administrator can approve or reject a withdrawal.
40. Approving a withdrawal creates a separate ten-minute evidence request assigned to the selected phone.
41. Rejecting a withdrawal requires a reason and records the decision event.
42. Approving bank-slip evidence changes the matching transaction to Verified and increases the verified balance once.
43. Rejecting bank-slip evidence leaves the amount out of the verified balance.
44. Requesting a clearer bank slip creates a new evidence request for the same bank transaction and keeps the balance unchanged until approved.
45. A verified withdrawal reduces the verified balance once; an unapproved withdrawal does not.
46. A revoked phone cannot upload evidence for a new request.
47. A bank transaction's evidence link opens only for an authorised administrator or the assigned staff member.
48. A staff member cannot attach a file to another bank transaction by altering the request or record ID.
49. An expired request cannot be submitted even if the phone page remains open.
50. A closed or backgrounded browser is not assumed to receive reliable push notification; foreground polling and Realtime require connectivity.
51. The **Request receipt photo** action is shown only for a Posted school expense and opens Evidence Capture with the exact expense record ID, expense number and amount.
52. A Voided expense does not expose the receipt-photo action.
53. The administrator's staff-profile editor provides a **Request staff ID photo from phone** action after a staff account is selected.
54. The staff ID request carries the selected staff profile ID and does not use a different staff member's ID.
55. Banking navigation is visible to administrators and active Bursar/Deputy Bursar staff, and hidden for other staff roles.
56. A user who opens `/banking.html` directly without a permitted finance role is refused by the banking page's own role check.

## Current limitations

- Browser notifications and in-app Realtime are available while the portal is open and connected. Reliable push after the browser is closed requires a separate Web Push subscription and server-side push delivery; this is not implemented.
- Bank deposit and withdrawal records are linked to evidence. Direct “Capture from phone” actions in general school expense records, staff IDs, learner documents and other record forms remain to be integrated.
- Camera preview, Android browser behaviour, account isolation, Realtime delivery and actual file uploads still require manual acceptance testing on authorised test accounts/devices.
- The latest code has not been deployed to a new Vercel preview yet. Do not test a previously deployed/stale preview as if it contains this feature.
