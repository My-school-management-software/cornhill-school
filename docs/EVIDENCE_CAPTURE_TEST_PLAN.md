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

## Current limitations / next phase

- Browser notifications are available while the portal is open and connected. Reliable notifications when the browser is closed require a separate Web Push subscription and server-side push delivery; that is not claimed as implemented.
- The portal currently records a human-readable context label and optional amount. The next integration phase must link evidence requests directly to saved bank deposit, expense, withdrawal, staff profile and other module record IDs so evidence appears in those records automatically.
- This phase does not yet create the Banking & Cash Control ledger or change the existing expense workflow.
- Camera preview, Android browser behaviour, account isolation, Realtime delivery and actual file uploads still require manual acceptance testing on authorised test accounts/devices.
- The latest code has not been deployed to a new Vercel preview yet. Do not test a previously deployed/stale preview as if it contains this feature.
