# CORNHILL Application-to-Backend Dependency Map — Batch 3

Date: 2026-11-13
Branch: feat/local-first-self-hosted-migration-20261113
Scope: source inspection of the main application entry points, hosting configuration, Windows launcher, Tauri shell, offline client and selected database security metadata. This was read-only against production. No learner or staff records were exported.

## 1. Current architecture confirmed

The repository is primarily a static HTML/JavaScript application, not a conventional client/server project:

- Main administrator/staff workspace: index.html (approximately 1.16 MB).
- Additional entry points include school-services.html, parents.html, admissions.html, banking.html, notifications.html, records.html, evidence.html, guardian-accounts.html and bursar-account.html.
- The main page initialises a Supabase JS client using a hard-coded project URL and browser publishable/anonymous key. The key is public-client configuration, not a service-role secret.
- The main page alone contains approximately 260 Supabase table-query call sites, 43 Auth API call sites, 13 Storage call sites, four Edge Function functions.invoke call sites and two direct Edge Function HTTP calls. These are source call-site counts, not counts of unique database operations.
- Several other entry pages initialise their own Supabase clients. Parent portal pages call the parent-portal Edge Function directly.
- The application currently has no root-level Node backend or local API service. There is no root package manifest for a server runtime.

The app currently communicates directly from the browser to Supabase Data API/Auth/Storage/RPC and Supabase Edge Functions. Replacing only the public website host will therefore not make the application independent.

## 2. Page-level dependency sample

| Application page | Supabase client / API dependencies observed |
|---|---|
| index.html | Main client; hundreds of table queries; Auth; private Storage; staff invite/class teacher/access-code and Google backup Edge Functions; parent staff inbox API |
| school-services.html | Own Supabase client; multiple table queries; Edge Function access; Vercel-linked workspace origins |
| parents.html | Direct parent-portal Edge Function calls; Supabase project URL; Vercel links to public website and admissions |
| admissions.html | Own Supabase client; parent-account Auth and enquiry records |
| banking.html | Own Supabase client; Auth and bank workflow tables; links to evidence and main staff app |
| notifications.html | Own Supabase client; Auth and notification records; many hard-coded Vercel app origins |
| records.html | Own Supabase client; Auth, records queries and private Storage |
| evidence.html | Own Supabase client; Auth, evidence tables and private Storage; Realtime channel |
| guardian-accounts.html | Own Supabase client; administrator-only guardian contact and PIN management |
| bursar-account.html | Supabase password-reset/session flow; links to the hosted staff sign-in and Supabase function endpoint |

This is a targeted review of the main entry points, not yet a complete call-site inventory of every script and module. The local API migration must continue with a full route/action inventory before replacing any browser calls.

## 3. Hosting and desktop shell findings

### Vercel

The current vercel.json has four static build rules (HTML, root JavaScript, web manifests and assets/**) and 61 path rewrites. The rewrites provide friendly app URLs for the separate school workspaces. No Vercel server API build is defined in this configuration; backend operations are currently served by Supabase Edge Functions.

The static host can be replaced by a local web server, but the friendly routes, manifests, assets, MIME types, security headers and service-worker scope must be preserved.

### Windows launcher

windows/Launch-CORNHILL-Kiosk.cmd launches Edge or Chrome in kiosk mode using the current Vercel production URL. It is not a local launcher yet.

### Tauri shell

native/cornhill-shell/src-tauri/tauri.conf.json sets frontendDist to a Vercel-hosted URL. Its Rust shell has no Tauri commands or plugins and deliberately remains a remote authenticated web app. It is not currently a self-contained offline Windows application.

### Implication

The current installed Windows PWA works as a browser-installed shortcut to the hosted web application. It does not mean the database/API run on the school PC. The Windows launcher and Tauri shell must be repointed only after the local host and API have passed acceptance tests.

## 4. Offline boundary confirmed

The service worker caches the application shell, static files, manifests and selected public CDN libraries. It deliberately keeps Supabase, authentication, API calls, learner records, guardian data and financial data network-only.

The shared offline helper uses IndexedDB for encrypted eligible drafts and a queued-action mechanism. The offline roadmap confirms that public admission enquiries have an explicit encrypted outbox handler. The main transactional work (fees, receipts, banking, expense approval, payroll, bursaries, marks, report cards, official learner identity changes, guardian PINs and evidence approvals) must not be treated as offline-postable until each has a specifically designed idempotent sync handler.

Sync is foreground-driven; the app must be open and connected or the user must return and request sync. This is not full offline database replication.

## 5. External dependencies to replace or make optional

- Supabase JS CDN: browser database/auth/storage client, currently loaded as a floating major version (@2). In the local edition, browser code should call the local API; it must not hold database administrator credentials.
- Supabase Auth/Data API/Storage/Edge Functions: the main hosted backend dependency set.
- CDN libraries: QR code, spreadsheet import/export, Cropper, jsPDF and PDF.js. Pin and bundle versions locally so essential school documents remain usable without internet.
- Tailwind CDN is used by the admissions page and should be replaced with compiled/local CSS.
- Pwned Passwords range API is called by the main sign-in flow as a password breach check. This should become a non-blocking optional online check; it must not prevent local sign-in when internet is unavailable.
- Google OAuth/Drive and Cloudflare R2 are external integrations. They should remain optional and must not be prerequisites for local backups or private local files.
- Several pages contain fixed Vercel workspace origins. Replace them with one trusted-origin/base-URL configuration generated for the local school host.

No secret values were read or written into this report.

## 6. Database security metadata: additional verification

A read-only metadata query returned:

- 123 public tables; 97 have at least one policy and 26 have no policy.
- 253 public-table RLS policies in total.
- All 123 public tables have RLS enabled.
- 181 public routines, including 147 SECURITY DEFINER routines.
- All 147 SECURITY DEFINER routines have a per-function search_path configuration (the current inventory shows search_path="" for the routines reviewed, with one explicit schema-qualified exception).
- No SECURITY DEFINER routine in the current inventory is executable by anon; 81 are executable by authenticated, subject to their function-level checks.
- All six public views inspected have security_invoker=true.

This is a useful positive security signal, not a full proof of correctness. The 81 authenticated-callable SECURITY DEFINER routines still need review of their internal role checks, input validation, ownership boundaries and side effects before they are ported.

The 26 policy-less tables have grants to postgres and service_role, not to normal browser roles. Preserve that server-only model in the local API; do not expose unrestricted table CRUD.

## 7. Proposed local replacement boundary

The local edition should have these layers:

1. Local web host: serves the existing pages, assets, manifests and friendly workspace routes on the school LAN.
2. Local API: one versioned API (for example /api/v1) with explicit route-level permissions. No generic "table name + CRUD" endpoint.
3. Local PostgreSQL: school-owned database with transactional finance, admissions, academic, staff, attendance and audit rules.
4. Local identity/session service: staff roles and account status derived server-side; secure password hashes; revocable sessions. Parent/guardian authentication remains a separate principal and isolated API surface.
5. Private file service: controlled local storage for learner photographs, bursary evidence, staff media, parent voice notes and school evidence. Files must not be served from a public static directory.
6. Offline outbox: every queued mutation gets a stable operation ID, user/device scope, validation, duplicate prevention and conflict handling. Financial postings need especially strict server-side idempotency and audit trails.
7. Backup/restore: scheduled encrypted database and private-file backups, plus repeatable restore tests.

### LAN security requirement

A LAN-hosted PWA accessed from other computers and Android devices needs a trusted secure origin for service-worker and browser security features. Plain HTTP to a LAN IP is not a suitable final deployment. The deployment plan must include school-controlled HTTPS and a certificate trust procedure for the authorised devices, or a separately packaged native client where appropriate.

## 8. API migration order

The safest build order is:

1. Health/config endpoint and local static hosting, using synthetic data only.
2. Authentication, role resolution, session expiry/revocation and audit events.
3. Learner identity and admissions.
4. Academics, assessments, report publication and teacher scope.
5. Finance ledger, bursaries, receipts, reversals and bank workflows.
6. Staff directory, attendance review and payroll.
7. Isolated parent/guardian portal.
8. Private files, evidence, notifications and optional external integrations.
9. Offline outbox/sync for individually approved workflows.
10. Backup, restore rehearsal, LAN pilot and controlled cutover.

For data migration, preserve existing UUID identities where foreign keys depend on them; map Supabase Auth users to local identity rows; verify row counts, FK integrity, storage-object checksums and financial ledger totals in a synthetic/staging rehearsal before any real-data import.

## 9. Status after this batch

Completed:
- Main application hosting model identified.
- Core browser-to-Supabase dependencies confirmed.
- Vercel static route and rewrite model mapped.
- Windows launcher and Tauri remote dependency identified.
- Offline boundaries confirmed.
- Additional RLS, SECURITY DEFINER and view security metadata checked.
- Local API replacement boundary and migration order documented.

Not completed:
- No local API server has been implemented yet.
- No local PostgreSQL schema has been deployed.
- No real learner/staff data has been copied.
- No service has been disconnected or switched off.
- No production deployment or cutover has occurred.

Next engineering step: create an isolated local-server skeleton with a health-only endpoint and local static hosting, then verify it with synthetic fixtures before adding authentication or school data routes.
