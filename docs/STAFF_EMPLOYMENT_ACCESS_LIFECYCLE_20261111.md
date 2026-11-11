# CORNHILL staff employment status and account access lifecycle

## Scope
This change adds an administrator-controlled employment-status workflow for linked Teacher and Staff accounts. It supports `Active`, `On Leave` and `Exited`. It does not delete staff identities, employee rows, academic history, attendance, finance, receipts or audit records.

## Security behavior
- Only the active Director/Admin identity may invoke the server-side `staff-employment-status` function.
- The endpoint verifies the caller using Supabase Auth and checks the active Director profile in `user_profiles`.
- The Director cannot target their own account, and a target with role `Admin` is protected.
- On Leave and Exited: the authoritative `user_profiles` status is changed first, causing the existing `is_active_staff_session()` and other profile-backed RLS helpers to deny requests as soon as the database update commits. The Auth account is then banned for a long duration to block future sign-in/refresh.
- Active: the role-specific directory link is verified before the Auth ban is lifted while the stored profile is still non-active; that directory is synchronised before the user profile is set to Active. The application continues rejecting sign-in until that profile update succeeds.
- Teaching accounts (`Teacher`) synchronise only with `academic_teacher_directory` (status only; that table has no end-date column). Non-teaching accounts (`Staff`) synchronise only with `school_staff_directory` (status and end date). The function requires exactly one matching row in the role-appropriate directory.
- Exited requires a valid final working date.
- Reactivation verifies the role-appropriate employee-directory link, lifts the Auth ban while the profile remains non-active, synchronises exactly one matching directory row, and only then sets the profile to Active.
- Important Supabase limitation: an Auth ban or global sign-out does not invalidate an already-issued access-token JWT before its expiry. This workflow therefore relies on database-side active-profile RLS checks for online requests and an online client heartbeat. Do not describe the Auth ban alone as instant JWT revocation.
- The web app now calls `is_active_staff_session()` on startup, every 60 seconds, when the page becomes visible, and after reconnect. A confirmed inactive result clears the local session and cached roster; a failed verification makes the workspace read-only until connectivity and verification return. This improves the app UI but is not a substitute for RLS on every exposed table/RPC.
- Partial failures return an explicit error and never delete an identity or historic record.

## Application behavior
The Staff profiles form detects an employment status/end-date change, asks the administrator to confirm, saves the non-status profile fields, and calls the protected Edge Function. It then reloads the directory. The normal profile status check continues rejecting non-active users.

Offline limitation: a device that is already disconnected cannot receive a remote revocation until it reconnects. The local class-list snapshot is encrypted, read-only and now expires after 12 hours; invalid, future-dated, expired or wrongly scoped snapshots are deleted instead of restored. A remote suspension therefore takes effect on a disconnected device when it reconnects or the local snapshot expires, whichever occurs first. This is a bounded fallback, not instant remote revocation.

## Rollout sequence
1. Review this branch and pass CI/source tests.
2. Deploy the `staff-employment-status` Edge Function with JWT verification enabled.
3. Verify the function against dedicated test accounts for Teacher and Staff roles; do not test by suspending the real Director or live employees.
4. Verify role-specific RLS, online sign-in, and offline cache expiry.
5. Only then merge the PR and release the UI that calls the function.

No production function was deployed and no staff employment status, account ban, or real school record was changed as part of this development cycle.


## Offline snapshot hardening
- The existing offline cache remains restricted to the Admin and assigned Teacher roster view; finance, bursary, guardian contacts and write actions remain unavailable offline.
- Snapshot owner must match the active signed-in identity.
- Saved timestamp must parse successfully, must not be in the future and must be no older than 12 hours.
- Invalid or expired snapshots are deleted and are not restored.
- The message displayed in offline view names its expiry and explains that remote account suspensions are applied after reconnection or expiry.


## Current offline sign-in boundary
This change improves the existing encrypted offline class-list snapshot only. The current sign-in form still authenticates with Supabase `signInWithPassword`, which requires network access. Offline roster viewing is possible only when the browser still has a valid stored Auth session and the profile lookup fails because the service cannot be reached; it is not a new password/PIN sign-in mode. A separate device-bound offline unlock design is still required before the school should describe the product as supporting full offline sign-in. Do not cache a raw password, service key, or reusable Supabase credential in the browser.


## Online session revalidation
The client heartbeat is a secondary guard against stale browser sessions. It checks the database-backed active staff helper, signs the local browser session out after a confirmed inactive result, and clears that user's cached roster. If verification cannot complete, the UI switches to read-only. Supabase JWTs remain stateless until expiry, so direct API calls must continue to be protected by RLS predicates that check current employment status; browser-side polling alone is not a security boundary.


## Stale access-token protection at the database layer
Supabase access tokens are stateless JWTs and remain valid until their expiry even after an Auth ban or session sign-out. To prevent those still-valid tokens from using staff-domain APIs after employment status changes, migration `20261111230000_require_active_staff_session_for_staff_tables.sql` adds one **restrictive** policy to 21 existing RLS-enabled staff-domain and staff-linked workflow tables, including `staff_*`, teacher-class access, class-subject assignments and evidence-capture records. It requires `public.is_active_staff_session()` for every authenticated command while preserving each table's existing permissive role/ownership policies. The policy does not grant new access. The migration deliberately excludes `user_profiles` so the sign-in flow can still read an inactive account's status and display the correct access-blocked message. The migration was rehearsed transactionally against production: all 21 candidate policies were created inside the test transaction and rolled back. It has not been applied permanently to production; review and verify the migration before release.

## Privileged RPC and Storage policy review
- Read-only inspection found 119 SECURITY DEFINER functions in the exposed `public` schema. None of those functions is executable by `anon`; 64 are executable by `authenticated`. This is a positive exposure boundary, but does not by itself prove the authorization logic is correct.
- Reviewed the authenticated-callable privileged-function set for caller identity and role/assignment enforcement. The two assessment wrapper functions delegate to teacher subject-permission functions; those helpers check `auth.uid()`, active employment status and current class/subject assignment. The academic-manager/viewer helper functions delegate to active Director/DOS/Headteacher checks.
- The evidence-device claim/touch functions check signed-in identity, active employment and device ownership. Staff notification restore is restricted to the signed-in user's own notification row. Staff-directory listing checks an active school profile.
- Storage policy review covered learner photos, private evidence, bursary evidence and staff media. Admin-only policies use profile-backed school-admin checks; evidence upload/read policies bind the request/device to the signed-in user and rely on RLS for the evidence request rows; staff-media paths bind sender/participant identity and the directory lookup excludes inactive accounts. Learner-photo teacher access depends on the class/subject access table, which is covered by the restrictive active-session migration.
- Remaining acceptance work: exercise these policies with dedicated test accounts and real Storage API requests. Catalog review is not a substitute for adversarial integration tests.


## Role-specific directory verification finding
A read-only production schema/data check confirmed that current teacher identities are linked through `academic_teacher_directory`, while `school_staff_directory` currently contains non-teaching employee records and no linked accounts. The lifecycle function was therefore corrected: it no longer expects a Teacher to have a `school_staff_directory` row, and it no longer expects a non-teaching Staff account to have an academic teacher row. Reactivation now preflights the correct directory before lifting the Auth ban, and status updates must affect exactly one row in that directory. No production records were linked or modified during this check.


## Fail-closed active-session check
A further review found that the existing `is_active_staff_session()` treated a NULL employment status as Active. The current production profile audit found 11 accounts (1 Admin and 10 Teachers), all with an explicit Active status and no NULL statuses. A follow-up migration now changes the helper to require `employment_status = 'Active'`; missing/NULL status no longer inherits access. The migration is additive and does not change existing profile data. A source assertion was added for this fail-closed behavior. The migration remains on the development branch and has not been applied to production.


## Latest validation update
- The new role-helper migration was replayed inside a transaction against the production schema and rolled back successfully. This verifies SQL compatibility with the current function signatures without retaining any production changes.
- One intermediate CI commit failed because a test assertion built an invalid JavaScript regular expression. The migration itself was not the cause. The assertion was replaced with a direct source-string check in the following commit; the latest head's workflow is queued and must complete before merge.
- Performance advisor scan reports 98 unindexed foreign keys and several multiple-permissive-policy notices. These are broader pre-existing performance findings and require table-by-table review; no blanket indexes or policy changes were applied.


## Additional privileged-RPC audit (2026-11-11)
A second pass across authenticated-callable public SECURITY DEFINER functions found remaining direct employment-status checks that used `coalesce(employment_status, 'Active')`. The affected set included notification read/archive/list/restore RPCs, teacher assignment and roster RPCs, visiting-day lookup, evidence-device heartbeat, guardian PIN status, and three notification trigger functions that select staff recipients.

A new migration, `20261112001000_remove_null_active_fallbacks_from_staff_rpcs.sql`, removes NULL-as-Active fallbacks in those functions and requires linked teacher-directory records to be explicitly Active for subject roster/assignment results. It preserves their existing role, ownership and class-assignment logic. The migration intentionally fails if the audited function signatures or expected guards have drifted.

Validation: all four active-session/role/RLS/direct-RPC migrations were executed together inside a transaction against the production schema, then rolled back. In that rehearsal, all 21 restrictive RLS policies were created, the active-session helper was explicitly fail-closed, and the 13 targeted RPC/trigger functions had zero remaining NULL-as-Active employment fallbacks. No production changes were retained.

The source test suite was extended to cover all 13 affected functions. The previous code commit passed 88/88 tests; CI for the newest migration and test commits is still running/queued and must complete before release.

A final broader sweep in the same rolled-back rehearsal checked every public SECURITY DEFINER function, not only the 13 explicitly targeted functions. It returned zero remaining `coalesce(employment_status, 'Active') = 'Active'` fallbacks across the public privileged-function set.
