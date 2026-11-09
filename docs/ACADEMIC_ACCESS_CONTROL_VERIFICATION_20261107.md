# Academic access-control verification — 2026-11-07

Branch: `feature/cornhill-v3-foundation`
Supabase project: `yemhortbudwbcrzsoozk`

## Scope
Read-only verification of the live academic access model and learner-register column grants. No schema, permissions, school records, users, marks, grades or term data were changed.

## Results
- 39/39 valid checks passed across the initial 40-check inspection.
- One initial assertion was invalid: it expected authenticated users to have no DELETE table grant on `class_teacher_access`. The table grant exists, but the only ALL-operation policy inspected is guarded by `is_school_admin()`. The corrected check confirmed assignment deletion is administrator-guarded.
- 8/8 follow-up integrity/security checks passed.
- Total: 47 valid checks passed.

## Confirmed controls
- RLS is enabled on `assessment_scores`, `assessments` and `class_teacher_access`.
- Teachers' score SELECT, INSERT and UPDATE policies are tied to assigned class/subject access.
- Score writes bind `entered_by` to the authenticated user.
- Administrators have a score-read policy, but no administrator score INSERT/UPDATE/DELETE policy was found.
- Administrators manage assessment configuration and class-teacher assignments.
- Teacher assessment creation checks the creator, class/subject assignment, positive maximum score, open term and assessment date within term dates.
- Learner direct SELECT is column-limited rather than table-wide. The permitted register columns include admission number, LIN, P7 index, learner names, class and status.
- No matching guardian/parent contact, home-address, bursary or photo columns were found among authenticated direct SELECT grants.
- Score records have a unique constraint on assessment/student, a non-negative score check, foreign keys for assessment/student/entered_by, and an enabled trigger.
- Score deletion has no RLS policy.

## Important interpretation
The check verifies database metadata and policy definitions; it does not simulate separate live teacher/admin sessions or prove every UI action. The existing assignment DELETE table grant is not itself a bypass because the applicable RLS policy is administrator-guarded. Do not remove that grant without checking the administrator assignment-removal workflow.

## Still pending
- Browser-level testing with separate teacher and administrator accounts.
- Confirming that the administrator UI exposes marks only as read-only and provides bulk report-card PDF generation.
- Teacher entry/update workflow with non-production test accounts and a disposable test assessment.
- Grading calculations and class-specific report-card output.
- Parent portal, password recovery, finance, attendance, offline sync and device testing.

No real school records or credentials were accessed or modified by this verification.
