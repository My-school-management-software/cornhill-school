# CORNHILL V32C — Director Windows SeSecurityPrivilege block & DACL-only hotfix

Date: 27 November 2026 (EAT).

## Director's genuine V32B Windows failure

- V32B Node tests: **101/101 passed**, 0 fail, 0 skipped.
- **V32B synthetic DPAPI preflight: PASS**; Windows CurrentUser key recoverability confirmed.
- Next stage failed before opening the school database: `Set-Acl : The process does not possess the 'SeSecurityPrivilege' privilege which is required for this operation.` At `Run-CORNHILL-V32B.ps1` line 36 applying a freshly constructed `DirectorySecurity` to `LOCALAPPDATA\CORNHILL\V32`.
- V32B did **not** start another PostgreSQL backup/restore or save a new encrypted archive in that run. Do **not** claim encrypted backup success. V32 earlier *did* restore a fresh current snapshot into a separate PG17 cluster successfully (484/169/1991/9/9; 2027=0); it failed later in encryption.

## V32C ZIP built and independently tested

`CORNHILL-V32C-PRIVATE-ACL-ENCRYPTED-BACKUP-REPAIR.zip`
- Size: **26,561 bytes**.
- SHA-256: `a23d12eafcbe10afee1f657e53555e9e86c3ca4e8ad945a3047aefb780b18b60`.
- ZIP CRC: PASS; SHA256SUMS for all 12 content files: PASS.
- **122/122 Node deterministic tests PASS**, 0 failed, 0 skipped, on isolated Node v22 environment. **Real Windows V32C results not yet reported**.

The V32C PowerShell entrypoint:
1. Reuses the verified V32B random-key Windows DPAPI CurrentUser self-test before any school backup.
2. Replaces `Set-Acl` with .NET `Directory.GetAccessControl` limited to `AccessControlSections.Access` and `Owner`, and `Directory.SetAccessControl` after modifying ONLY the DACL.
3. Requires the current Windows SID to already own each directory; never attempts `SetOwner`, reads/modifies SACL/audit rules, enables `SeSecurityPrivilege`, elevates privileges, broadly grants access or runs `icacls /grant Everyone`.
4. Rejects reparse points/junctions in LocalAppData ancestors; removes inherited/broad ACL entries, adds sole current-user full-control inheritable access rule, and verifies the resulting one-entry protected DACL.
5. Executes a synthetic non-school test-file creation and ACL inheritance check in a temporary private folder, removing the test files before any school backup.
6. On DACL success only, reuses UNMODIFIED V32B source to create fresh READ ONLY exported Postgres17 snapshot, restore into new disposable loopback PG17 cluster, verify count parity/2027 absence, encrypt AES-256-GCM with CurrentUser DPAPI-wrapped key, verify saved key roundtrip and then private cleanup.
7. On any unexpected permission/ownership issue fails closed before backup with status `V32C_PRIVATE_DACL=BLOCKED` and no database writes or cloud calls; no production source is installed or overwritten.

**Potential Windows-specific caveat:** The DACL behavior has not yet been executed on Director's Windows PowerShell 5.1; tests are source/security contract tests on Linux. This fix was checked against Microsoft documentation for `.NET Directory.SetAccessControl` and Windows access-control sections, but must still pass the user's actual Windows test.

**No command should be run as Administrator to work around an ordinary user ACL permission failure**; fail closed and inspect folder ownership or ACL if V32C still blocks. Never send backup files, raw financial records, DPAPI wrapped keys or `.env` in chat.

Finance cloud Posted=8 vs local Posted=9 remains NOT RECONCILED; finance sync off. DPAPI CurrentUser backup is **not portable disaster recovery**; existing offsite backups continue. Formal full release blockers 0/5 cleared.
