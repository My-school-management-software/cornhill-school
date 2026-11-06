# CORNHILL Google Drive Backup Setup

The Google Drive backup connection is currently configured for the dedicated CORNHILL school account. The backup Edge Function is active in Supabase. Reconnection is needed only if the administrator sees an expired/revoked connection or the status screen says disconnected.

## 1. Google Drive connection

The integration uses a Google OAuth web client and the Drive `drive.file` scope, plus account email verification. The function accepts only the dedicated school account configured in its source. Its redirect URI is:

`https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/google-drive-backup`

Keep OAuth credentials private. Never place Client IDs with secrets, Client Secrets, refresh tokens or encryption keys in GitHub, school records, screenshots or ChatGPT messages.

## 2. Server-side Supabase secrets

The Edge Function uses these server-side secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `BACKUP_ENCRYPTION_KEY` — base64-encoded random 32-byte key
- `APP_BASE_URL`

The encryption key is essential for decrypting backups. Keep a protected offline recovery copy accessible only to the school owner/authorised recovery administrator. If it is lost, the encrypted backups cannot be decrypted. Do not rotate it without a controlled key-migration and recovery plan.

## 3. Current operation (checked 6 November 2026)

- Google Drive connection row exists, with the Drive folder configured and refresh token stored encrypted. No token value was read or exposed.
- Edge Function `google-drive-backup` is ACTIVE at version 26.
- Automatic backup scheduling is implemented through a protected scheduled handler and a daily scheduler check at 5:00 AM Uganda time. The school can select Daily, Weekly, Monthly, Every school term or Yearly in the administrator settings. The live setting observed on 6 November was enabled / Daily; always refresh status before relying on that setting.
- The latest successful backup observed during the 6 November review completed at 09:06:05 UTC (12:06:05 PM Uganda time), with 231 records. Two earlier attempts failed, followed by successful runs.
- The administrator interface includes a separate encrypted-backup validation action. No validation audit row existed during the review; do not describe the latest backup as independently validated until a successful validation result is recorded.

## 4. Backup content and privacy boundary

New backups use format `cornhill-google-drive-backup-v2`. The snapshot is encrypted with AES-256-GCM before upload.

The configured application database datasets are included, except these private communication datasets, which are deliberately represented as empty arrays in new snapshots:

- `communication_delivery_events`
- `communication_outbox`
- `school_sms_outbox`
- `staff_communication_posts`
- `staff_communication_comments`
- `staff_communication_reactions`
- `staff_direct_messages`
- `staff_media_messages`
- `staff_call_signals`

This prevents message bodies, recipient phone numbers, delivery payloads, media paths and call-signalling payloads from being copied into new backup files. Reusable communication templates remain part of the application configuration backup.

Supabase Storage objects (such as learner photos and staff media files) and Supabase Auth accounts/passwords/sessions are not included. They need separate, documented recovery arrangements.

**Historical format-v1 backups were created before this privacy exclusion.** Treat those older files as potentially containing private communication data. Keep their Drive access restricted to authorised school recovery administrators. Do not delete historical files without the school owner's retention decision.

## 5. Safe validation and restore boundary

- Validation downloads and decrypts the selected encrypted backup, checks its format, dataset manifest and record counts, and writes an audit result. It does not restore or alter school records.
- A successful validation is not the same as a successful restore.
- No one-click restore is enabled. Do not restore into the live school database as a test.
- A restore drill must use a separate isolated Supabase project/database, with no connection to the live school application, live parent portal, live communications provider or live Google Drive scheduler.
- Before any production recovery, confirm the school owner's authorisation, backup timestamp, encryption key, schema/migration compatibility, dependency order, file/auth recovery plan, record counts and application-level checks. Require a second authorised reviewer and a written cutover/rollback decision.

See [BACKUP_RECOVERY_RUNBOOK.md](BACKUP_RECOVERY_RUNBOOK.md) for the staged recovery gates.
