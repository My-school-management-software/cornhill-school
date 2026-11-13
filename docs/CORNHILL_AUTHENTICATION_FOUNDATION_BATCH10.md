# CORNHILL Integrated Authentication Foundation

Branch: `feat/local-first-self-hosted-migration-20261113`

## Added in this development cycle

- Staff sign-in by normalised username and guardian sign-in by E.164 phone number.
- Generic authentication failure messages, dummy-hash verification for unknown accounts and keyed HMAC identifier/source fingerprints.
- Argon2id adapter pinned to `@node-rs/argon2@2.2.2`, with a policy of 19,456 KiB memory, two passes, one lane and a 32-byte output.
- An atomic login-attempt store implemented with PostgreSQL transactions and advisory locks across account and source fingerprints.
- PostgreSQL account, session, audit and login-attempt repositories.
- Session creation, account last-login update and successful-authentication audit insertion in one transaction.
- Session authentication, account-status and expiry checks, CSRF checks for unsafe methods, and session revocation on logout.
- Secure host-only session cookie builders with Secure, HttpOnly, Path=/ and SameSite=Strict.
- Migration 003 adds indexes supporting identifier/source failed-attempt checks.
- Disposable PostgreSQL integration verifier exercises staff/guardian lookups, concurrent rate limiting, session creation/revocation and audit writing.
- CI includes a PostgreSQL integration job on Ubuntu and an additional Windows unit-test job.

## Security boundaries

- These are backend service modules and repository contracts, not browser-side authentication.
- The production authentication service is not yet wired into the local HTTP server.
- The Argon2id package is pinned exactly in package.json. A generated npm lockfile still needs to be added after a real dependency install on a network-enabled build runner.
- The rate-limit repository uses PostgreSQL advisory transaction locks and records attempts as failures until successful verification completes.
- The successful session repository creates the session, updates last-login metadata and writes the success audit event in one database transaction.
- No production staff/guardian accounts or school records have been imported.
- Do not expose a LAN port until the HTTPS endpoint, administrator bootstrap, role permission matrix and full integration tests are accepted.
- The existing school application still uses its hosted services. This work does not disconnect Vercel or Supabase.

## Password-hashing rationale

The selected package has an MIT licence, a Rust-based Node binding, no node-gyp/postinstall requirement and cross-platform support. OWASP's current Password Storage Cheat Sheet recommends Argon2id with at least 19 MiB memory, two iterations and parallelism one. The local policy uses that baseline and must still be benchmarked on the actual Windows school PC before production rollout.

## Verification plan

The committed tests cover the service contracts, cookie rules and the real Argon2id adapter. The GitHub Actions workflow is configured to run unit tests on Ubuntu and Windows, and PostgreSQL integration tests on Ubuntu. These checks must pass before real accounts are enabled. The local development environment has not yet connected a disposable PostgreSQL server, so repository integration remains pending until CI confirms it.