# CORNHILL staff employment status and account access lifecycle

## Scope
This change adds an administrator-controlled employment-status workflow for linked Teacher and Staff accounts. It supports `Active`, `On Leave` and `Exited`. It does not delete staff identities, employee rows, academic history, attendance, finance, receipts or audit records.

## Security behavior
- Only the active Director/Admin identity may invoke the server-side `staff-employment-status` function.
- The endpoint verifies the caller using Supabase Auth and checks the active Director profile in `user_profiles`.
- The Director cannot target their own account, and a target with role `Admin` is protected.
- On Leave and Exited: the authoritative `user_profiles` status is changed first, causing the existing `is_active_staff_session()` and other profile-backed RLS helpers to deny requests as soon as the database update commits. The Auth account is then banned for a long duration to block future sign-in/refresh.
- Active: the Auth ban is lifted while the stored profile is still non-active; the employee and teacher directory rows are synchronised before the user profile is set to Active. The application continues rejecting sign-in until that profile update succeeds.
- `school_staff_directory` receives status and end date. `academic_teacher_directory` receives status only because that table has no end-date column.
- Exited requires a valid final working date.
- Reactivation lifts the Auth ban while the profile remains non-active, synchronises both linked directories, and only then sets the profile to Active.
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
