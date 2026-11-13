# CORNHILL Integrated Authentication Foundation

Branch: `feat/local-first-self-hosted-migration-20261113`

## Added in this development cycle

- Staff sign-in by normalised username.
- Guardian sign-in by E.164 phone number.
- Generic authentication failure messages that do not disclose whether an account exists.
- Password verification through an injected Argon2id adapter contract; the service rejects malformed/non-Argon2id encoded hashes and uses a dummy Argon2id hash for unknown users.
- A keyed HMAC fingerprint contract for account identifiers and source addresses; raw usernames, phone numbers and source addresses are not written to the login-attempt store.
- An atomic login-attempt store contract for server-side rate limiting. The production PostgreSQL implementation must serialise updates per identifier/source pair and record failed attempts as failed by default.
- Separate configurable staff and guardian session lifetimes.
- Opaque session and CSRF tokens; only token hashes are passed to session persistence.
- Session authentication, account-status and expiry checks, CSRF checks for unsafe methods, and session revocation on logout.
- Secure host-only session cookie builders with Secure, HttpOnly, Path=/ and SameSite=Strict.
- Unit tests covering success/failure, unknown accounts, status changes, throttling, token hashing, staff/guardian separation, cookie parsing, CSRF and logout.

## Security boundaries

- These are backend service modules and dependency contracts, not browser-side authentication.
- No Argon2id implementation or production password/PIN creation route is included yet. The next step must select and pin a maintained Argon2id package, create hashes using that adapter, and test it on the actual supported Windows/Linux deployment targets.
- No production PostgreSQL repository adapter is included yet. The attempt-store method `beginAttempt` must be implemented as an atomic, concurrency-safe database operation before this can protect real accounts.
- The successful session repository method `createAuthenticatedSession` must atomically insert the session, update last-login metadata and write the success audit record in one database transaction.
- The HTTP server has not been wired to these modules. Do not enable sign-in, expose a port to the LAN, or import real staff/guardian accounts yet.
- HTTPS is mandatory before any non-loopback LAN or Android access. The Secure cookie is intentionally not downgraded for plain HTTP.
- The current app still uses its hosted services. This work does not disconnect Vercel or Supabase.

## Verification

Targeted Node.js tests are included for the auth service and cookie module. Their results must be reported only after the exact committed sources have been run. PostgreSQL integration and full HTTP/browser tests remain outstanding.