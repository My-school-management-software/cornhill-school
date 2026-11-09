# CORNHILL Offline-First Workspaces

Branch: `feat/offline-first-workspaces-20261109`

## Current implementation in this branch

- The service worker pre-caches the shared app shell and approved public static libraries. It also caches HTML workspaces after they have been visited, so a device can reopen a saved workspace without a network connection.
- The shared `assets/cornhill-offline.js` helper is loaded by the main and linked workspace pages. It stores eligible form drafts in IndexedDB using AES-GCM encryption, scopes drafts to the current signed-in user where Supabase Auth is used, restores drafts, and shows a connection / pending-work indicator.
- Authentication forms, passwords, PINs, one-time codes, file inputs, tokens and secret-like fields are excluded from local draft capture.
- Public admission enquiries have an explicit encrypted outbox handler. The form tells the submitter that an offline enquiry is saved locally and has not yet reached the school. The stable client UUID allows safe retry handling. Sync currently runs while the page is open when connectivity returns or when the user presses Sync now.
- The school and linked workspace manifests request full-screen display on supported browsers.
- Visible install buttons and install prompts have been removed from the touched workspace screens. Browser-level Add to Home screen / app shortcut functionality remains available through the browser itself.

## Important offline boundary

The shared offline shell is not a blanket offline database mirror. Supabase authentication, role checks and server records remain authoritative. Supabase API/auth requests are not placed in the service-worker cache.

These workflows must not be labelled as completed or posted merely because a draft exists on the device:

- Fee collection, receipts, bank deposits/withdrawals, expense approvals, payroll and bursary accounting.
- Assessment marks, official report cards, UNEB calculations and learner identity changes.
- Guardian PIN verification, private parent records and sensitive messaging.
- Evidence uploads, signed document storage, records OCR and final approval actions.
- Fingerprint attendance, where machine events and user/device authorisation need a verified conflict-safe import path.

Those need workflow-specific outbox handlers, idempotency keys, server-side authorisation, validation and conflict handling before they can safely synchronize. For example, a queued fee payment needs an offline receipt identity and a server-side check that prevents duplicate payment posting; simply replaying a browser form is not sufficient.

## Sync constraints

- Current sync is foreground sync: the app must be open and online, or the user must return to it and press Sync now. Background synchronization after the browser is fully closed is not implemented.
- Offline queues are local to the device/browser profile. Clearing site data or losing the device can remove unsynchronized items.
- A queued item remains pending if its explicit handler is not available or the signed-in account does not match the item's user scope.
- Users should not use shared devices for private offline drafts unless the device is assigned to them and protected by its normal device lock.

## Verification completed in this change batch

- JavaScript parse checks passed for `service-worker.js` and `assets/cornhill-offline.js`.
- Inline scripts parsed successfully in Admissions, Parent Portal, Evidence Capture, Notification Centre, Records Centre, Banking, School Services and the public school website.
- All eight linked workspace manifests parsed as JSON and declare `display: fullscreen` plus `display_override: [fullscreen, standalone]`.
- Install-prompt labels were not found in the touched page markup.

## Not yet verified

- Full browser/phone tests with airplane mode, storage quota exhaustion, browser restart, sign-out/sign-in between user profiles, and reconnection races.
- Real Supabase admission queue execution against a test environment.
- Offline transactional synchronization for each finance, academics, attendance, communications, evidence and parent workflow.
- Native full-screen behavior on physical Android and Windows devices. Display mode is a browser/platform preference, not a guaranteed kiosk lock.
- Every possible App Centre sub-route on a first visit while offline. A workspace must have been cached on that device at least once.
