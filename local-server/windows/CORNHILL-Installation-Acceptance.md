# CORNHILL Windows installation acceptance

Run this checklist on separate, clean Windows 10 and Windows 11 virtual machines. Use only a disposable test database and synthetic accounts and records. Do not point the installer or updater at the school's existing database.

Record the Windows edition/build, PostgreSQL 17 version, Node.js version, installer commit, database name, test date and tester. Mark each line **Pass**, **Fail** or **Not run** and attach sanitized logs that contain no passwords, learner records, staff personal details or connection strings.

## Before installation

- [ ] Confirm the VM has no prior CORNHILL data or PostgreSQL database named `cornhill_local`.
- [ ] Confirm PostgreSQL 17 command-line tools and Node.js 22 are available.
- [ ] Confirm firewall and listener checks keep the local service bound to loopback.
- [ ] Start with a clean checkout of the approved development branch and verify its commit.
- [ ] Keep the VM snapshot so the test can be repeated without touching another machine or database.

## Initial setup and database

- [ ] Run the installer as an ordinary school user and record any requested administrator action.
- [ ] Confirm existing `.env` values are preserved; newly generated secrets are not shown in the terminal or logs.
- [ ] Confirm database creation is restricted to the new disposable `cornhill_local` database on PostgreSQL 17 loopback.
- [ ] Confirm the installer creates a private pre-migration backup and validates it with `pg_restore --list` before migrations.
- [ ] Simulate a backup-tool failure in the disposable VM and confirm installation stops before any migration is applied.
- [ ] Confirm migration ledger and schema verifiers report the expected version and 95 migrations after this batch is installed.

## Director setup and application use

- [ ] Complete the first Director setup using a synthetic account and a newly generated password.
- [ ] Confirm login succeeds over `https://localhost:4174` and fails with an incorrect password.
- [ ] Confirm staff permissions are restricted to the configured role and the first Director grant is protected.
- [ ] Start the application, open the workspace, sign out and sign back in.
- [ ] Stop and restart the application using the supported launcher; confirm the same database and account remain available.
- [ ] Confirm the listener is reachable from the VM only and no service is exposed on the LAN.

## Backup and recovery

- [ ] Create a backup and verify the archive listing, SHA-256 metadata and owner-only Windows ACL.
- [ ] Restore the backup to a uniquely named disposable database on the same isolated PostgreSQL test instance.
- [ ] Verify restored schema and synthetic record counts match the source test database.
- [ ] Confirm the recovery procedure leaves the source database unchanged.

## Updating without data loss

- [ ] Insert synthetic learner, guardian, staff, academic, fee, payment and receipt records into the disposable database.
- [ ] Run the updater on the same approved branch and confirm it fast-forwards only when there are no local changes.
- [ ] Confirm the updater creates and verifies a private backup before migrations.
- [ ] Confirm an invalid backup prevents migrations and leaves all synthetic records readable.
- [ ] Complete the update, rerun the schema and repository verifiers, and compare the synthetic records and receipt identity before and after.
- [ ] Confirm learner admission codes, LIN, academic snapshots, class history, bursary balances and posted receipts remain attached to their stable IDs.

## Acceptance decision

Accept Windows 10 and Windows 11 independently only after every applicable step passes on that OS. A skipped or blocked step is not a pass. Preserve the sanitized test log, VM snapshot identifier, installer commit and migration ledger count with the school acceptance record.
