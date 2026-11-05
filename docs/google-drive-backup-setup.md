# CORNHILL Google Drive Backup Setup

This integration is being prepared on `feature/cornhill-v3-foundation`. The permitted school Google account is `info.cornhillnurandprisch2026@gmail.com`. The service rejects any other Google account. It is not connected until an administrator completes the OAuth setup below.

## 1. Create the school Google OAuth client

1. Sign in to Google Cloud Console using the school's dedicated Google account.
2. Create or select a project and enable **Google Drive API**.
3. Configure the OAuth consent screen and add the school administrator as a test user if the app is in testing.
4. Create an OAuth Client ID of type **Web application**.
5. Use the dedicated school account `info.cornhillnurandprisch2026@gmail.com` as the Google Cloud project owner and the account that will authorize Drive access.
6. Add this exact Authorized redirect URI:

   `https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/google-drive-backup`

7. Keep the Client ID and Client Secret private.

The app requests only the `drive.file` scope plus the account email scope. This limits its Drive access to files created by this app.

## 2. Add server-side secrets in Supabase

Open Supabase Dashboard → Project Settings / Edge Functions → Secrets and add:

- `GOOGLE_CLIENT_ID` — OAuth Client ID from Google Cloud
- `GOOGLE_CLIENT_SECRET` — OAuth Client Secret from Google Cloud
- `GOOGLE_REDIRECT_URI` — the exact redirect URI above
- `BACKUP_ENCRYPTION_KEY` — a base64-encoded random 32-byte key
- `APP_BASE_URL` — the current CORNHILL preview URL (include https://, no trailing slash)

Generate the encryption key locally with:

```bash
openssl rand -base64 32
```

Do not send any secret to ChatGPT, put it in GitHub, or paste it into the school app. Store the encryption key safely: encrypted backups cannot be decrypted if this key is lost. Keep a protected offline copy accessible only to the school owner/authorised recovery administrator.

## 3. Connect the account

After the secrets are saved and the latest preview is available:

1. Sign in to CORNHILL as an administrator.
2. Open Settings → Backup & recovery.
3. Choose **Connect school Google account** and approve the requested access.
4. Return to CORNHILL, open Settings → Backup & recovery, and refresh cloud status.
5. Run a manual cloud backup and verify the file appears in the **CORNHILL School Backups** folder in Google Drive.

## Current implementation boundaries

- Database tables for encrypted OAuth tokens, OAuth state and backup audit history are protected from anon/authenticated API access.
- The Edge Function verifies the signed-in administrator and encrypts the snapshot using AES-256-GCM before uploading it.
- The current snapshot covers the configured school database tables. It does not yet include Supabase Storage objects (learner photos, staff media), authentication accounts/passwords, or private message content.
- Automatic scheduling is not yet operational: a database schedule record exists, but the scheduled Edge Function handler and schedule controls still need implementation and verification.
- Safe restore/rollback is not enabled yet. It must be designed with a dry-run, dependency ordering, confirmation and recovery validation before use.
