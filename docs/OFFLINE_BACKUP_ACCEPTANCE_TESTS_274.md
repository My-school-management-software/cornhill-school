# CORNHILL Offline and Backup Source Acceptance Review — 274 Checks

**Date:** 6 November 2026  
**Scope:** static source assertions against the development branch, JavaScript syntax parsing, and read-only Supabase status/advisor checks. This is not a browser or device test.

## Outcome

**274 source assertions passed after correcting eight test-harness scope/expected-version mismatches.** The first pass showed 266 matches and eight false negatives caused by checking the wrong source slice or expecting an old IndexedDB version. Each of those eight was rechecked against the correct function or current version and passed. They were test-harness issues, not application defects.

The 274 assertions were grouped as follows:

| Area | Assertions |
|---|---:|
| Offline class snapshots and read-only restrictions | 51 |
| Form autosave and restoration | 50 |
| Teacher assessment draft queue and conflict-safe sync | 62 |
| Staff attendance correction queue | 29 |
| Service-worker cache and network boundaries | 30 |
| Google Drive backup encryption, privacy and validator source | 52 |
| **Total** | **274** |

All three inline JavaScript blocks in `index.html` parsed successfully with zero syntax errors.

## Code correction completed

The teacher offline-mark counter filtered drafts using `expires_at > Date.now()`, while newly queued drafts intentionally have `expires_at: null`. As a result, the counter did not display those unexpired drafts. The counter also had no call from the successful class-grid load path.

Corrected both:
- A draft is counted if it has no expiry, or if its expiry is still in the future.
- The class-grid load now refreshes the pending-draft count after rendering.
- The counter is limited to the Teacher role and continues to state that local drafts are not official marks until synchronised.

Updated the service-worker shell cache from `cornhill-shell-v31` to `cornhill-shell-v32` so the corrected app shell is fetched after the next deployment/update.

## Coverage details

### Offline class snapshots
Checked account-keyed IndexedDB storage, the 24-hour snapshot limit, Admin/Teacher eligibility, learner-field allowlisting, teacher class selection matching, class roster isolation, offline read-only navigation, control disabling, and explicit warnings that finance, guardian contacts and live updates are unavailable offline.

### Form autosave
Checked owner-and-form-key storage, version-3 IndexedDB stores, transaction completion/error/abort handling, exclusion of passwords and file inputs, checkbox/radio handling, input/change listeners, debounce, owner-scoped restoration, and the absence of auto-submit behaviour.

### Teacher assessment drafts
Checked local draft fields, account ownership, class/term/assessment/student linkage, baseline score/comment capture, online Auth identity check, Teacher-only sync, conditional update matching the original score and comment, insert path for new marks, conflict retention, deletion only after successful sync, manual sync feedback, reconnect sync and the non-official status of offline marks.

### Staff attendance corrections
Checked UUID request IDs, owner-scoped local queue entries, offline-only local save messaging, online sync guard, owner matching, insert to the correction-request table, idempotent retry lookup and retention of failed requests.

### Service worker
Checked versioned shell cache, precache list, GET-only interception, same-origin-only caching, network-first navigation, offline shell fallback, cleanup of old caches and exclusion of authentication/database/Storage/Edge Function traffic.

### Backup
Checked AES-256-GCM encryption structure, 32-byte environment key requirement, administrator and active-employment guard, private communication exclusions, v2 format manifest, pre-upload decrypt/integrity verification, v1/v2 validator compatibility, exact dataset allowlist, row/total count comparisons and persistent validation audit insertion.

## Live Supabase read-only observations

- Health advisor: zero lints.
- Security advisor still reports six service-only tables with RLS and no client policies, the `pg_net` extension in `public`, 20 authenticated-executable SECURITY DEFINER functions, and leaked-password protection disabled. These require individual review; no blanket changes were made.
- Backup history: six successful runs and two failed runs. Latest successful completion observed at **2026-11-06 09:06:05.842 UTC**. Successful run history records a maximum total of 232 rows.
- `google_drive_backup_validations`: zero audit rows. The latest backup is still not independently validated.
- Staff attendance correction requests: zero server rows.
- Assessment score rows: zero.
- No new backup was created; no validation action was invoked; no restore was attempted.

## Important limitations

- These are static source assertions and syntax checks. IndexedDB, browser storage quota, offline/reconnect timing, cross-account device behaviour and real sync conflict handling still need browser runtime tests.
- The current tool connection does not expose an Edge Function invocation action, so the backup validator could not be run from this review. A successful backup run is not the same as a validated backup.
- No real learner, guardian, payment, academic, attendance, payroll, communications or backup data rows were changed.
- No Android or Windows 10/11 device test was performed.
- Full app deployment remains pending; Vercel usage limitation previously reported is unchanged.

## Files changed

- `index.html`: corrected pending assessment-draft counter and invoked it after successful class-grid render.
- `service-worker.js`: cache version v32.
- `docs/OFFLINE_BACKUP_ACCEPTANCE_TESTS_274.md`: this review record.
