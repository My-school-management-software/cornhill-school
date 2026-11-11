# CORNHILL secure offline account sign-in — implementation contract

## Current delivery in this change

- Adds `assets/cornhill-offline-auth.js`, a browser-profile-bound offline credential verifier.
- Adds the module to the service-worker shell and injects it into cached HTML workspaces.
- Adds Node regression tests for signed grants, password verification, expiry, and role constraints.
- Adds a GitHub Actions workflow to run offline authentication and encrypted-draft tests.

## Security model

Offline sign-in is available only after an account has authenticated online and the school server has issued a signed, device-bound grant. The grant is bound to a browser profile's non-exportable ECDSA P-256 private key and public-key fingerprint. The server signs the grant with Ed25519; the browser contains only the public verification key.

The grant must include:
- Version, unique account ID, role, and optional display name.
- Device ID and public-key fingerprint from the online device-enrolment step.
- Issue and expiry timestamps. Maximum validity is 12 hours.
- A random password salt, PBKDF2-SHA-256 verifier, and iteration count (minimum 310,000).
- A server-approved allowlist of offline permissions. No broad wildcard permission is accepted.

The browser stores only the signed grant and a non-exportable device key. It does not store the user's plaintext password or an authentication session token. A successful offline login returns a minimal offline identity and the permission allowlist; it does not establish a Supabase session.

## Mandatory server work before enabling the sign-in button

1. Add an authenticated device-enrolment endpoint that registers the device public key against the signed-in account and records approval, device status, and last authorisation time.
2. Add server-side grant issuance. The signing private key must remain in server secrets and must never be shipped to the browser or committed to Git.
3. Derive the PBKDF2 verifier on a trusted server using the account's verified password at an appropriate re-authentication step. Never send a plaintext password to a logging or analytics service.
4. Store device grants and revocations server-side. On reconnection, check account suspension, role changes, device revocation, and grant age before refreshing the grant.
5. Configure the Ed25519 public verification key in the client using a pinned, versioned public configuration. Do not invent a production key or use a test key.
6. Integrate the module with the existing sign-in flow without creating duplicate Director or teacher accounts. Preserve the two visible groups: Teaching Staff and School Administrators. The Director's existing full-access account remains its own existing account.
7. After offline login, enforce read-only access by default. Any queued write must be separately permissioned, encrypted, attributable to the account, conflict-checked, and audited on reconnection. Finance approvals, payment reversals, role changes, account administration, and publication actions must remain online-only.
8. On reconnection, validate current server permissions before allowing protected routes or syncing queued work. A suspended/revoked account must be blocked from further protected actions and its offline grant cleared.

## Limits and honest claims

The current module is a security foundation, not a completed user-facing login feature. It is loaded by the service worker but is not yet connected to the sign-in screen or backed by the server grant-issuance endpoint. Do not display “offline sign-in enabled” until those integration steps and live negative-permission tests pass.

Browser storage and a non-exportable WebCrypto key bind the grant to the browser profile in normal use; they are not hardware attestation and cannot guarantee resistance to a fully compromised device or copied browser profile. The 12-hour expiry also depends on the device clock while offline. A clock rollback is detected against the last successful local sign-in, but only a server check can definitively establish current account status.

## Required release tests

- Existing Director account still has full access online; no duplicate Director identity is created.
- Existing teacher accounts remain individual accounts and appear under Teaching Staff.
- Approved administrator/staff accounts appear under School Administrators.
- No account can install another device's signed grant.
- Invalid signature, tampered payload, expired grant, unsupported role, and weak PBKDF2 parameters are rejected.
- Correct password succeeds; incorrect password fails without revealing which part of the credential was wrong.
- No offline session token is written to storage.
- Offline access defaults to read-only and cannot open finance approval, account administration, or other prohibited routes.
- Suspension, role reduction, and device revocation are enforced on reconnection before sync or protected navigation.
- Shared-computer sign-out clears rendered user data and late responses from the prior session.
