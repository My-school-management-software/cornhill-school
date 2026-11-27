# CORNHILL V2.1 — five release blockers: delivery and acceptance ledger

**Date:** 27 November 2026 (Uganda). **Release status:** BLOCKED. **Formally cleared: 0 of 5 (0%).** Do not treat code presence or passing synthetic tests as production acceptance.

## Evidence and remaining work

| Gate code | Verified foundation | Required before clearing |
| --- | --- | --- |
| `frontend_not_integrated` | Seven locally served workspaces (School Office, Academics, Finance, Leadership, Staff Operations, Attendance Imports, Guardian) and login shells exist in GitHub local-server. | Compare the actual CURRENT Windows installation with the hosted app, integrate missing production screens, then conduct role-by-role end-to-end acceptance. Do not overwrite newer Windows code with this older branch. |
| `school_api_parity_incomplete` | Source tests match workspace paths and local auth route handlers. | Execute real PostgreSQL/HTTPS acceptance against each writable and read-only operation with permission denials, audit log, actual class/learner data and rollback conditions. URI path parity alone is not functionality parity. |
| `hosted_dependencies_pending` | Local UI assets have a guard against remote Supabase scripts/fetches. | Replace every runtime hosted dependency for standalone Windows operation, inspect supply-chain and local service calls, and prove startup/login/workflows with internet physically off. The separate cloud fallback still needs independent secured endpoints. |
| `offline_sync_not_accepted` | NEW: v21 pure three-way metadata conflict classifier at `src/sync/offline-conflict-core.mjs`. 18/18 synthetic tests pass. Rejects finance, guardian and payroll; refuses automatic merge, delete, create, write and stale revision. | Authenticate backend sync readers/writers, build encrypted device-bound outbox, durable replay and idempotency, per-record baseline and revision tracking, backup/restore, concurrent edit simulation, tests on actual Windows and Android with disconnection/reconnection. **No live sync is enabled.** |
| `multi_device_acceptance_pending` | First Android LAN pilot ran over a temporary gateway; mobile-data sign-in confirmed on production hosted app. | Test on secure school-owned router with >30 authorized devices, LAN TLS trust, role separation, staff/guardian isolation, simultaneous writes, failover, Windows EXE and Android APK updates. Do not use an open borrowed Wi-Fi for school records. |

## Priority sequence (not repeated diagnostics)

1. Reconcile newest Windows source with the GitHub branch and hosted UI; **do not install old code over newer Windows application**.
2. Implement and integrate missing school APIs and frontend workflows; acceptance matrix should test real data, negative permissions and authorized roles.
3. Develop safe offline non-financial sync with durable outbox and manual conflict resolution; keep private records encrypted and isolated.
4. Prove device acceptance and local standalone behavior. Keep cloud production as known-working fallback.
5. Separately reconcile the eight cloud and nine Windows Posted payment records against original authorised receipts. **Zero candidate matches** in the previous HMAC comparison means finance replication must remain off. Do not allow the finance issue to consume every development iteration; build other modules without financial sync.

## Honest progress reporting

- Seven of seven local workspace UI/API route families exist in the checked source, but their complete end-to-end equivalence is **unverified**.
- Learner source-ID sets were the same 484 cloud/local IDs in an earlier Director-run read-only test; this **does not** certify every learner profile.
- Finance mismatch remains unresolved; never delete or repost records to force equal counts.
- V21 classifier is **real code**, but is not yet called by the application, has no persistent queue and is not a runnable offline feature.
- **Formal release acceptance progress: 0/5.**
