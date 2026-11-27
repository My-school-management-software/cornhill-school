# CORNHILL V31C — Safe recovery of orphan private PostgreSQL restore and rerun

**Date:** 27 November 2026 (EAT). The Director's actual Windows diagnostics:
- `PRIVATE_TEST_FOLDERS=1`, `LOG_FOUND=True`, `PID_FILE_FOUND=True`, `ERROR_CATEGORY=SERVER_REPORTED_READY`.
- `POSTGRES_PROCESS_RUNNING=True`, `PROCESS_MATCHES_PRIVATE_TEST=False` using a literal Windows path comparison.
- `PID_IS_POSTGRES=True`, `PID_FILE_DIRECTORY_MATCH=False` using literal string equality, `COMMAND_LINE_VISIBLE=True`, `PRIVATE_PG_CTL_STATUS_CODE=0`.

## Interpretation

PostgreSQL's `pg_ctl status -D <private V31 data directory>` returned **0** (reports running). A byte-for-byte Windows path mismatch is NOT proof of a different database, because `C:/Users/.../data` vs `C:\Users\...\data` are logically the same. **However, that path-normalization explanation is still a hypothesis until the actual Windows canonical directory and process command-line agree.** Never stop production PostgreSQL (port 5432) to recover a temporary restore.

V31B source uses `spawnSync(pg_ctl, ..., {encoding:'utf8'})` for server startup and stop. The child postgres.exe can inherit stdout/stderr pipes, potentially keeping Node's capture open and causing a spawn timeout even after the server is ready. The V31B source also sets `started=true` only after the pg_ctl command completes; a false-negative startup can leave a running private postmaster and an uncleared scratch directory.

## V31C developed

Deliverable: `CORNHILL-V31C-PRIVATE-RESTORE-REPAIR.zip` (20,249 bytes), SHA256 `d045098fec581f6a4a21bf3ecf216e6bb20435fee7ff896ea42ca1ac54a936c9`. **74/74 Node tests passed**; ZIP CRC and the per-file SHA256 manifest verified.

The single PowerShell entrypoint executes:
1. all 74 deterministic tests and a live **read-only** school-finance integrity check (this earlier passed: 9 Posted, 9 receipts, zero posted-without-receipt or duplicate IDs),
2. pins the existing **original** historical V23 backup SHA256 `39c35f36c52ad10e111b541026f810dfbdf2a27131132435fc8617de81b5b1ea`,
3. attempts narrowly controlled recovery of the retained private V31 scratch: requires exact scratch path prefix under LocalAppData, `rehearsal-<32hex>`, no Windows reparse points, protected ACL, pid-file PID+private datadir canonical match, private port !=5432, running postgres.exe command-line match, and pg_ctl status=0 **before** `pg_ctl stop -D <exact private data directory>`. If a check fails, **no stop, delete, or new restore is attempted**; retain scratch for investigation,
4. after verified shutdown/status and no pid-file, deletes **only** the matching disposable V31 scratch, never the real school database,
5. starts a new fresh isolated PG17 cluster on a random loopback port; **pg_ctl start/stop use ignored captured stdio**; after ambiguous startup result, independently checks pg_ctl status rather than assuming success/failure; verifies exact private data directory and chosen port; uses PG17 and localhost-only identity before restore,
6. attempts atomic `pg_restore --no-owner --no-acl --single-transaction` into *fresh disposable postgres database*, verifies historical snapshot counts 484 learners, 169 assessments, 1991 marks, 9 Posted payments, 9 receipts and 2027 test year **only inside historical backup**,
7. attempts verified cleanup and prints only safe flags/counts. On uncertain process ownership, leaves private scratch for manual protected handling.

**No production schema/database/finance writes, no hosted calls, no installation or EXE/APK changes, no cloud sync.** Does not modify the original V23 archive. The real school Postgres 17 service (5432) and HTTPS server (4174) stay untouched.

**Important:** The full restore and cleanup have **not** been run on the Director's Windows machine yet; do not claim that V31C restored successfully until the Windows output proves it. This test concerns a **historical V23 pre-deletion backup**, not a backup of the latest live system. User-facing finance sync remains OFF due to cloud 8 Posted vs local 9 Posted; formal release blockers cleared 0/5.

## Why V31C is safer than rerunning V31B

- The orphan process is not killed by PID and Windows PostgreSQL service is never stopped.
- Literal path mismatch is replaced with canonical Windows path verification while still requiring private command-line and PID identity.
- The disposable PG17 child cannot trap Node's pg_ctl startup/stop pipe handles.
- New data folder cleanup never proceeds when startup/stop ownership or pid-file state is unverified.
- Non-success result produces nonzero exit status instead of returning a success-looking terminal exit.
