# CORNHILL V32 — Current PostgreSQL17 snapshot, isolated restore and private encrypted local backup

Date: 27 November 2026 (EAT).

V31C DIRECTOR WINDOWS ACCEPTANCE: Success. Private V31 orphan cluster conclusively identified, stopped and cleaned. Restored original historical pre-deletion V23 archive into disposable separate PG17, counts 484 learners, 169 assessments, 1991 marks, 9 Posted payments, 9 receipts and one HISTORICAL 2027 test year. Historical 2027 presence is expected in the pre-deletion backup, not the working database. V31_RESTORE_RECORD_COUNTS=PASS; V31_REHEARSAL_CLEANUP=DONE; CORNHILL_V31C=FINANCE_AND_ISOLATED_RESTORE_PASS. Zero working DB changes or main server restart.

V32 ZIP prepared but NOT YET RUN ON DIRECTOR WINDOWS: CORNHILL-V32-CURRENT-BACKUP-AND-ISOLATED-RESTORE.zip, SHA256 c285444808c9efe724ea6d33825102485e359042862b74003ea85ed1951857f2, 17,297 bytes, 8 entries. ZIP CRC and SHA256 manifests checked, isolated Node 22 tests 56/56 PASS.

V32 verifies exact local cornhill_local administrative role, loopback 5432, PG17 and read-only transaction. Exports a single REPEATABLE READ READ ONLY pg_export_snapshot() token, collects snapshot counts, and runs pg_dump --snapshot=... with custom format. Verifies backup PGDMP magic, all required schema table data, hash, and restores into a NEW disposable localhost PG17 instance on non-production random port. Compares restored counts against exported snapshot counts (including 2027=0) then cleans the separate instance.

Only after isolated restore succeeds, V32 encrypts retained snapshot with AES-256-GCM and an independent 32-byte random key, protects key with Windows DPAPI CurrentUser, validates encryption roundtrip, stores encrypted backup, wrapped key and non-sensitive metadata in private owner-only Windows NTFS ACL folder under LocalAppData/CORNHILL/V32/EncryptedBackups. Raw backup and scratch are cleaned only if no private postgres.pid exists. Any private process ownership uncertainty fails closed.

IMPORTANT CAVEAT: DPAPI CurrentUser archives are ONLY recoverable under the same Windows user profile, not portable disaster-recovery backups. Keep separately verified cloud/off-device copies and create/rehearse an appropriate director-approved recovery-key process before relying on them for replacement-computer restore. V32 does not enable continuous backup scheduling, sync, finance posting, Windows/Android installers, live database migrations or cloud uploads.

V31C success is a narrow historical restore milestone. V32 is a current-state rehearsal package, not a completed restore until Director's actual Windows result passes. Hosted 8 Posted vs local 9 Posted remains unreconciled, so FINANCE SYNC OFF. Five formal release blockers remain 0/5.