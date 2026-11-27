# CORNHILL V31 — Separate PostgreSQL 17 Backup Restore Drill & Private Finance Audit

**Date:** 27 November 2026 (Africa/Kampala).

The Director's V30 Windows log confirmed 484 active learners, 169 assessments, 1,991 marks, **9 local Posted payments and 9 local payment receipts**, 0 active academic years, 2027 test year absent, and no automatic sync or database writes. The hosted Supabase read-only count is **8 Posted payments**. This discrepancy prevents safe financial replication.

## Delivered (Windows-only, non-destructive)

`CORNHILL-V31-READONLY-FINANCE-AND-RESTORE-DRILL.zip`

Verified ZIP SHA256: `d94806382612ba916656b7587c8f43012068b783d07e22d75830393894518262`.

**31/31 isolated Node 22 unit/safety tests pass; 0 failures, 0 skips.** Archive integrity check PASS. This is *development verification*; actual Windows run of V31 is **not yet observed**.

Running the package on the current Windows PC does **not install or overwrite application source**. It carries out two independent checks.

### 1. Finance cross-check — production PostgreSQL read-only

- Uses existing private local-server configuration, Node and PostgreSQL 17 on loopback 5432.
- Requires exact `cornhill_local` database, expected local admin role, OS host/port, PG17 and `transaction_read_only=on`.
- Begins `REPEATABLE READ READ ONLY`, counts Posted payments, receipts, Posted payments without receipts, orphan receipts, missing posting dates/idempotency, duplicated idempotency keys, orphan allocations and direct over-allocation. Rolls back always.
- Prints **counts only**, not learner names, receipts, phone numbers, monetary amounts, private credentials or exact payment rows.
- Does **not** reconcile the actual cloud/local payment identities or enable automatic finance sync.

### 2. Actual historical V23 backup restoration — isolated cluster

- Reads **only** the *existing* file: `C:\Users\hp\Downloads\CORNHILL-V23-BEFORE-TEST-YEAR-REMOVAL-2026-11-27T13-51-15-803Z.backup`, which was previously catalogue-verified by the Director during the V23 2027 test-year removal.
- Verifies PGDMP magic and PostgreSQL 17 `pg_restore --list` table-data inventory; computes archive SHA256.
- Requires at least **2 GiB free disk** and creates an owner-only ACL temporary scratch directory under `LOCALAPPDATA\CORNHILL\V31`; a separate **fresh PostgreSQL 17 cluster** on dynamic `127.0.0.1` port, using an independent random temporary database password.
- Checks the new PostgreSQL instance's *database name = postgres, actual server address, exact port, major version and private data directory*, rejecting any production target.
- Restores archive using `pg_restore --no-owner --no-acl --exit-on-error --single-transaction` **into that separate database only**.
- Verifies restored counts: **484** active learners, **169** assessments, **1,991** marks, **9** Posted payments, **9** receipts and **one historical 2027 test year**. This last record is *correctly present in a backup made before the Director deleted it*. The working database is never restored or modified.
- Stops separate test cluster, attempts secure scratch cleanup. Retains original private backup.
- If Windows privilege, disk, backup, identity, tool, restore, ACL or time limit checks fail, **the live database remains untouched**, with a short safe diagnostic. If scratch cleanup fails, it warns about retained private data; never upload or share scratch logs.

**No user credentials, payment data, actual backup or private certificate are included in this ZIP.**

### Known limits and next stage

Restoring a *historical* V23 archive establishes recoverability for that archived state, not today's live backup state. Restored record counts, even if matching, do not prove byte-for-byte row equivalence. If the original archive is absent or an isolated restore cannot run (Windows initdb may reject elevated execution), the step must report BLOCKED and not claim pass.

The V31 package does not publish a signed Windows EXE/Android APK, start Internet/LAN endpoints, merge posted payments, run a production migration, or activate offline/cloud synchronization. The Director explicitly rejected the `Goodlife` Wi-Fi as a school network. **Formal five blockers remain 0/5 cleared** until independent acceptance.

After a successful isolated V23 restore rehearsal, next require current-source **new snapshot backup** plus isolated restore and identity checks, reconcile individual payment provenance/retained credits inside private Director-controlled tools, and only then implement role-authorized incremental sync for learners/academics followed by finance-specific safe acceptance.
