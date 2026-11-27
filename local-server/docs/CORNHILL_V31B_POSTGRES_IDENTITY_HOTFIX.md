# CORNHILL V31B — V31 identity-block repair (27 Nov 2026)

Director's V31 run: original 31/31 Node tests PASSED; finance check returned `CORNHILL_V31_FINANCE=BLOCKED`, `FINANCE_CHECK_REASON=V31_BLOCKED_LIVE_DB_IDENTITY`, and PowerShell aborted before any backup restore. The target was not modified; neither live finance checks nor isolated restoration were accepted.

## Root cause candidate

V31 queried `inet_server_addr()::text` whereas the **successful real Windows V30** verifier queried `host(inet_server_addr())`. The inet cast can include a network-prefix suffix; strict comparison with bare loopback address then fails even if the local database is correct. We cannot confirm this is the only cause without running corrected checks on the Windows computer. V31B changes ONLY the identity expression to V30's proven `host(inet_server_addr())`, and changes port detection to V30's `current_setting('port')::int`.

A new guard verifies six requirements, all still mandatory: exact cornhill_local DB, exact cornhill_local_admin login, real PG server loopback only, real 5432 port, read-only transaction, PostgreSQL 17. On any mismatch it returns only Boolean per-gate PASS/BLOCK flags, never credentials, payment records or identities. **No identity bypass.**

## Delivered and verified

New downloadable `CORNHILL-V31B-READONLY-FINANCE-RESTORE-HOTFIX.zip`: **14,524 bytes**, SHA-256 **`f6923dd2488e0303fd40f910a512bc8d3df8c67ecd6d962cfc78eb5de7d18425`**, ZIP CRC PASS, nine files and internal SHA256SUMS PASS. **49/49 Node deterministic tests pass** (original 31 plus 18 new). Existing V31 read-only finance audit, pre-existing V23 historical backup restore to disposable loopback PG17 cluster, ACL + disk checks, restore cleanup were preserved. Runner is `Run-CORNHILL-V31B.ps1` in the ZIP, called in one batch.

**Actual Windows V31B test still pending**; cannot assert finance check or real restore passed until new PowerShell report. No app source files are installed or modified, no new EXE/APK, no cloud writes, no live-school database writes, and no sync enabled. Early V31 identity failure stopped safely.

Cloud 8 Posted payments vs previously checked local 9 Posted payments remains an unresolved ledger reconciliation blocker. Formal five release gates still 0/5 cleared.
