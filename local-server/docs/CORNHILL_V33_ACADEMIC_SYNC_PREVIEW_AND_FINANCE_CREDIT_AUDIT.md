# CORNHILL V33 — Actual protected academic offline conflict-preview HTTP routes + finance credit audit

Date 27 November 2026 (Uganda). Director said PROCEED after confirming V32C actual current backup and encrypted retention had passed.

## Real Windows V32C acceptance (from Director terminal)
- 122/122 tests PASS. Windows private NTFS DACL and DPAPI checks PASS.
- Fresh current read-only PG17 snapshot, isolated restore with learner=484, assessments=169, marks=1991, Posted payments=9, receipts=9, incorrect test year 2027=0. Restore counts PASS.
- AES-256-GCM encrypted snapshot created and saved, Windows CurrentUser DPAPI wrapped key recovered. Private scratch cleanup DONE, live DB changes=0, cloud writes=0.
- DPAPI key same Windows profile only: this archive is NOT portable replacement-PC disaster recovery. Keep existing independent cloud backups.

## V33 deliverable created today
Created `CORNHILL-V33-AUTHORIZED-ACADEMIC-SYNC-PREVIEW.zip` (19,472 B), SHA-256 `bf1b9f193cb536da2158db07174fa6ec553d4c2f0e4e3352ee985449eb736b4e`. ZIP CRC and SHA256SUMS PASS.
Against the existing Nov26 exact source-review snapshot, a staged academic handler patch was generated. It adds the strict no-write `src/security/v33-offline-mark-preview.mjs` plus two authenticated endpoints inside the actual existing `createAcademicsHttpHandler`:
- GET `/api/v1/academics/assessments/{uuid}/offline-baselines`: demands HTTPS, exact host, staff marks_enter permission and class/subject authorization; returns only per-mark UUIDs and content fingerprints for an OPEN assessment, not names/marks/contacts.
- POST `/api/v1/academics/offline/preview`: demands HTTPS, exact Origin, CSRF, staff permission/class/subject checks, max 100 proposals; compares client baseline fingerprint with existing authorized data. Returns BASELINE_MATCH_PREVIEW_ONLY, STALE_BASELINE_REVIEW_REQUIRED, NOT_AUTHORIZED_OR_NOT_ENROLLED or INVALID_SCORE. Returns `canSubmit=false` and never calls saveMarks.
Staged synthetic handler route tests: 21/21 PASS. Simulated source ADD-only installation: PASS. Idempotent re-install: PASS. Tampered/unreviewed original handler: blocked without changes. PowerShell runner runs security tests in isolated temp source before copying two new files or patching the one reviewed handler, backing up original handler first. Source handler must have exact SHA256 `fe48681cd21e5803831beffd40bb73c3cc63b356ad0c131a1c22c5861b2f3052` (Nov26 reviewed snapshot) or installation FAILS CLOSED. New handler expected SHA256 `00029d425536ea64db6f5373f71e65d615a57ff7120b9ff8b24c07d3cf680488`. Real Windows V33 execution PENDING.

**Critical limits:** This is a real authenticated HTTP **preview** when installed and the server is safely restarted, NOT an upload, not a DB-atomic compare-and-swap, not completed offline sync, and not a native EXE/APK. It requires OPEN assessment; existing 2026 year has zero Active years and 169 assessments were earlier 0 Open, so no mark may be eligible until Director-approved academic lifecycle changes. The runner does not restart live services. Never claim the endpoints live until Director approves a normal restart and uses a real staff account.

## New read-only finance evidence
Independently queried connected CORNHILL Supabase `public.school_payments` + `payment_allocations` on 27 Nov using SELECT only. Eight Posted hosted payments, all eight with zero standard allocations, all eight with positive unallocated retained credits, all eight satisfying allocated + unallocated = payment total, zero overallocations. This is a **legitimate retained-credit ledger state**, not automatically an error. Local V32C still has 9 Posted payments/9 receipts. V33 supplies an additional local finance credit-usage aggregate inspection (read-only DB, no payment amounts or learner identifiers printed). The hosted/local finance identity gap remains unmerged.

## Release status
V33 is an additive local academic API integration candidate. Does not change live DB schema, hosted cloud, finances, Windows EXE, Android APK, or protected backups. No automatic academic/finance sync or remote connectivity activated. Five formal global release blockers still 0/5 cleared.

After actual Windows V33 source verification, next implement server-side transactional version+idempotency commit, authorisation and audit, protected device outbox with explicit encryption and conflict review, hosted row-identity reconciliation, then publish signed native clients and test physical devices. Do NOT substitute preview for safe sync.

V33 final package revision specifically fixed malformed/offline proposal input to return HTTP 400 (not a generic 503), with a new integration test. ZIP/included checksum manifest were rebuilt and verified. This FINAL ZIP supersedes the previous 19,336-byte pre-release build, which should not be used.
