# Hosted frontend dependency migration boundary

Updated: 16 November 2026  
Working branch: `feat/cornhill-integration-batch-20261115`

## Why the original application is not yet served by the local launcher

The repository-root `index.html` is a legacy hosted application entry point, not a static page that can safely be copied into the local HTTPS server. Source inspection found:

- Approximately 1.16 million characters in the single HTML entry point, including large inline application code.
- Runtime script dependencies loaded from jsDelivr and cdnjs (Supabase JS, QR-code and spreadsheet libraries).
- A hard-coded hosted Supabase project origin.
- Literal source references counted in that file: approximately 260 `.from(` calls, 51 `.rpc(` calls, 64 `auth.` references, 17 `storage.` references and 4 `functions.invoke` references.
- A separate external password-check service reference.

These are source-text occurrence counts, not proof that every reference is an active call. The file also contains ordinary vendor/reference links; those must not be confused with runtime service dependencies.

## Safe migration rule

Do not add the legacy root page to the local server's public asset map or claim it is locally integrated until its runtime dependencies have been replaced and tested. In particular:

1. Replace hosted authentication with the local session endpoints.
2. Replace each database read/write and RPC with a permission-checked local API backed by the local PostgreSQL repositories.
3. Replace hosted storage and edge-function workflows with explicit local services, or document a deliberate, secure alternative.
4. Vendor or locally serve required static libraries; do not rely on public CDN availability for the offline shell.
5. Verify account isolation, permissions, transactions, audit history and offline behavior before cutover.

## Regression guard

`test/local-workspace-hosted-dependency-guard.test.mjs` scans the locally served HTML, JavaScript and CSS assets. It rejects hosted Supabase URLs/SDK use and remote runtime script, module, fetch and CSS-import dependencies. This protects the local-first workspaces from silently reintroducing hosted runtime dependencies while the legacy application is migrated in stages.

The guard does not claim the legacy root application is migrated. The full-school readiness gate must remain blocked until the complete application is integrated and accepted.
