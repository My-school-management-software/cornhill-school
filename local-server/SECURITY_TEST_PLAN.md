# CORNHILL Authentication and Authorisation Test Plan

Status: security primitives only. No login endpoint or database-backed session resolver is enabled yet.

## Automated tests added

The current Node test suite covers:
- Cryptographically random opaque session tokens.
- SHA-256 token hashing and fixed-length constant-time hash comparison.
- Keyed HMAC fingerprints and rejection of weak HMAC keys.
- Secure host-only session cookie attributes.
- Cookie parsing and logout-cookie clearing.
- Explicit staff role permissions and default-deny behavior.
- Exact guardian-to-learner approval checks.
- Recursive redaction of sensitive audit metadata.

## Required integration tests before enabling login

1. Unknown username returns a generic authentication failure.
2. Wrong password does not disclose whether an account exists.
3. Disabled/suspended staff accounts cannot create sessions.
4. Password verification uses Argon2id with a reviewed work factor.
5. Repeated failures trigger server-side rate limiting and a temporary cooldown.
6. Session token is returned only as Secure, HttpOnly, host-only cookie.
7. Database stores only a hash of the session token.
8. Expired sessions are rejected.
9. Revoked sessions are rejected on the next request.
10. Logout revokes the server-side session and clears the cookie.
11. Cross-site state-changing requests fail CSRF validation.
12. Origin/Host validation rejects untrusted origins.
13. Teacher cannot read or edit a learner outside their assigned class.
14. Teacher cannot approve bursary, finance, payroll or staff-account actions.
15. Bursar cannot change marks or teacher access.
16. Guardian cannot read a learner without an approved guardian mapping.
17. Guardian cannot read another learner by changing a URL identifier.
18. Guardian cannot reach staff, finance, class lists or administration routes.
19. Parent and staff sessions cannot be substituted for each other.
20. Audit records do not contain passwords, PINs, OTPs, cookies or bearer tokens.

## Important permission-design gate

The role matrix in the current primitive module is a conservative initial draft only. Before it is wired into routes, the school must review exact responsibilities, delegated approvals, class assignments and segregation of duties. The production API must combine role permission with resource scope and account status. A role name alone must never grant access to every learner or class.

The local API must not accept role codes or guardian learner IDs as authority from the browser. It must resolve them from trusted database records on every request.
