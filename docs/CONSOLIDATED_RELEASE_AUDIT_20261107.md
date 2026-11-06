# CORNHILL consolidated release audit — 2026-11-07

Branch: `feature/cornhill-v3-foundation`  
Supabase project: `yemhortbudwbcrzsoozk`

## Result for this audit cycle

- **47/47 source-structure checks passed** across the main application and the Google Drive backup Edge Function.
- **17/17 live database function/policy assertions passed.**
- **63/63 public database tables have RLS enabled; 0 public tables are missing RLS.**
- **107 public RLS policies** were present at the time of the audit.
- **0 public SECURITY DEFINER functions lacked an explicit search_path.**
- **0 public views lacked security_invoker=true.**
- **0 anonymous table-wide grants remain** after the correction below.
- The public class sign-in directory retains exactly five anonymous display-column SELECT grants.
- No learner, guardian, payment, allocation, assessment, mark, or attendance records were inserted, edited, or deleted during this audit.

These are source and database metadata checks. They are not a substitute for real browser sessions with separate administrator, teacher and guardian accounts.

## Source checks — 42/42 passed

### Main application and parent portal — 23/23

Checked that the branch source contains:
- Separate parent portal page and route reference.
- Guardian phone OTP request, SMS OTP verification and authenticated session requirement.
- Pupil-code lookup through the dedicated parent RPC.
- Parent sign-out and HTML escaping of returned learner data.
- Publishable Supabase key only; no service-role key literal in the parent page.
- Administrator and staff password recovery request flows, password update handler and matching-password fields.
- Teacher mark-entry and administrator read-only marks-register UI.
- Bulk report-card PDF generation.
- Offline app-shell service-worker registration.
- Appearance settings, staff media recording, call peer-connection logic, attendance import and academic calendar references.

### Google Drive backup Edge Function — 19/19

Inspected active function version 26. Although platform JWT verification is disabled for this function, protected operations perform their own checks:
- Privileged POST actions require a valid bearer token and active administrator profile.
- Scheduled backups require the separate scheduler-token RPC and respect the enabled setting.
- OAuth state is random, hashed and expires; the callback validates the state and rechecks the initiating administrator.
- OAuth is restricted to the dedicated CORNHILL Google account.
- Backup encryption uses AES-256-GCM with a 32-byte key.
- The encrypted payload is decrypted and checked before upload.
- Private staff communication contents are excluded.
- Backup validation is administrator-only, verifies dataset names and counts, and records both successful and failed validation attempts.
- The validation function explicitly does not perform a restore.

## Live database assertions — 17/17 passed

## SECURITY DEFINER body review — 20/20 passed

Reviewed every one of the 20 authenticated-executable SECURITY DEFINER functions reported by the security advisor. All 20 contained the expected caller guard for their intended purpose: administrator-only functions check the active administrator helper; teacher functions check teacher identity and class assignment; the parent function checks a confirmed phone linked to an active guardian contact; staff directory access requires an active signed-in staff profile; and the authorization helper functions bind decisions to the current authenticated user. The advisor still flags these functions because they are executable by authenticated users; the body-level review is why no blanket EXECUTE revoke was applied.

Verified:
1. Parent lookup requires an authenticated user.
2. Parent lookup requires a confirmed phone number.
3. Parent lookup matches the confirmed phone to an active guardian contact.
4. Parent lookup requires the permanent pupil code.
5. Parent assessment results require an approved report publication.
6. Parent payment history includes Posted payments only.
7. Parent conduct reports require guardian visibility and a publication timestamp.
8. Parent lookup RPC is not executable by anon.
9. Payment-posting RPC checks school-administrator status.
10. Payment amount must be positive.
11. Duplicate fee-charge IDs in an allocation are rejected.
12. Payment posting requires an active enrolment.
13. Report publication is administrator-controlled and records the approving user.
14. Teacher score insertion is scoped to the assigned teacher/class/subject.
15. Teacher score updates are scoped to the assigned teacher/class/subject.
16. All 63 public tables have RLS enabled.
17. All public SECURITY DEFINER functions have an explicit search_path.

## Corrections made during this audit

### 1. Anonymous privileges on learner-balance views

Found that anonymous clients had broad privileges on:
- `learner_account_balances`
- `learner_enrolment_period_balances`

Both are security-invoker views, so their underlying table permissions still constrained reads. Nevertheless, the anonymous view grants were unnecessary. Revoked all privileges from `anon` on both views and verified:
- Anonymous SELECT = false on both.
- Anonymous INSERT = false on both.
- Authenticated SELECT remains available.

Live migration applied:
`revoke_anon_access_to_learner_balance_views`

Migration source:
`supabase/migrations/20261107212500_revoke_anon_access_to_learner_balance_views.sql`

### 2. Vercel static-page routing

Found that the previous `vercel.json` built only `index.html` and rewrote every route to `/index.html`. This meant a request for `/parents.html` returned the main application page rather than the separate guardian portal.

Updated `vercel.json` to build all root HTML pages, JavaScript files, the web manifest and assets as static files, and removed the catch-all rewrite. The updated JSON was parsed and all five routing/configuration assertions passed (the four file-pattern allowlists and absence of a catch-all rewrite).

**Deployment verification is still pending.** The latest Vercel preview visible during this audit was still built from commit `8e8e06f8dace4e52dd9e39059d09e665bb5a5e8f`, before the routing correction. I attempted a new preview deployment on the existing free Hobby team, but Vercel rejected the deployment API request with HTTP 402 because the free API deployment limit (100 per day) has been reached; it reports a 24-hour retry window. No paid upgrade or charge was accepted. The new configuration must be built when the free quota resets, and the deployed `/parents.html` and `/manifest.webmanifest` routes must be checked before calling this correction live.

## Outstanding release blockers and external checks

These are not being counted as passed:

1. Supabase Pro-only leaked-password protection remains intentionally disabled and is not a release requirement. CORNHILL's free app-level breach screening is an additional check in its password-change and recovery screens, not server-side global enforcement; keep the agreed native Supabase minimum-length and character-class policy as the server-side baseline. Direct Auth API calls can bypass the app-level breach lookup.
2. Supabase security advisor still reports 20 authenticated-executable SECURITY DEFINER functions. They must be reviewed individually; do not blanket-revoke functions used by legitimate guarded workflows.
3. Supabase security advisor still reports the `pg_net` extension in the public schema and six RLS-enabled service-only tables without client policies. These need a documented configuration review.
4. The database snapshot has two learners, two guardian contacts, zero assessment rows, zero saved assessment scores, two payment rows, zero payment allocations and zero backup-validation rows. This is insufficient for full multi-learner marks, payment-allocation and report-card workflow tests.
5. No real administrator/teacher/guardian test accounts were impersonated. OTP delivery, password-reset email delivery and cross-account isolation need live account testing.
6. The Google Drive backup validator has not yet been run against a real stored backup; the validation history currently has zero rows. A backup restore drill is also outstanding.
7. Staff communications, media upload/playback, voice/video calling, attendance import and reconnect/conflict handling require two or more real authorised accounts/devices.
8. Windows 10/11 and Android browser/device compatibility, actual thermal printer output and the school's fingerprint terminal remain external hardware tests.
9. The routing correction has not yet appeared in a new Vercel preview build. The currently visible preview is older than the correction.
10. School administrator release sign-off is still required before production learner records or real payments are used.

Supabase health advisor: zero lints at the time of this audit.

## Release decision

**Not yet approved for school-wide production use.**

The source and database checks in this audit passed, and two issues were corrected. It would be misleading to say every acceptance test is complete or that nothing remains: the outstanding items above require account/provider configuration, populated test fixtures, a new deployment, real browser sessions, devices or school sign-off.


## Free password-protection alternative — additional checks

The Pro-only Supabase leaked-password toggle remains **disabled by design**, as requested. No plan upgrade or paid service was enabled.

### What was added

The application now checks new passwords in both supported UI flows:
- Administrator/staff password-recovery flow.
- Signed-in user's own password-change flow.

The application enforces the agreed minimum of 8 characters plus uppercase, lowercase, a digit and a symbol. Before sending a new password to Supabase Auth, it checks the free Have I Been Pwned Pwned Passwords range service using k-anonymity:
- SHA-1 is computed locally in the browser solely to create the lookup.
- Only the first 5 hexadecimal characters of the hash are sent to the external service.
- The remaining 35 characters are compared locally; the password and full hash are not sent.
- Response padding is requested, cookies/credentials are omitted, referrer transmission is disabled, and the lookup has a 9-second timeout.
- A password found in the breach corpus is rejected.
- If the breach-check service cannot be reached, the password change is paused rather than silently skipping the check.
- Zero-count padding rows are correctly ignored.

This uses the free Pwned Passwords endpoint; it does not require a HIBP subscription or API key.

### Additional source checks — 16/16 passed

Verified the hash-prefix lookup, local suffix comparison, padding handling, zero-count filtering, request privacy settings, timeout, 8-character mixed-character policy, both password-change call paths, password-recovery request wiring, recovery-event handling, sign-out after successful reset, and absence of a full password in the HIBP request URL.

### Important security boundary

This is a strong additional check on CORNHILL's password-change and recovery screens, but it is **not identical to Supabase's server-side leaked-password protection**. A user who deliberately bypasses the CORNHILL screens and calls Supabase Auth directly could bypass the app-level HIBP check. The free Supabase Auth minimum-length and required-character policy remains the server-side baseline and should stay enabled. The Supabase Pro-only leaked-password toggle remains off.

The application code is committed to the feature branch, but a fresh Vercel deployment and real account tests are still required before this change can be verified in the live application.
