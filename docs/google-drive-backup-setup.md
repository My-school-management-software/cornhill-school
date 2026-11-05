# CORNHILL Google Drive Backup Setup

This integration is being prepared on `feature/cornhill-v3-foundation`. It is not connected to a school Google account until an administrator completes the OAuth setup below.

## 1. Create the school Google OAuth client

1. Sign in to Google Cloud Console using the school's dedicated Google account.
2. Create or select a project and enable **Google Drive API**.
3. Configure the OAuth consent screen and add the school administrator as a test user if the app is in testing.
4. Create an OAuth Client ID of type **Web application**.
5. Add this exact Authorized redirect URI:

   `https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/google-drive-backup`

6. Keep the Client ID and Client Secret private.

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
2. Open Records Centre → Backup & recovery centre.
3. Choose **Connect school Google account** and approve the requested access.
4. Return to CORNHILL and refresh the cloud status.
5. Run a manual cloud backup and verify the file appears in the **CORNHILL School Backups** folder in Google Drive.

## Current implementation boundaries

- Database tables for encrypted OAuth tokens, OAuth state and backup audit history are protected from anon/authenticated API access.
- The Edge Function verifies the signed-in administrator and encrypts the snapshot using AES-256-GCM before uploading it.
- The current snapshot covers the configured school database tables. It does not yet include Supabase Storage objects (learner photos, staff media), authentication accounts/passwords, or private message content.
- Automatic scheduling and safe restore/rollback are not enabled yet. They must be completed and tested before the school relies on this as its disaster-recovery system.
