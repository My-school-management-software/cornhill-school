# CORNHILL Phone Evidence Capture

## Purpose
A separate mobile-friendly capture portal for bank slips, expense receipts, staff IDs, learner documents and other school evidence. It is opened from the school computer at `/evidence.html` and can be installed on an authorised Android phone from the browser's Add to Home screen / Install app menu.

## Current implementation
- Staff sign in using their own CORNHILL account; the capture portal uses a separate per-tab Supabase auth storage key.
- Only administrators can issue one-time device pairing codes and revoke authorised devices.
- Pairing codes are random, stored as SHA-256 hashes, and expire after ten minutes.
- A phone is paired to one staff account. Its owner can see requests assigned to that account's active devices.
- Requests expire after ten minutes. The database checks expiry and the assigned active device when the phone submits.
- The phone can capture or select JPEG, PNG, WebP and PDF files, with up to eight files per request and a 15 MB per-file limit.
- Evidence is stored in a private Supabase Storage bucket, never in a public bucket. Administrators receive short-lived signed links for review.
- Reviews are separately audited as Approved, Rejected or Needs clearer photo. For a generic document request, a clearer-photo decision reopens the request for another ten minutes. For a bank transaction, the portal calls the bank's audited evidence-reissue RPC so the bank transaction returns to Awaiting evidence and a new request is created against the same transaction.
- Device activity is updated through a narrowly scoped database function.
- The service worker caches the public app shell only; all authentication, requests, records and uploads remain online-only.

## Notification behaviour
Realtime updates and a 25-second foreground refresh are used while the portal is open. Browser notifications require the staff member to tap **Enable notifications** and grant permission. This release does not claim reliable background push after the browser or app has been closed; background delivery needs a separate web-push sender and device subscription management.

## Security boundaries
- No service-role key is present in browser code.
- RLS restricts phone requests, upload metadata, storage objects and review history.
- A phone can only upload to a still-pending request assigned to its own active device.
- The pairing function validates the authenticated staff account, assigned device, hashed code and expiry.
- The upload evidence is not itself approval of a transaction. An administrator must review it separately.

## Important deployment status
The database foundation and its policy hardening have been applied to the connected CORNHILL Supabase project. The web application files are committed on the feature branch, but this does not mean the latest Vercel preview is live. The Vercel deployment quota previously blocked a new preview. Do not use an old preview URL to test this release until a fresh deployment is confirmed.

## Linked school records

The administrator can start phone capture from a Posted expense row using **Request receipt photo**. The request opens with the expense record ID, expense number and amount pre-filled. The administrator can also select a staff account in the staff-profile editor and choose **Request staff ID photo from phone**; that request carries the selected staff profile ID. Both actions use the same private capture service and the same ten-minute request policy.

## Banking connection

The banking workspace is available at `/banking.html`. Deposit and withdrawal requests store `context_type='bank_transaction'` and the exact bank transaction ID in the evidence request. The administrator reviews the related photos in this portal; the database trigger updates the linked bank transaction to Verified or Evidence rejected. A Needs clearer photo action uses the bank's audited reissue function, preserving the bank record and event history.

The bank ledger stores only the last four account digits, not full bank credentials. Its verified balance is calculated from the opening balance plus verified deposits minus verified withdrawals. Pending or rejected items are excluded.

## Remaining integration work
1. Add phone-evidence attachment actions to school expense records, staff IDs, learner documents and other approved record forms.
2. Add configurable small-expense limits and approval rules for the Deputy Bursar.
3. Add a daily cash-to-bank reconciliation view and a printable deposit summary.
4. Add true background web-push delivery only after the school approves the notification subscription and key-management setup.
