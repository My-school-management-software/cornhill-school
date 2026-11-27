# CORNHILL V32 Windows result and V32B private-key encryption repair

Date: Friday 27 November 2026 (EAT).

## V32 Director's verified Windows output

Fresh read-only exported PostgreSQL17 snapshot:
- LOCAL active learners 484, assessments 169, saved marks 1991, Posted payments 9, receipts 9, test year 2027 = 0.
- Fresh current snapshot captured; custom pg_dump archive TOC verified; raw archive SHA256 2f0e1cbd87949dd44469b547d56f3c4af1f4665029ec5560eb888e48eafced11.
- Restored into an independently isolated PostgreSQL17 cluster with matched counts 484/169/1991/9/9/0, restore count check PASS, cleanup DONE.
- Live database writes 0, main HTTPS/PG service restart false, cloud writes 0; finance sync still DISABLED.
- **FAILED subsequent encrypted retained backup stage**: V32_BACKUP=BLOCKED, V32_BLOCK_REASON=PRIVATE_BACKUP_ENCRYPTION, V32_NEW_LOCAL_ENCRYPTED_BACKUP=false, V32_PRIVATE_SCRATCH_CLEANUP=DONE. No current-state encrypted backup can be claimed as retained. Exact cause not identified from V32 original broad catch-all code, so don't overstate it as only Windows DPAPI.

## Built V32B engineering hotfix package

`CORNHILL-V32B-ENCRYPTED-BACKUP-HOTFIX.zip` 24,313 bytes, SHA256 `01a43a10465b114edc65fd0016b1da0011abf55777c3f0253a43871b0d7749d9`; ZIP CRC and every SHA256SUMS entry verified. Extracted archive's deterministic tests: **101/101 PASS**, zero fail, zero skip, tested on isolated Node22 Linux runtime; NOT yet verified on Director's Windows.

Changes only within this independent ZIP:
- Require Windows DPAPI **synthetic ephemeral key** wrap/unwrap selftest under CurrentUser *before* opening school database or creating any new backup. Fail closed on unavailable DPAPI.
- Load System.Security/ProtectedData explicitly where necessary, call PowerShell using UTF-16LE EncodedCommand and stdin to pass key, never process args, logs or environment.
- Verify wrapped key can be decrypted back to the same 32-byte random key under same current Windows user.
- Encrypt only AFTER a fresh current pg_dump and isolated PG17 restore pass; stream AES-256-GCM, check ciphertext decrypt digest and recheck saved DPAPI wrapped key file.
- On failure log narrowly bounded phase as V32B_ENCRYPTION_FAILED_AT (not sensitive data); cleanup incomplete private process remains explicitly blocked.
- Existing V32 read-only snapshot/PG17 identity/ACL/isolated cleanup preserved, no live school writes, finance/cloud sync still OFF, no original production script/source overwritten.

Caveat: DPAPI CurrentUser makes encrypted archived snapshot accessible only on same Windows profile; it is not replacement-device recovery. Off-site recovery and external key escrow remain separate work. Cloud Posted 8 vs local Posted 9 still requires row-identity reconciliation; 0/5 global formal release gates cleared.

Archive available to Director as a ChatGPT ZIP attachment, not yet published as Windows EXE/Android APK or to public Installation Centre. No actual school backup files or secrets included.
