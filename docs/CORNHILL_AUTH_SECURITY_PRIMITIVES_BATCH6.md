# CORNHILL Authentication Security Primitives — Batch 6

Date: 2026-11-13
Branch: feat/local-first-self-hosted-migration-20261113

## Implemented

Added `src/security/auth-primitives.mjs` and ten automated tests covering:
- Cryptographically random opaque session tokens (minimum 256 bits).
- SHA-256 session-token storage hashes and constant-time fixed-length hash comparison.
- Keyed HMAC fingerprints for login identifiers and source identifiers.
- Secure `__Host-` session-cookie formatting (Secure, HttpOnly, Path=/, SameSite=Strict).
- Session-cookie parsing and logout-cookie clearing.
- Explicit finite staff-role permission lists.
- Exact guardian-to-learner approved-link checks.
- Recursive redaction of sensitive fields before audit logging.

The director permission list was deliberately changed from a wildcard to an explicit finite list. Unknown permissions are denied. This avoids silently granting newly introduced permissions to an administrator role.

## Test results

Runtime: Node.js v22.16.0.

The ten authentication-primitives tests were run with Node's built-in test runner:

**10 passed, 0 failed, 0 skipped.**

## Security boundary

These are tested building blocks, not a complete login system:
- No login or logout HTTP endpoint is enabled.
- No password or PIN verification endpoint exists.
- Argon2id hashing/verification is not wired into the API.
- No database session repository or session revocation lookup exists yet.
- The role matrix is an initial draft and must be reviewed against actual staff responsibilities and separation-of-duties rules.
- Class-level and learner-level staff scope must be enforced in the database-backed API, not by this role list alone.
- Guardian access checks must use trusted server-side database results, never a learner ID or role supplied by the browser.

The current local server remains health-only and loopback-bound. No school records or live hosted services were changed.
