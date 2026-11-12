# CORNHILL role-based staff access — implementation status

**Review date:** 11 November 2026  
**Working branch:** `feat/role-based-staff-access-subject-teachers-20261111`  
**Production status:** Role-specific sign-in frontend and access-code backend migration/function are deployed. Existing Director/Teacher identities and learner/finance records were preserved; no non-teaching Staff accounts have been provisioned by this release.

## Executive decision: every teacher has an individual identity

Yes. CORNHILL should provide a separate sign-in account for every real teacher, including teachers who are not class teachers. A subject specialist must not be forced to use a class teacher's login or share a class-wide password.

The current database role model should remain:

- `Admin` — Director.
- `Staff` — Headteacher, DOS, Bursar, Deputy Bursar and other non-teaching staff, distinguished by verified job title and explicit permission checks.
- `Teacher` — all teaching staff. Class teachers and subject-only teachers are distinguished by their assignment records, not by adding a new profile role.

This matches the existing `user_profiles.role` constraint (`Admin`, `Teacher`, `Staff`) and avoids breaking the many current helpers and policies that recognise `Teacher`.

## What the read-only live audit found

The connected database currently has:

- 1 active `Admin` profile.
- 10 `Teacher` profiles.
- 0 `Staff` profiles linked to sign-in accounts.
- 10 full-class teacher access rows.
- 10 class-teacher directory assignments.
- 55 class-subject teacher assignment rows.
- 12 academic teacher directory entries, 10 of which are linked to login profiles.
- 6 employee-directory records; none is currently linked to a login profile. The listed job-title categories include Director, School Bursar, Deputy School Bursar, Cook, Matrone and Security Guard.

There is currently no Headteacher or DOS staff account linked in the live profile table. The Bursar and Deputy Bursar employee records also have no linked sign-in account yet. Do not treat an employee directory entry as an active login.

## How non-class teachers will sign in and work

1. The Director creates or confirms the teacher's individual employee record and sends an individual invitation using the teacher's own school email. The existing `staff-invite` Edge Function supports individual `Teacher` invitations after it verifies an active teaching employee record.
2. The Director (or an authorised academic administrator once that permission is approved) links the account to the correct academic teacher record.
3. The DOS/Director assigns the subjects and classes in `class_subjects`. Each assignment explicitly records whether the teacher may enter marks, view report data, or message parents, and when the assignment starts and ends.
4. The teacher signs in to their own account. The intended academic dashboard lists only their assigned class/subject combinations.
5. The teacher receives only the minimum learner details and marks needed for those assignments. They do not receive full-class access, other subjects' marks, whole-school finance, payroll, staff-account management or Director-only settings.

The backend already contains subject-scoped helpers such as `can_teacher_view_subject`, `can_teacher_access_subject`, `teacher_list_my_assignments` and `teacher_subject_learner_roster`. A subject-only teacher must not be added to `class_teacher_access` or `class_teacher_directory_assignments` unless they are genuinely responsible for the entire class. Those records confer broader class access.

A genuine class teacher keeps their existing full-class access. A teacher who is both class teacher and subject specialist still receives one individual account, with the union of the specifically approved duties. A teacher with no current class or subject assignment should see staff notices, calendar and their own permitted staff information only—not learner records.

**Current sign-in evidence:** the School Services page already signs staff in with individual email + password and enables its Learning workspace for `Teacher` profiles. The new learning-resource RLS migration on this feature branch narrows the returned material to each subject teacher's active assignments. **Current limitation:** the full subject-teacher browser workflow and marks-entry dashboard still require end-to-end verification. The separate Headteacher/DOS staff-code login has not been verified as implemented. The existing class-teacher code endpoint is class-scoped and must not be reused for subject-only staff.

## Role and approval boundary

| Account | Allowed work | Must remain blocked |
|---|---|---|
| Director | All school departments, all records, account creation, permission changes, final approvals and audited reversals | None of the ordinary school modules; high-risk actions should still be audited |
| Headteacher | General school administration; view academic progress and approved reports; review operational matters within an explicitly delegated scope | Finance posting/approval, payroll, user password resets, DOS-only mark management and Director-only settings |
| DOS | Manage assessment definitions and marks; inspect academic records; review and recommend report-card release | Finance, payroll, general account management, unrestricted HR data and final school-wide release unless specifically approved |
| Bursar / Deputy Bursar | Learner fee lookup, payment posting, allocations, receipts, daily collection, permitted expense requests and bank deposit requests | Payment reversals, bank withdrawals approval, expense approval, payroll approval, account management and changes to academic results |
| Class Teacher | Their assigned class register and the academic actions enabled for their class/subjects | Unassigned classes, finance, payroll, staff account management and confidential school-wide administration |
| Subject-only Teacher | Exact assigned classes and subjects, minimum required learner roster data, and only the marks/report actions granted | Full-class register, unassigned subjects/classes, other subjects' marks, finance, payroll and administrative settings |

All roles use the same school database. Each screen must use role-scoped server queries and database RLS/RPC checks; merely hiding navigation items is not sufficient.

## Findings against the five implementation priorities

### 1. Headteacher and DOS permissions and approvals

**Already present in the database:**
- `is_school_dos()` and `is_school_headteacher()` recognise active `Staff` profiles by verified job title.
- `is_school_academic_manager()` includes Director and DOS.
- `is_school_academic_viewer()` includes Director, DOS and Headteacher.
- DOS/Director can manage assessments and assessment scores.
- Headteacher, DOS and Director can read the assessment and learner-register information covered by the academic policies.

**Still required:**
- Map and add narrowly defined Headteacher write permissions for general administration. Do not grant blanket access to all tables.
- Add a clear academic review workflow for DOS and Headteacher, with Director retaining final approval/publication.
- Verify the report-card preview, sign-off and publication screen against those role stages. The current `report_card_publications` policy is Director/Admin-only.
- Test that Headteacher cannot change marks, finance, payroll or staff accounts, and that DOS cannot change finance or general school administration.

### 2. Bursar finance operations with Director approvals

**Already present:** finance-operator helper; read access to posted payments, fee schedules/charges and daily collection; finance expense requests with Director-set limits; bank deposit/withdrawal request workflow; and Director-only expense and bank-withdrawal approval functions.

**Gap found:** `post_school_payment` was still Admin-only, preventing the Bursar from issuing normal receipts. A read-only review also found that `reverse_school_payment` checked the broader finance-operator helper, although the existing payment UPDATE RLS policy was Admin-only. The two controls were inconsistent.

**Staged change on this feature branch:** the new migration `20261111185000_bursar_payment_posting_director_reversal.sql`:
- changes only the payment-posting RPC to a narrowly scoped SECURITY DEFINER function requiring an active finance operator, with an empty search path and schema-qualified objects;
- leaves direct `school_payments` table INSERT/UPDATE policies Admin-only, so Bursar posting is only through the guarded RPC;
- removes the legacy direct Bursar INSERT policy on `school_expenses`, which could otherwise bypass the Director-approved expense-request workflow;
- tightens payment reversal to require `is_school_admin()`, keeping the existing Admin-only RLS UPDATE check as a second barrier;
- leaves expense approval, evidence review and bank-withdrawal approval Director/Admin-only.

**Not yet applied or live-tested.** Both new migrations are only in the feature branch. The payment and subject-resource migrations must pass staging tests and real Bursar/Director/subject-teacher browser tests before production release.

### 3. Staff-code sign-in for Headteacher and DOS

The current individual staff invitation endpoint invites by email and is restricted to Admin. The class-teacher code endpoint creates/updates a class-scoped login; it is not a suitable identity flow for a subject-only teacher or school leader.

The next authentication work should add an individual staff-code lookup for Headteacher/DOS, then authenticate with Supabase password authentication. Code lookup must be server-side, rate-limited, generic on failure, and must never return a staff email or password hash to the browser. Email/password can remain an alternate login where the account has an email. Director and Bursar stay email/password only.

### 4. Director-only account creation, reset and permission management

The existing staff invitation Edge Function checks that the caller is Admin and that the employee record is active and not already linked. This is a useful backend starting point. However, a complete Director-only account-management workspace, leadership onboarding, password reset flow and permission audit history still require implementation and browser verification.

Do not create new live users, change current passwords or link the existing Bursar employee record until the Director has reviewed the exact staff record and invitation destination.

### 5. Five-account-type testing

The database structural checks are being added under `supabase/tests/role_access_contracts.sql`. They verify function security mode, role guards, RLS state and critical approval policies. They do **not** replace authenticated end-to-end tests.

Before release, stage separate test identities for Director, Headteacher, DOS, Bursar and Teacher. Also test both Class Teacher and Subject-only Teacher assignments. Verify allowed operations and deliberate denial of unassigned academic, finance, payroll, HR and account-management actions.

## Release safety and source-control note

The feature branch is isolated from the production deployment. No migration has been applied to the live Supabase project and no live account has been created or edited.

The live migration ledger includes a leadership/academic/finance-operator migration whose source file was not present in the reviewed feature-branch migration tree. Reconcile that migration history with Git before release so the repository and database remain reproducible. Do not blindly reapply or duplicate an already-applied production migration.

Rollback for the staged payment change is to restore the previous `post_school_payment` and `reverse_school_payment` function definitions from the migration history, after confirming there are no open payments mid-transaction. No data-table columns or existing records are altered by the staged migration.


## Staff coordination update — 11 November 2026

The existing staff communication feed and direct messaging were audited against live RLS policies. Direct messages already use authenticated sender/recipient checks, and the staff directory is returned only to active signed-in accounts. The public staff sign-in page does not expose this directory.

A further gap was found: Headteacher/DOS accounts are stored under the established `Staff` role, but the staff announcement UI and RLS rules previously allowed the `teachers` audience only to `Admin` and `Teacher` roles. This prevented academic leadership from sending a teachers-only operational/academic announcement.

The feature branch now stages a least-privilege correction:
- Teachers and academic leaders (Director, Headteacher, DOS) may publish to the Teachers audience.
- Other Staff (including finance and operations roles) may publish to All Staff, but not to Teachers-only or Director-only channels.
- Headteacher/DOS can read the Teachers audience; other Staff can read their own post and All Staff messages.
- Director-only announcements remain Director-only.
- UI audience choices follow the same rule; the database RLS policy is the enforcement boundary.
- Staff employment status check at sign-in is normalized for case and whitespace, avoiding false rejection of an active record with inconsistent casing.

Staged migration: `20261111195000_staff_leadership_teacher_communication.sql`. The role contract test file now checks these policies. **The migration has not been applied to the live database and the SQL contract test has not yet been executed on staging.** JavaScript syntax parsing passed for all eight inline scripts after the UI changes.


## Verification follow-up — 11 November 2026, evening

The CI run initially exposed stale tests that expected old service-worker cache names (v90/v91) and an over-escaped regular expression in the marks-import test. Those test-maintenance issues were corrected. The marks-import test assertions were also aligned with the current account-session generation guard in `loadExcelMarksGrid()` and the current async report-card loader boundary.

Latest CI result for commit `19d58378bbe7c4aa35959dae74750b9619a07f09`:
- CORNHILL appearance/workspace tests: passed.
- CORNHILL marks-import mapping tests: passed.
- Eight inline JavaScript blocks: parsed with no syntax errors.
- Six edited Node test files: parsed with no syntax errors.

Vercel generated a READY preview for that same commit. The front-end preview is current; however, the staged Supabase communication migration is not applied, so the new Headteacher/DOS teacher-only announcement permissions are not active against the live database yet.


## Main dashboard role-specific login implementation — 12 November 2026

The shared School Staff sign-in was removed from the main dashboard in development. The main dashboard and standalone School Services page now provide distinct role choices for Headteacher, Deputy Headteacher, DOS, Main Bursar, Deputy Bursar and Other Staff. The existing Director/Admin main account and teacher class assignment path remain separate and intact. Teachers can use an individual access code plus password, with their existing individual email/password path as an alternative. DOS can use code/password or email/password; Headteacher/Deputy Headteacher use code/password; each bursar uses private email/password.

Role checks are performed after authentication against the signed-in profile's `role`, `job_title` and active employment status. The only full `Admin` remains the Director. No real Staff accounts have yet been provisioned. The feature branch includes an additive migration and a Director-managed code Edge Function; neither is yet deployed to production. CI's individual-access and appearance/workspace suites passed at commit `48e740d22dfbf199d8105f0771f891fd49e42d0e`.


## Production deployment confirmation — 12 November 2026

This section is authoritative and supersedes earlier staged-only statements in this document.

- PR #14 was merged to `feat/role-based-staff-access-subject-teachers-20261111` as `2e6c1a4d5d8f5f7d11e3c7b99a9bc21f208fa4e5`. Both individual staff access and appearance/workspace CI suites passed.
- Vercel production deployment `dpl_6zB7db5NEeUaQ9n1kz6ZmFpa9KFt` is READY from that merged commit. The permanent main domain and all 20 module aliases were attached. Main and School Services pages returned HTTP 200 and showed separate role sign-in flows.
- The production Supabase migration `20261112020000_individual_staff_access_codes` is applied. The access-code table has RLS enabled; anon and authenticated cannot read codes or execute the service-only rate limiter; only service_role can. No code has been issued yet.
- Edge Function `staff-access-code` is ACTIVE version 1. Its handler authenticates the signed-in Director for issuing/revoking access codes. The pre-auth login branch verifies a personal code and the same account's password and exact active employee/job-title linkage, with throttling and audit events.
- Live profile audit: 1 Admin/Director; 10 active Teacher profiles; 0 active Staff profiles; 0 linked leadership accounts; 0 issued access codes. A role-selection tile does not create an account and cannot grant access without the matching authenticated role/profile.
- Remaining: Director confirms real Headteacher, Deputy Headteacher, DOS, Main Bursar and Deputy Bursar employee details and official emails; existing rows are linked rather than duplicated; individual invitations/password setup and personal-code issuance follow; then run role-by-role end-to-end tests.
