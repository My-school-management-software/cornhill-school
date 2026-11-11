# CORNHILL unified staff account implementation — 11 November 2026

## Decision

The sign-in screen has exactly two staff sections:

1. **Teaching Staff** — every individual account whose security role is `Teacher` or whose staff category is `Teaching`.
2. **School Administrators** — the Director, Headteacher, DOS, Bursar and Deputy Bursar, plus other non-teaching staff accounts that must remain individually authenticated.

The second section is a sign-in grouping only. It does **not** make every account in that section an administrator. Database permissions continue to use the authenticated user ID, the existing security role, active employment status and explicit capability checks.

## Canonical identities

- One person has one Supabase Auth user and one linked `user_profiles` row.
- The existing Director remains the only active `Admin` identity and retains full access.
- Headteacher, DOS, Bursar and Deputy Bursar remain individual `Staff` identities with their own job titles and narrowly delegated permissions. They must not receive the `Admin` role.
- Class teachers and other teachers remain individual `Teacher` identities. Class assignment and subject assignment stay attached to the existing user ID.
- The academic teacher directory and school staff directory are linked reference records, not extra login identities.
- Account display names come from `user_profiles.full_name`; titles come from `job_title`.

## Database foundation in this branch

Migration `20261111220000_unified_staff_account_directory.sql`:

- Adds an index for active account directory lookups.
- Prevents creation of a second **active** `Admin` profile, protecting the single full-access Director account.
- Adds `public.staff_account_directory`, a security-invoker view with the two display sections and each owner's name/title.
- Grants view access only to authenticated users. Existing `user_profiles` RLS means an ordinary staff account can see its own directory row while the Director can see the full active directory.
- Exposes no email address, password, sign-in code, or credential material through the directory.
- Does not create, delete, rename, promote or migrate any existing account.

## Account lifecycle contract

### Add a teacher or other employee

1. The Director creates the employee's canonical record in `school_staff_directory`.
2. The invitation workflow checks that the record is active and not already linked.
3. The existing `staff-invite` Edge Function creates one Auth invitation and one matching profile, then links the employee record to that Auth user.
4. For teaching staff, the same canonical user ID is assigned to the existing academic teacher/class assignment records.
5. The new account appears in Teaching Staff after activation and profile refresh.
6. The employee receives a secure invitation/activation flow. Never display or store a reusable plaintext password or sign-in secret in the directory.

The invitation function validates the employee category, checks for an existing linked account, and prevents a second invitation when the employee is already linked. In this branch, the staff-registration interface invokes this workflow after saving the canonical employee record; inserting a directory row alone still does not create an Auth login.

### Staff departure / access removal

- Mark the employee as Exited through the Director-only `staff-employment-status` Edge Function. The authoritative profile is marked inactive first; the Auth ban then blocks future sign-in/refresh.
- Preserve the Auth identity/profile and all linked attendance, marks, finance audit and historical records.
- Do not delete the teacher's historic class/subject records or reassign their marks.
- Remove the account from the active sign-in directory automatically because the view filters to active employment.
- Restrictive active-session RLS policies now cover 17 staff-domain tables, and existing academic/finance helpers check current employment status. These database checks protect direct API requests that still carry an unexpired JWT. The browser also rechecks `is_active_staff_session()` every 60 seconds and on reconnect/visibility.
- Supabase does not revoke an already-issued access-token JWT immediately. Offline devices cannot receive a remote status change until reconnect; the current 12-hour cached roster remains read-only and is not full offline sign-in.

**Release verification still pending:** the two-section sign-in UI, automatic staff invitation, Director-only employment workflow and role-specific workspace navigation are implemented in this branch's `index.html`. They remain unmerged and undeployed, and still require browser/device verification before release.

## Application integration contract

Every application remains a workspace for the same authenticated person and canonical record IDs. The application may be shown only when the user's database-backed permission allows the relevant task. Evidence Capture must open with a record context (learner, staff profile or bank transaction) and retain that record UUID through upload/review. Banking and finance operations continue to use guarded RPCs and audit trails. Application shortcuts are not permission grants.

## Required release tests

1. Exactly one active Admin profile exists; an attempt to create another active Admin is rejected.
2. Director can read all active directory rows; Teacher/Staff can read only their own row.
3. Teaching accounts appear only in Teaching Staff; non-teaching accounts appear in School Administrators.
4. Changing a job title changes only the displayed title, never the security role.
5. Adding an employee without an invitation does not create a login.
6. Inviting an already-linked employee is rejected and creates no second Auth user.
7. New teacher invitation creates one Auth user/profile and links the same ID to the existing teacher records.
8. Exited staff disappear from active directory while historic records remain.
9. Exited staff cannot read/write protected records, including with a previously issued token.
10. Sign-out clears account-specific screen state; delayed responses from the old session cannot repaint the next account.
11. Direct navigation to another account's application route does not bypass its RLS/RPC permission checks.
12. Evidence Capture and Banking retain the originating record ID and actor ID.
13. Verify all cases with two simultaneous browser sessions and a shared Windows computer.


## Verification snapshot — 11 November 2026

- Read-only inspection of the connected production database found **11 active staff profiles: 1 Admin and 10 Teachers**. The Admin profile has no job title recorded; the new directory deliberately labels that one existing Admin as `Director · Full Access` without creating or promoting another identity.
- No Bursar, Deputy Bursar, DOS or Headteacher staff profiles were present in that snapshot, so none were invented or added.
- The migration SQL was executed against the production schema inside an explicit transaction and rolled back. The temporary view returned the expected grouping (1 Director / School Administrators; 10 Class Teachers / Teaching Staff). No production schema change was retained.
- Source-level tests cover the two sign-in sections, single Director identity, automatic staff invitations, role navigation, employment lifecycle, active-session heartbeat, restrictive RLS migration and offline snapshot bounds. The latest updated CI run is queued; do not treat the new checks as passed until that run completes.
- The rehearsal Supabase project currently has no public tables, so it is not yet a usable migration-test environment.
- The staff-invitation Edge Function now also verifies that the inviting Admin is still Active, not merely that the profile role says Admin.\n- The feature branch includes the main application entry file and the staff account UI changes. The staff directory migration and the new 17-table active-session RLS migration are committed to the feature branch but are **not applied permanently to production**.


## Employment-status hardening added in this branch
- On suspension, update `user_profiles.employment_status` first so database-backed authorization helpers immediately see the inactive state; then apply the long-duration Supabase Auth ban and synchronise linked directories.
- On reactivation, lift the Auth ban, synchronise the employee and academic teacher directories, and set the profile to Active last.
- Migration `20261111230000_require_active_staff_session_for_staff_tables.sql` adds restrictive policies to 17 existing staff-domain tables. A production-schema validation executed the migration logic inside a transaction, observed all 17 temporary policies, then rolled back; a follow-up read confirmed zero policies persisted.
- Auth ban does not revoke an already-issued JWT before expiry. RLS is the enforcement boundary; the browser heartbeat is an additional user-experience safeguard, not a replacement for RLS.
