# CORNHILL Backup Validation and Recovery Runbook

**Status date:** 6 November 2026  
**Current boundary:** validation is separate from restore. No production restore is authorised by this document.

## A. Current verified state

- Supabase Edge Function `google-drive-backup` is ACTIVE at version 26.
- Encrypted Google Drive connection is configured.
- Latest successful run observed on 6 November 2026 completed at 09:06:05 UTC (12:06:05 PM Africa/Kampala) and recorded 231 rows.
- Two earlier backup attempts failed, then later backup attempts succeeded.
- No row existed in `google_drive_backup_validations` during the read-only review. The latest backup therefore remains **not independently validated**.
- The function uses encrypted format v2 for new backups. Format v1 remains accepted by the validator for historical backups.
- The Supabase health advisor returned zero health lints during the review. This is not proof of restore readiness.

Recheck live backup status before every recovery decision; the values above are a dated observation, not a guarantee of current status.

## B. Routine administrator validation (non-destructive)

1. Sign in with an active school administrator account.
2. Open **Settings → Backup & recovery** and refresh cloud status/history.
3. Confirm the chosen run is marked successful and has a Drive file ID.
4. Select **Validate latest backup**.
5. Wait for the validation request to finish. Do not close the page while it is running.
6. Refresh history and confirm a persisted validation row for that exact backup run with status `passed`.
7. Record the file name, completion time in Uganda time, total records, dataset count, validation time and administrator.
8. If validation fails, retain the failure audit and do not treat the file as recoverable. Check the error with the authorised system administrator.

Validation decrypts and checks the snapshot format, exact dataset manifest and row counts against both the encrypted snapshot and backup audit. It does **not** restore, write to, or modify school tables.

## C. Privacy scope of new format-v2 backups

These datasets are intentionally present as empty arrays in new backups:

- `communication_delivery_events`
- `communication_outbox`
- `school_sms_outbox`
- `staff_communication_posts`
- `staff_communication_comments`
- `staff_communication_reactions`
- `staff_direct_messages`
- `staff_media_messages`
- `staff_call_signals`

This excludes private message bodies, phone numbers, delivery payloads, media paths and call signalling. Reusable templates remain included. Supabase Storage files and Supabase Auth accounts/passwords/sessions are also outside the current snapshot.

Historical format-v1 backups predate this exclusion and may contain those communication rows. Treat them as sensitive, restrict Drive access and follow the school's retention decision. Do not silently delete historical backups.

## D. Isolated restore drill — not yet performed

A restore drill is **not** to be run against the production Supabase project.

Before any drill:

- Obtain written approval from the school owner/authorised adult administrator.
- Create a separate, temporary Supabase project or isolated database with no production credentials, no production application URL and no live integrations.
- Confirm the exact backup file and a successful validation audit.
- Obtain the correct backup encryption key from the school's protected offline custody. Never paste it into chat, GitHub or a browser form.
- Prepare the exact schema/migration version required by the snapshot.
- Plan dependency order and foreign-key handling before importing anything.
- Keep Storage objects and Auth accounts as separate recovery workstreams; they are not in this backup.
- Use test-only accounts and synthetic records in the isolated environment.

During the drill:

1. Download and decrypt the selected backup only in the controlled recovery environment.
2. Verify format, dataset names, row counts and privacy exclusions again.
3. Restore into the isolated database in dependency order, with errors causing the drill to stop.
4. Compare per-table counts and key relationships with the snapshot manifest.
5. Run application checks for learner identity, class placement, academic history, bursary/charges, payments/allocations, receipts, staff access and guardian isolation.
6. Confirm no production URL, production key, live SMS/WhatsApp provider or production Drive scheduler is connected.
7. Record failures and recovery time. Destroy the isolated test database after the school owner approves the test report.

## E. Production recovery gate

A production restore is a separate, high-impact operation. It requires explicit school-owner approval, a fresh backup of the current production state, a reviewed restore plan, a second authorised reviewer, a verified rollback path, and a planned maintenance window. Never overwrite production as an experiment.

## F. Current open items

- [ ] Run the administrator's encrypted-backup validation and confirm a persisted `passed` audit row.
- [ ] Establish a protected, documented offline custody process for the encryption key.
- [ ] Arrange separate recovery for Supabase Storage objects and Auth accounts.
- [ ] Create an isolated test project and complete a restore drill.
- [ ] Have the school owner approve the recovery report and production cutover procedure.
