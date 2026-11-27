# CORNHILL V2.1 – encrypted local academic draft queue

**Status: implementation code present; NOT installed, NOT activated.**

This directly advances the `offline_sync_not_accepted` release gate but does **not** clear it.

## What was implemented

`src/sync/offline-mark-draft-vault.mjs` provides a durable on-disk, AES-256-GCM encrypted queue for **assessment-score drafts only**. It never makes an internet request or writes to PostgreSQL, Supabase or the application API. Features:

- An explicit caller-provided private 32-byte encryption key; key is never written to the queue.
- Storage directory must be absolute and outside the source repository. Rejects symlinked vault directories. Checks POSIX permissions (Windows DACL acceptance remains mandatory).
- Per-draft random 96-bit AES-GCM nonce; authentication tag and operation-id-associated data reject tampering or reassignment.
- Only the exact approved mark-draft schema, with UUID learner, assessment, subject and staff references, numeric score, baseline revision and fingerprint; no payment, guardian, payroll or personal-contact fields.
- Durable `O_EXCL` file creation and sync; retries of the same operationId and contents do not create another draft, while the same ID with changed contents fails closed.
- Drafts survive process restarts. Count output never includes pupil names, learner IDs, private marks or other record fields.
- **No auto-upload, delete, mark-posted, merge or replay methods**. Failed/incomplete drafts remain for review; the backend must not claim they were saved as marks.

`src/sync/offline-conflict-core.mjs` provides a three-way metadata conflict classifier: accepted baseline, new Windows version and new cloud version. Divergence, missing versions, identity mismatch or revision rollback triggers blocking or review, never last-write-wins. Only assessment-score/learner-profile metadata are accepted for classification.

## Verification

Cross-platform GitHub Actions for Node 22 is configured in `.github/workflows/v21-offline-draft-tests.yml`. It exercises both conflict decisions and an actual encrypted temporary filesystem vault on Linux and Windows.

The full existing `CORNHILL local backend checks` workflow is also configured to run on PRs targeting `feat/cornhill-integration-batch-20261115`. This has a PostgreSQL 17 service, migrations and complete test suite.

## Required before real use or release gate clearance

1. Compare and reconcile the current owner's installed Windows 0.1.14+ source with this GitHub development branch. The installed app has newer hotfixes; no overwrite is permitted.
2. Bind vault methods to **Director-approved local backend authentication**, role-scoped mark-entry permission and one-device staff principal. No vault file access from browser/mobile clients.
3. Provision a proper Windows ACL and protect key material via Windows DPAPI/OS secure key store. Reject startup if ACL/key prerequisites fail. Never embed keys in GitHub, app bundles or frontend.
4. Implement explicit queued/unsaved badge in the teacher marks sheet; queued drafts must be clearly distinguishable from marks accepted by the local server and from published results.
5. Verify true classroom assessment/learner identity from source mapping and ensure allowed score ranges are configured by assessment, not assumed to be universally 0-100.
6. Add a signed and authorized **separate** backend replay endpoint, durable idempotency acknowledgements and audit events; never automatically delete pending drafts. On conflict, require authorized review and a new operation ID.
7. Exercise power loss, key rotation, tamper, wrong staff, lost phone, database outage, reconnection, duplicate requests and concurrent writes on Windows 10/11 and Android.
8. Explicitly exclude finance until **independent receipt-by-receipt reconciliation**, ledger verification and dual-system acceptance. Cloud has 8 Posted and Windows 9 Posted transactions with zero shared (learner, amount) candidate matches in the prior private report.

## Five release gates status

Frontend, API parity, hosted dependency replacement, offline sync and multi-device acceptance remain **0/5 independently accepted**. This code is a substantial offline persistence foundation, not a reason to mark `offline_sync_not_accepted` passed.
