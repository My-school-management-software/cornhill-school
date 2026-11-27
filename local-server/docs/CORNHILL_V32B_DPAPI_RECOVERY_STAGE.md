# CORNHILL V32B — private current-backup encryption repair

27 November 2026 EAT.

## V32 ACTUAL Director Windows result

V32 passed all its isolated current-state restore checks on the real PC:
- 484 active learners, 169 assessments, 1991 marks, 9 local Posted payments and 9 local receipts, zero 2027 test years.
- A new current read-only exported PostgreSQL 17 snapshot was dumped and the custom archive TOC verified.
- An independently initialized PG17 cluster restored the snapshot and its **same snapshot** aggregate counts matched.
- `V32_RESTORE_RECORD_COUNTS=PASS`, `V32_REHEARSAL_CLEANUP=DONE`, `V32_RESTORE_TEST=PASS_FRESH_SNAPSHOT`.
- Working school DB writes 0, finance sync OFF, cloud writes 0, real server not restarted.
- **V32 encrypted backup failed**: `V32_BACKUP=BLOCKED`, `V32_BLOCK_REASON=PRIVATE_BACKUP_ENCRYPTION`, `V32_NEW_LOCAL_ENCRYPTED_BACKUP=false`, `V32_PRIVATE_SCRATCH_CLEANUP=DONE`. Thus the freshly restored backup was **not retained as a usable encrypted archive**. Do not claim that a retained current backup exists.

## V32B repair package

Built `CORNHILL-V32B-DPAPI-ENCRYPTION-REPAIR.zip` (24,313 bytes; SHA-256 `f8db240587d73b4688fccbf8796eb79781ede45e728b476d787b13e6f5e8ce58`), with ZIP CRC and internal file SHA256 manifest checked; all **101/101 Node tests PASSED** after re-extraction into a fresh temporary directory on Linux Node 22. Windows V32B acceptance **not yet performed**.

- Supplies explicit `System.Security` assembly loading and UTF16LE PowerShell `-EncodedCommand` to avoid ambiguous `-Command` quoting and unavailable DPAPI type under some Windows shell environments. The AES key is passed via the local child process stdin, never CLI args, environment or output.
- Runs an isolated DPAPI synthetic random-key wrap+unwrap preflight **before any school DB connection/dump**. If DPAPI cannot be used by the Windows profile, it **fails closed** and no new school backup is made.
- Retains V32's verified read-only exported snapshot/isolated PG17 restore routine; only after that succeeds attempts AES-256-GCM streaming encryption.
- Independently authenticates AES-GCM ciphertext by in-memory decryption and SHA256 comparison, writes private metadata and DPAPI CurrentUser-wrapped key with exclusive file create, then tests the **saved** DPAPI key by reading and unwrapping it in a fresh Windows PowerShell child. Never prints keys, school records, backup paths or private errors.
- If encryption still fails, prints **only** the specific non-sensitive `V32B_ENCRYPTION_FAILED_AT` phase (WINDOWS_DPAPI_KEY_WRAP, SOURCE_BACKUP_VALIDATION, AES256GCM_STREAM_ENCRYPTION, AES256GCM_STREAM_AUTHENTICATION, PRIVATE_METADATA_SAVE or DPAPI_SAVED_KEY_RECOVERY); removes any partial encrypted output, cleans private scratch only after verified isolated cluster stop, and reports encrypted backup=false.
- Does not change any existing installed school source, real database, server, finance records, live cloud, network policies, Android/Windows EXE, or sync endpoints.

V32B is a **probable repair plus trustworthy diagnostics** rather than a demonstrated Windows encryption success. Both the existing V32 real snapshot restore PASS and the failure to retain the fresh encrypted archive must be stated accurately.

## Remaining acceptance

1. Director Windows V32B prints `V32B_DPAPI_SYNTHETIC_PREFLIGHT=PASS`, `V32_RESTORE_TEST=PASS_FRESH_SNAPSHOT`, `V32B_DPAPI_SAVED_KEY_RECOVERY=PASS`, `V32_NEW_LOCAL_ENCRYPTED_BACKUP=true`, `V32_PRIVATE_SCRATCH_CLEANUP=DONE`, final success marker.
2. Same-user DPAPI archive is **not portable** to a replacement Windows computer and cannot replace independently verified off-device disaster recovery. Do not ask for keys/backups.
3. Local 9 vs hosted 8 Posted payment transactions still unreconciled; **finance sync must remain OFF**.
4. Five complete system release blockers still formally 0/5 cleared until independent full acceptance.
