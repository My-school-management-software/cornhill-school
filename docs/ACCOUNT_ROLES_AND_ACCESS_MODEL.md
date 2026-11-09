# CORNHILL account roles and access model

## Core rule

**One real person gets one individual sign-in account.** Staff should never share a class code, password or browser session. Job titles and duties belong to the staff profile; permissions are assigned separately and checked by the database.

## Account types

| Account type | Intended user | Default access |
|---|---|---|
| Administrator | Trusted school leadership account | School-wide administration, subject to explicit high-risk controls and audit logging |
| Class Teacher | Teacher responsible for one named class | Assigned class learners and class academic workflow; own attendance and private notices |
| Subject Teacher (planned) | Teacher of a subject across one or more classes | Only the assigned class + subject, its learners' minimum required identity fields and that subject's marks |
| Operational Staff | Bursar, store manager, matron, cooks, librarian, office/support staff | Own attendance, staff communication and only specifically delegated work duties |
| Parent/Guardian | Verified parent or guardian | Separate parent portal; only the learner(s) explicitly linked to that guardian |

## Current implementation state

- Live school account profiles currently contain **1 Admin and 10 Teacher accounts**. There are no Staff accounts yet.
- The profile role constraint currently permits `Admin`, `Teacher` and `Staff`.
- The current staff invitation endpoint invites `Teacher` or `Staff`; it does not create administrators.
- Class Teacher sign-in verifies an assigned class. The teacher is not allowed to select a different class at sign-in.
- The school already has an academic teacher directory and links teachers to class-subject rows. That directory is useful for recording subject specialisms and assignments, but it is not yet a safe substitute for a Subject Teacher account and login.
- The current `is_class_teacher_for_class` helper treats a linked `class_subjects.teacher_user_id` as class access. Therefore, placing a subject specialist's user ID directly in that field can grant more class-level visibility than the specialist should have. **Do not use that shortcut for subject-only staff.**

## Subject Teacher work needed before issuing invitations

1. Add a distinct `SubjectTeacher` account role and a verified class-subject assignment source that can cover multiple classes and subjects.
2. Create security-definer helpers that require the active signed-in SubjectTeacher and exact assigned `class_id` + `subject_id`.
3. Update RLS so a SubjectTeacher can see only the minimum learner details needed for their assigned class and only assessments/scores for their assigned subject. They must not see other subjects' marks, full class report cards, class-wide communication or other teachers' private records.
4. Add a dedicated sign-in path using that teacher's own email/password. Show only the teacher's assigned class/subject combinations after verification.
5. Use the existing single class-wide mark register where possible, but filter its subject columns and actions to the current subject assignment. Do not create a competing second marks-entry screen.
6. Make transfers, cover assignments, expiry dates, removal of access, mark corrections and result publication visible in the audit history.
7. Test with separate real test accounts: positive access to an assigned subject, and negative access to an unassigned subject, another class, other report-card subjects, finance and administrator settings.

## Operational Staff

A bursar, store manager or matron should not each become a new privileged database role just because their job title differs. Start with one individual `Staff` identity and attach job title, department and approved capability grants. Examples:

- **Bursar:** payment entry, allocation and receipt reprint permissions may be delegated; approval/reversal and payroll permissions require separate higher-level approval.
- **Store manager:** stock receipt, issue and count permissions; no access to learner finance or academic results by default.
- **Matron / Senior Woman / Senior Man:** only approved learner welfare information; no general finance, payroll or marks access.
- **Cooks / support staff:** duty and attendance views only unless a separate task is explicitly delegated.
- **DOS / Deputy Headteacher:** academic oversight and approvals may be granted without automatically giving unrestricted financial access.

A staff member who has several school responsibilities should still have one sign-in identity and one staff record. A person who is both Headteacher and a class teacher should receive a combined set of explicitly granted duties, not two conflicting accounts.

## Parent and Guardian

The Parent/Guardian portal is intentionally separate from the staff/admin dashboard. A parent is not a Staff user and must not be able to open the school administration workspace.

- Verify guardian access through the school-recorded contact and a second factor/PIN.
- Link each guardian only to approved learner records; one guardian may have several linked children.
- A parent can view only those linked learners' published reports, approved attendance/communication information and their own learner's account statement.
- Do not expose class lists, staff profiles, staff attendance, internal notes, other family balances or unapproved marks.
- Guardian PIN changes, new contact numbers, access links and session events should be audited. Do not store or display the raw PIN in ordinary app pages.

## Shared-computer behaviour

- Sign-out clears rendered account data and local form state from the page.
- Browser-local preferences and any permitted offline drafts must be keyed to the authenticated user.
- Late network responses from the previous session must be discarded.
- Sign-out should end the current browser session without unexpectedly signing that user out on their phone or another computer.
- The signed-in name and role should remain visible so staff can confirm which account is currently open.

## Release gate

Do not issue Subject Teacher or elevated operational access until the assignment model, database grants, RLS, interface navigation, negative permission tests and live browser tests are all complete. Menu hiding alone is not a security boundary.
