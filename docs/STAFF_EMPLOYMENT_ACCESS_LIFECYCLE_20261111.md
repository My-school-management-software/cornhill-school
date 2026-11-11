# CORNHILL staff employment status and account access lifecycle

## Scope
This change adds an administrator-controlled employment-status workflow for linked Teacher and Staff accounts. It supports `Active`, `On Leave` and `Exited`. It does not delete staff identities, employee rows, academic history, attendance, finance, receipts or audit records.

## Security behavior
- Only the active Director/Admin identity may invoke the server-side `staff-employment-status` function.
- The endpoint verifies the caller using Supabase Auth and checks the active Director profile in `user_profiles`.
- The Director cannot target their own account, and a target with role `Admin` is protected.
- On Leave and Exited: the Auth account is banned for a long duration before linked directory/profile statuses are changed. This is fail-closed if a later database update fails.
- Active: the Auth ban is lifted while the stored profile is still non-active; the employee and teacher directory rows are synchronised before the user profile is set to Active. The application continues rejecting sign-in until that profile update succeeds.
- `school_staff_directory` receives status and end date. `academic_teacher_directory` receives status only because that table has no end-date column.
- Exited requires a valid final working date.
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
