# CORNHILL account roles and access model

## Core rule

**One real person gets one individual sign-in account.** Staff should never share a class code, password or browser session. Job titles and duties belong to the staff profile; permissions are assigned separately and checked by the database.

## Account types

| Account type | Intended user | Default access |
|---|---|---|
| Administrator | Trusted school leadership account | School-wide administration, subject to explicit high-risk controls and audit logging |
| Class Teacher | Teacher responsible for one named class | Assigned class learners and class academic workflow; own attendance and private notices |
| Subject Teacher | Individual teacher assigned to one or more exact class + subject combinations | Only assigned classes/subjects, minimum learner identity fields, and permitted marks/report actions |
| Operational Staff | Bursar, store manager, matron, cooks, librarian, office/support staff | Own attendance, staff communication and only specifically delegated work duties |
| Parent/Guardian | Verified parent or guardian | Separate parent portal; only the learner(s) explicitly linked to that guardian |

## Current implementation state

- Live school account profiles currently contain **1 Admin and 10 Teacher accounts**. There are no Staff accounts yet.
- The profile role constraint currently permits `Admin`, `Teacher` and `Staff`.
- The current staff invitation endpoint invites `Teacher` or `Staff`; it does not create administrators.
- Class Teacher sign-in verifies an assigned class. The teacher is not allowed to select a different class at sign-in.
- The database already contains subject-scoped assignment helpers and an individual Teacher invitation path. The full subject-only browser experience still needs end-to-end verification.
- Keep the existing profile role as `Teacher` for both class teachers and subject-only teachers. Do not add a new `SubjectTeacher` profile role unless the whole role constraint, helpers and RLS model are deliberately migrated.
- Full-class privileges come from the full-class assignment records. **Never add a subject-only teacher to `class_teacher_access` or `class_teacher_directory_assignments` unless they are genuinely responsible for that whole class.**

## Subject Teacher implementation and release checks

The data model and core database helpers are already present for subject-scoped teacher access. Before issuing subject-only invitations or treating the workflow as production-ready:

1. Create one individual `Teacher` Auth account per real teacher. The Director-only staff invitation endpoint supports email invitations for an active teaching employee record that is not already linked. Do not use the class-wide code/reset endpoint for a subject-only teacher.
2. Link the new account to the matching `academic_teacher_directory` entry. Assign only the exact `class_subjects` rows required, with explicit `can_enter_marks`, `can_view_reports` and `can_message_parents` flags and start/end dates.
3. Keep subject-only teachers out of full-class assignment tables. The existing `can_teacher_view_subject`, `can_teacher_access_subject`, `teacher_list_my_assignments` and `teacher_subject_learner_roster` helpers are intended to enforce and display the narrow assignment.
4. Verify RLS so the teacher sees only the minimum learner fields and assessments/scores for assigned subjects. They must not see other subjects' marks, whole-class report cards, unassigned classes, finance, payroll or staff-account management.
5. Wire and test the individual teacher experience: after sign-in, show only assigned class/subject combinations. Reuse the existing learning and marks workspaces with subject-filtered data; do not create a competing marks register.
6. Audit assignment start/end dates, cover assignments, removal of access, mark corrections and result publication.
7. Use separate non-production test accounts to prove allowed access to an assigned subject and denied access to an unassigned subject, another class, other report-card subjects, finance and administrator settings.

A subject teacher can be a teacher in several classes and subjects with one account. If the person is also a class teacher, combine the expressly approved assignments on that same account; do not issue duplicate accounts.
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
