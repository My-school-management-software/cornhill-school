# CORNHILL Offline, Role and Communications Security Test Batch

**Review date:** 6 November 2026  
**Environment:** GitHub source inspection and read-only Supabase policy review, followed by two applied security migrations. No learner, finance, staff, attendance, message or payroll records were changed.

## Offline code review — 16 checks

All 16 source checks passed:
1. Class-list snapshots use IndexedDB.
2. Assessment drafts use IndexedDB.
3. Generic form drafts use IndexedDB.
4. IndexedDB version 3 preserves all three stores.
5. Class snapshots use a 24-hour expiry.
6. Assessment synchronisation is restricted to Teacher role.
7. Assessment synchronisation requires online connectivity and a signed-in account.
8. Sync revalidates the current authenticated user.
9. Draft author must match the signed-in user.
10. Existing score updates compare the saved baseline score and teacher comment.
11. Conflicts remain pending rather than silently overwriting a changed server value.
12. Reconnect handling attempts both attendance-correction and assessment-draft sync.
13. Attendance correction queue checks the owning account.
14. Offline snapshot mode disables changes and limits navigation.
15. Service worker does not cache cross-origin requests.
16. Service worker uses the app shell and same-origin navigation cache only.

**Limitations:** these are source-level checks. IndexedDB upgrade behaviour, browser offline transitions, concurrent score edits, reconnect synchronisation and Android/Windows operation have not yet been exercised in real browsers. Offline IndexedDB contents are not app-level encrypted; use locked, trusted school devices and sign out of shared devices.

## Role and permissions review — 24 checks

All 24 database policy/source checks passed:
- Active Admin and active Teacher helper logic.
- Administrator-managed teacher/class assignment.
- Teacher assignment read scope.
- Staff profile self/admin read and administrator-only updates.
- RLS on attendance events, adjustments, schedules and schedule assignments.
- Staff self-service attendance adjustment request policy and administrator review audit.
- Administrator-only attendance event insertion.
- Administrator-only salary agreements and advances; staff can read only their own advances.
- Administrator-only communication templates and outbox visibility.
- No client grants to communication provider settings or delivery event tables.
- Direct messages and call signalling use participant-scoped access policies.

## Issue discovered and corrected

The review identified that six staff collaboration tables did not consistently require an active employment profile in every RLS policy: posts, comments, reactions, direct messages, media messages and call signals. An inactive account with a still-valid session could potentially retain some collaboration access.

Applied migration `20261106202524_require_active_staff_for_staff_communications`:
- Added `is_active_staff_session()`.
- Wrapped all existing USING and WITH CHECK predicates on all six tables with the active-staff guard, preserving the original role, participant and audience rules.

Applied follow-up migration `20261106202548_use_invoker_for_active_staff_guard`:
- Changed the helper to SECURITY INVOKER so it checks the caller's own profile under existing RLS, rather than introducing another SECURITY DEFINER function.
- Explicitly revoked execution from PUBLIC and anon; granted authenticated execution only.

Post-fix verification:
- All 18 policies across the six collaboration tables now include the active-staff guard.
- Helper is SECURITY INVOKER.
- Anonymous execution is false; authenticated execution is true.
- Supabase health advisor returned zero lints.
- Security advisor returned the same 20 existing authenticated SECURITY DEFINER notices, six service-only RLS-without-policy informational notices, the pg_net-in-public warning and leaked-password-protection warning. The new helper did not add to the SECURITY DEFINER warning count.

## Not yet tested
- Real inactive-user session denial in a browser.
- Teacher/Admin/Staff account interaction with posts, comments, reactions, direct messages, media and calls.
- Offline IndexedDB upgrade, offline edits and reconnection on Windows and Android.
- Actual communication provider sending and delivery callbacks remain unconfigured.

No school records were modified. The migrations changed policy/function definitions only.
