# CORNHILL V2.1 — teacher marks: server-save confirmation and controlled encrypted staging

**Date:** 27 November 2026. **Deployment status:** development-only, draft PR, not installed over the owner's newer Windows build.

## Actual blocker work in this batch

### Frontend integrity (Blocker 1)

The local `academics.html` mark register now shows a dedicated accessible `mark-save-state` panel. `academics.js`:

- Marks any edited score/comment as **UNSAVED** until the local API confirms the POST.
- Disables duplicate submissions while a save is running.
- If the request fails, **does not falsely claim marks were saved**, and keeps the teacher's entries on the screen. It warns that an uncertain network response may still mean the server saved the data, so check the server before retrying.
- Protects against losing edits when changing class, term, assessment, reloading or closing the browser, requiring an explicit user decision.
- If a teacher changes fields during an in-flight save, the later changes remain explicitly **UNSAVED** instead of being silently discarded.
- No unencrypted localStorage/IndexedDB storage or browser-side automatic cloud sync.

A static UI regression test `test/academics-unsaved-marks-guard.test.mjs` verifies safety properties. Full end-to-end interactive browser acceptance remains pending.

### Offline backend admission (Blocker 4)

`src/sync/mark-draft-admission-service.mjs` provides backend-only, permission-checked admission to the **encrypted local academic draft vault**:

1. Require an active staff principal and explicit `academics.marks_enter` role permission.
2. Validate only the exact approved marks-draft input schema and UUIDs.
3. Call a **separately trusted** `recordVerifier.verifyDraftSourceMapping` to prove assessment, learner, subject and class mapping, `Open` assessment status, allowed score and a current baseline version.
4. Require the staff's authorized class assignment.
5. Only then call the durable AES-GCM encrypted vault.
6. Return **queued locally; NOT posted to marks, NOT uploaded to the cloud, NOT published**.
7. Reject finance/guardian/payroll data, unverified mappings, closed assessments, expired/guardian sessions and duplicate-operation mismatches.

It is exercised by `test/mark-draft-admission-service.test.mjs`, including an actual temporary encrypted-file integration test. The code is **not mounted as an HTTP endpoint** and the trusted real database `recordVerifier`, Windows secure key/ACL provisioning, live teacher UI queue integration and signed replay have **not** been completed.

### CI

Dedicated V21 GitHub Actions matrix now covers Linux and Windows for:
- three-way offline conflict classifier;
- encrypted persistent mark draft vault;
- permissioned backend admission service;
- academic unsaved-state UI guards.

Full local backend CI separately exercises the repository, PostgreSQL 17 migrations and finance verifiers. GitHub Actions are authoritative for results; do not assume successful until green.

## Why the five blockers are not automatically cleared

| Blocker | Progress this batch | Still missing |
|---|---|---|
| Frontend integration | Honest save and unsaved-mark protection added | Complete hosted/local UI reconciliation and real browser role acceptance |
| School API parity | Verified-gate backend admission contract added | Actual read-only identity resolver and authenticated API wiring, all module end-to-end testing |
| Hosted dependencies | Existing local asset network independence guards retained | Full standalone operation and integration acceptance on actual Windows |
| Offline sync | AES-GCM durable vault + no-merge conflict classifier + permission admission | OS-managed keys, trusted DB mapping, actual replay/ack, durable outbox, end-to-end disconnect/reconnect |
| Multi-device acceptance | Existing cloud/mobile-data success remains | Secure owned LAN, Windows/Android concurrency and app packaging |

**Formal release gate: 0/5 cleared.** Payment sync must remain disabled: hosted and local posted payment populations are different.
