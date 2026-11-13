# CORNHILL HTTPS Authentication Route and Runtime Foundation

Branch: `feat/local-first-self-hosted-migration-20261113`

## Added

- HTTPS-only authentication HTTP handler for staff login, guardian login, current-session inspection and logout.
- Same-origin Origin and Host checks for state-changing routes.
- Strict JSON parsing with a 16 KiB request-body limit.
- Secure, host-only session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`).
- Separate readable CSRF cookie for same-origin frontend code to copy into the `X-Cornhill-CSRF` header. The server validates that token against its stored hash; logout requires it too.
- Security headers, cache-control no-store, HSTS on the HTTPS handler, and generic error responses.
- Authentication runtime factory that reads only `CORNHILL_DB_RUNTIME_USER` / `CORNHILL_DB_RUNTIME_PASSWORD`, verifies `current_user = cornhill_auth_api` and `current_database = cornhill_local`, creates a dummy Argon2id hash at startup and assembles repositories/service/route handler.
- Runtime configuration rejects non-loopback DB hosts, unexpected database names, admin DB users, weak passwords and missing HMAC secrets.

## Not enabled

- The route handler is not wired into the current health-only HTTP scaffold.
- There is no local HTTPS listener or trusted certificate lifecycle yet.
- Migration 004 creates the least-privilege runtime database roles, but both roles remain NOLOGIN and no password is set.
- No live staff/guardian account creation, school data import or sign-in has been enabled.
- LAN access and Android access remain disabled.

## Verification status

Tests are committed for the handler, cookie behavior, runtime factory, runtime configuration, and database role privilege checks. The CI workflow includes these tests plus PostgreSQL integration verifiers. The GitHub Actions result has not yet been confirmed; the available commit status currently reports only the existing Vercel build-rate-limit failure. PostgreSQL migration execution is also still pending.

No changes have been made to the live CORNHILL PWA or its hosted database.