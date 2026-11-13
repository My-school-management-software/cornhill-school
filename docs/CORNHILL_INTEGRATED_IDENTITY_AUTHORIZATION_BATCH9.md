# CORNHILL Integrated Local Identity and Authorization Batch

Branch: `feat/local-first-self-hosted-migration-20261113`

## What was combined

This development cycle combines work that had been listed as separate stages: local identity foundations, staff/guardian separation, permission design, teacher class scoping, and session token security.

### Implemented in source

- Additive PostgreSQL migration `002_local_authorization_foundation.sql`.
- Explicit permission catalog for learner, academic, finance, staff, guardian and system actions.
- Empty-by-default role-to-permission grants. No staff role is implicitly granted permissions.
- Staff-to-class assignment records, kept separate from role grants.
- Deny-by-default authorization helpers for active staff sessions, explicit permissions and assigned-class scope.
- Guardian learner access checks that re-check an approved guardian-to-learner mapping for each learner-specific request.
- Strict separation between staff and guardian principal/session identities.
- 256-bit opaque session and CSRF token generation; only SHA-256 hashes are intended for database storage.
- Unit tests for authorization, cross-learner denial, staff/guardian separation, expiry, revocation, token handling and malformed inputs.

## Important security decisions

- The permission catalog is descriptive only. The migration creates no role permission grants.
- A role name alone never grants access to a workflow.
- Class access requires a specific active class assignment; the helper does not implement a school-wide override.
- Guardian access requires an active guardian session plus an approved mapping returned by the server-side access repository. A learner code is not an access credential.
- These helpers are server-side building blocks. They must not be copied into browser code as a substitute for API enforcement.
- No database runtime user or broad grants are created yet. The permission matrix and required query operations must be reviewed before privilege grants are designed.
- No password hashing implementation is claimed in this batch. Production login must use a vetted Argon2id implementation and must be integration-tested before accounts are enabled.

## Verification status

The automated unit tests cover deterministic logic and source-level security rules. They do not prove that PostgreSQL executed migration 002, that a real database repository enforces the checks, or that HTTP cookies/CSRF protections are integrated.

The migration remains for a new isolated local database only. It has not been run against Supabase or any production database. The active school PWA remains unchanged.

## Still gated

Before real accounts or school records are enabled:
1. Run migrations 001 and 002 on disposable PostgreSQL 17 and verify all tables, constraints and the empty permission-grant state.
2. Implement and test a real Argon2id password/PIN adapter, server-side login throttling, cookie handling and CSRF validation.
3. Implement repository methods that check approved guardian links and staff class assignments directly in PostgreSQL.
4. Agree a least-privilege permission matrix and runtime DB grants.
5. Add full HTTP/API integration tests before LAN exposure.

The live application continues to rely on its existing hosted services. This batch does not disconnect Vercel or Supabase.