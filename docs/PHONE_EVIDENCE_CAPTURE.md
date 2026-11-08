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
- Reviews are separately audited as Approved, Rejected or Needs clearer photo. A clearer-photo decision reopens the same request for a further ten-minute capture window.
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

## Next integration work
1. Build the bank account and daily deposit register in UGX.
2. Link each deposit and withdrawal record to an evidence request by its record ID.
3. Add expense approval limits, withdrawal approvals and bank-balance reconciliation.
4. Add approved cross-module attachment buttons for staff profiles, learner documents and school expenses.
5. Add true background web-push delivery only after the school approves the notification subscription and key-management setup.
