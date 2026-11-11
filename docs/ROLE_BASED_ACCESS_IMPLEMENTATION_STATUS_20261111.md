# CORNHILL role-based staff access — implementation status

**Review date:** 11 November 2026  
**Working branch:** `feat/role-based-staff-access-subject-teachers-20261111`  
**Production status:** No live Supabase migration has been applied by this work cycle. Existing accounts, credentials, learner records and finance records have not been changed.

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

**Current limitation:** the individual email invitation path exists, and the database has subject-scope helpers, but the full subject-teacher browser sign-in and filtered dashboard still require end-to-end verification. The separate Headteacher/DOS staff-code login has not been verified as implemented. The existing class-teacher code endpoint is class-scoped and must not be reused for subject-only staff.

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
