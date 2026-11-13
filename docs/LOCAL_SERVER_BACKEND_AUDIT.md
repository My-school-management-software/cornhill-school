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

### 3. The main management entry point still needs source inspection

`vercel.json` rewrites `/apps/school-management/` to `/index.html`. GitHub tree metadata reports `index.html` is 1,083,497 bytes, but the repository file-reading connector returned an empty body for that file, including for requested line ranges. Its actual backend initialisation, endpoints, direct fetches, and script loading have therefore **not** been verified in this audit.

Do not implement the runtime switch or claim that the full system is locally configurable until the main `index.html` and any scripts it loads are inspected by a reliable method.

### 4. Current service-worker boundary

`service-worker.js` describes and implements a cache for the application shell and approved static libraries. Its fetch handler intentionally leaves unknown cross-origin traffic, Supabase/API/auth requests, uploads, payment traffic and other backend calls network-only. The existing encrypted draft helper is not a local copy of authoritative school records.

The service worker attempts to cache the Supabase JS library from a public CDN. For a no-internet LAN pilot, the application should serve a pinned, locally hosted copy of its required client libraries; do not depend on a first-time CDN download while offline.

### 5. Cross-workspace navigation is tied to separate Vercel domains

The inspected pages contain absolute links to separate `*.vercel.app` hosts. The notifications workspace links to 18 distinct Vercel hostnames for the main system and satellite workspaces. Banking, records, evidence, admissions and public-site pages also contain cross-deployment links.

A local pilot must use same-origin relative workspace routes (or a controlled environment-aware route map). Otherwise, a local operator may unintentionally leave the pilot and open a cloud page. This is a data-integrity and operator-confusion risk, not just a cosmetic issue.

## Recommended implementation design

1. Complete the source inventory, starting with `index.html` and any scripts that it loads. Enumerate Supabase clients, direct REST/Edge Function URLs, Storage operations, auth redirects, Realtime subscriptions, CDN scripts and absolute workspace links.
2. Introduce one explicit runtime configuration loaded before any Supabase client is created. It should provide the selected backend mode, Supabase URL, publishable key and same-origin workspace route base. Preserve each workspace's separate auth storage key.
3. Use a pilot-host configuration that points only to the local LAN Supabase endpoint. Keep host-specific runtime configuration outside the shared source where practical; never commit private credentials.
4. **Fail closed:** the local-pilot build must not silently fall back to the hosted production backend when the local endpoint is unavailable or misconfigured. Show a clear connection error and environment label. A move to hosted fallback must be an explicit, controlled operator action.
5. Keep all privileged functions server-side. Deploy and test required Edge Functions on the local stack, including `parent-portal-api`; review cron/scheduled jobs and any managed-platform dependencies separately.
6. Replace hard-coded external workspace links with same-origin routes for the local environment. Verify every route in `vercel.json` has a matching local static-host route.
7. Pin and serve the browser client library locally. Confirm local Auth, REST, Realtime and private Storage behavior before testing any school workflow.
8. Keep separate local test users and synthetic records. Do not copy live learner, staff, guardian, attendance or finance data into this pilot.

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
15. Realtime-dependent screens reconnect to the local Realtime service.
16. Missing or invalid local configuration fails visibly and does not contact production.
17. No local navigation link opens a cloud Vercel workspace.
18. The app shell and required libraries load after the pilot device has been disconnected from the internet.
19. At least ten concurrent LAN sessions can use the isolated environment without cross-session data leakage.
20. After a test transaction, a restart and a backup/restore rehearsal preserve the test data and referential integrity.

## Current status

- [x] Seven backend-connected workspace files inspected.
- [x] Parent portal Edge Function dependency recorded.
- [x] Vercel rewrite map and cross-workspace links inspected.
- [x] Service-worker cache boundary recorded.
- [ ] Main management `index.html` and its loaded scripts fully inspected.
- [ ] Complete direct-endpoint and route inventory signed off.
- [ ] Shared runtime configuration implemented and tested.
- [ ] Same-origin local navigation implemented and tested.
- [ ] Local Supabase functions, Auth, Realtime and Storage tested.
- [ ] Physical Windows host inspected and local stack installed.
- [ ] No-internet LAN, multi-device, backup and restore acceptance gates passed.

No production cutover is authorised by this audit.
