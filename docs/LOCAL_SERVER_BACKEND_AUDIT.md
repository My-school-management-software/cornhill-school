# CORNHILL local-server backend and navigation audit
Date: 13 November 2026
Branch: `feat/local-first-server-pilot-20261113`

## Purpose and safety boundary

This is a source-code inventory for the reversible local-server pilot. It does not change application behavior, database schema, hosting, credentials, or production data. The pilot remains isolated and synthetic-data-only. No production Supabase or Vercel service is modified by this audit.

## Verified findings

### 1. Hosted Supabase endpoint is repeated in standalone workspaces

The following HTML files were inspected on the pilot branch and contain the hosted project URL directly in their source:

| Workspace file | Connection pattern observed | Additional dependency |
|---|---|---|
| `admissions.html` | Supabase JS client created from an inline URL and publishable key | Parent admissions authentication / data access |
| `banking.html` | Supabase JS client created from an inline URL and publishable key | Banking records and evidence workflow |
| `evidence.html` | Supabase JS client created from an inline URL and publishable key | Private Storage bucket `cornhill-private-evidence`, uploads and downloads |
| `notifications.html` | Supabase JS client created from an inline URL and publishable key | Notifications and related workspace links |
| `records.html` | Supabase JS client created from an inline URL and publishable key | Private Storage signed URLs and downloads |
| `school-services.html` | Supabase JS client created from an inline URL and publishable key | Multiple staff/service workspaces |
| `parents.html` | Parent API URL assembled from the hosted project URL | Supabase Edge Function `parent-portal-api` |

The browser-side key found in these pages is a publishable key, not a service-role secret. It must still be paired with correct RLS and function authorization. Never place a service-role key, database password, JWT secret, or other privileged credential in browser code or a public repository.

Authentication storage keys are deliberately different between several workspaces. A future shared configuration must not collapse these into one shared session namespace.

### 2. The public website is not the system-of-record client

The inspected `school.html` page is a public-information website and links to admissions and the parent portal. It does not show a direct Supabase client initialization in the inspected source. Its navigation currently points to separate Vercel deployment domains.

### 3. Main management entry point inspected

`vercel.json` rewrites `/apps/school-management/` to `/index.html`. The 1,083,497-byte `index.html` was retrieved through its Git blob and inspected.

- The management page embeds the same hosted Supabase project URL and a browser publishable key, then creates the main Supabase client.
- It loads Supabase JS from jsDelivr using the floating `@2` tag, plus QR-code and spreadsheet libraries from CDNs.
- It directly calls two Supabase Edge Functions: `google-drive-backup` and `parent-portal-api`.
- The main page does not contain a hard-coded `*.vercel.app` destination in the inspected source; the separate workspace pages and some database-generated notification records do contain cloud deployment URLs.

This closes the main-page source gap, but the scripts, Edge Functions, database-stored route values and every migration still need to be considered before declaring the full application local-ready.

### 4. Current service-worker boundary

`service-worker.js` describes and implements a cache for the application shell and approved static libraries. Its fetch handler intentionally leaves unknown cross-origin traffic, Supabase/API/auth requests, uploads, payment traffic and other backend calls network-only. The existing encrypted draft helper is not a local copy of authoritative school records.

The service worker attempts to cache the Supabase JS library from a public CDN. For a no-internet LAN pilot, the application should serve a pinned, locally hosted copy of its required client libraries; do not depend on a first-time CDN download while offline.

### 5. Cross-workspace navigation is tied to separate Vercel domains

The inspected pages contain absolute links to separate `*.vercel.app` hosts. The notifications workspace links to 18 distinct Vercel hostnames for the main system and satellite workspaces. Banking, records, evidence, admissions and public-site pages also contain cross-deployment links.

A local pilot must use same-origin relative workspace routes (or a controlled environment-aware route map). Otherwise, a local operator may unintentionally leave the pilot and open a cloud page. This is a data-integrity and operator-confusion risk, not just a cosmetic issue.

## Server-side and migration dependencies

The repository tree contains four Edge Function implementations and 213 SQL migrations under `supabase/migrations/`. The four function files were inspected for runtime configuration, privileges and external services:

| Edge Function | Server-side dependencies to configure for local pilot |
|---|---|
| `class-teacher-code` | Reads `SUPABASE_URL` and a server-only secret/service-role key; imports Supabase JS from `esm.sh`. |
| `staff-invite` | Reads `SUPABASE_URL` and a server-only secret/service-role key; imports Supabase JS from `esm.sh`. |
| `parent-portal-api` | Uses a server-only service-role key; its CORS allow-list currently names production Vercel origins and will not admit a school LAN origin by default. The local origin must be explicitly configured without making sensitive guardian endpoints public. |
| `google-drive-backup` | Uses a server-only Supabase key, `BACKUP_ENCRYPTION_KEY`, Google OAuth client/secret/redirect settings and external Google OAuth/Drive APIs. Its return URL defaults to a Vercel site unless `APP_BASE_URL` is set. Google Drive backup requires internet access and must not be treated as the school's only offline backup. |

The Edge Functions import Supabase JS through remote `esm.sh` or `npm:` specifiers. Pin and pre-cache/vendor dependencies as appropriate for the local deployment; do not assume the first function startup can resolve dependencies without internet.

Selected migrations confirm that the system uses platform extensions and scheduled work:

- A staff-attendance alert job is registered with `pg_cron` on a five-minute schedule.
- The scheduled Google Drive backup path uses `pg_cron`, `pg_net`, and Vault-stored URL/token values to call the `google-drive-backup` Edge Function.
- The notification records scanner also registers scheduled work through `pg_cron`.
- Parent payment SMS is first placed into a protected `school_sms_outbox` table by a database trigger. Provider delivery is a separate dependency and is not proven by the outbox migration alone.

The repository tree does not contain `supabase/config.toml` or a `supabase/seed.sql` file. The 213 migration files must be reviewed and applied in order against a clean local database, with a reproducible local configuration and a separate synthetic-data seed plan. Check extension availability, Vault secrets, scheduled jobs, function environment variables, auth redirects, storage buckets and CORS before declaring service parity.

## Recommended implementation design

1. Complete the source inventory, starting with `index.html` and any scripts that it loads. Enumerate Supabase clients, direct REST/Edge Function URLs, Storage operations, auth redirects, Realtime subscriptions, CDN scripts and absolute workspace links.
2. Introduce one explicit runtime configuration loaded before any Supabase client is created. It should provide the selected backend mode, Supabase URL, publishable key and same-origin workspace route base. Preserve each workspace's separate auth storage key.
3. Use a pilot-host configuration that points only to the local LAN Supabase endpoint. Keep host-specific runtime configuration outside the shared source where practical; never commit private credentials.
4. **Fail closed:** the local-pilot build must not silently fall back to the hosted production backend when the local endpoint is unavailable or misconfigured. Show a clear connection error and environment label. A move to hosted fallback must be an explicit, controlled operator action.
5. Keep all privileged functions server-side. Deploy and test required Edge Functions on the local stack, including `parent-portal-api`; review cron/scheduled jobs and any managed-platform dependencies separately.
6. Replace hard-coded external workspace links with same-origin routes for the local environment. Verify every route in `vercel.json` has a matching local static-host route.
7. Pin and serve the browser client library locally. Confirm local Auth, REST, Realtime and private Storage behavior before testing any school workflow.
8. Keep separate local test users and synthetic records. Do not copy live learner, staff, guardian, attendance or finance data into this pilot.
9. Configure and verify the four Edge Functions, their server-only secrets, the parent portal LAN-origin allow-list and the Google Drive callback URL.
10. Verify `pg_cron`, `pg_net`, Vault secrets and each scheduled job on the self-hosted stack. Keep SMS and Google Drive outbound delivery disabled during LAN-only tests.

## Acceptance checks for the backend-switch batch

These checks must be run after implementation; this audit does not claim that they have passed.

1. Main management page reads the explicit local runtime configuration.
2. Admissions reads the same configured local backend.
3. Parent portal calls the local `parent-portal-api` function.
4. Banking connects only to the configured local backend.
5. Evidence Capture connects only to the configured local backend.
6. Records Centre connects only to the configured local backend.
7. Notifications connects only to the configured local backend.
8. School Services connects only to the configured local backend.
9. No inspected page contains an active hard-coded production Supabase project URL.
10. No service-role or other privileged secret is shipped to the browser.
11. Each workspace retains its intended separate auth storage namespace.
12. Auth sign-in, sign-out and refresh work against the local Auth service.
13. Parent guardian verification remains isolated to the selected learner and guardian.
14. Private evidence upload, signed URL and download work against local Storage policies.
15. Realtime-dependent screens reconnect to the local Realtime service, and the required scheduled jobs run on local extensions.
16. Missing or invalid local configuration fails visibly and does not contact production.
17. No local navigation link or generated notification opens a cloud Vercel workspace.
18. The app shell, pinned JS libraries and Edge Functions start successfully without relying on an unplanned CDN fetch.
19. At least ten concurrent LAN sessions can use the isolated environment without cross-session data leakage.
20. After a test transaction, a restart and a backup/restore rehearsal preserve the test data and referential integrity.

## Current status

- [x] Seven backend-connected workspace files inspected.
- [x] Parent portal Edge Function dependency recorded.
- [x] Vercel rewrite map and cross-workspace links inspected.
- [x] Service-worker cache boundary recorded.
- [x] Main management `index.html` inspected for Supabase client, Edge Function endpoints and CDN dependencies.
- [ ] Remaining server-side route values, database-generated URLs and all scripts fully inventoried.
- [x] Four Edge Function files and their environment-variable dependencies inspected.
- [x] 213 migration files counted; selected scheduled-work migrations inspected for pg_cron, pg_net and Vault dependencies.
- [ ] Shared runtime configuration implemented and tested.
- [ ] Same-origin local navigation implemented and tested.
- [ ] Local Supabase functions, Auth, Realtime and Storage tested.
- [ ] Physical Windows host inspected and local stack installed.
- [ ] No-internet LAN, multi-device, backup and restore acceptance gates passed.

No production cutover is authorised by this audit.
