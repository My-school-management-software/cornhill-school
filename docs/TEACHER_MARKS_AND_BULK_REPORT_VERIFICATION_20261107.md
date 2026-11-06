# Teacher marks and bulk report-card verification — 2026-11-07

Branch: `feature/cornhill-v3-foundation`

## Results
- 25/25 source-structure checks passed against the current `index.html`.
- 20/20 live database metadata and policy checks passed.
- Total: 45/45 checks passed.

## Frontend source checks
Confirmed that the academic page contains:
- A teacher-only mark-entry workspace and an administrator-only teacher-submitted marks register.
- Administrator-only grading controls and report-card batch actions.
- Bulk marks save, spreadsheet save, and offline-draft synchronisation controls.
- A read-only description and CSV export for the administrator marks register.
- Term, class and learner report selectors.
- Bulk class report generation, PDF download and print actions.
- Active-learner and selected-class filtering for the batch.
- A separate learner ID passed into each report-card render.
- A4 portrait PDF configuration and page-break handling.
- Disabled download/print controls until a batch has been generated.
- Role checks around batch generation, download and print.
- LIN and P7 index fields in the marks sheet.

## Live database checks
Confirmed:
- RLS enabled on report-card publication and grading-band tables.
- Publication writes are governed by an administrator-only policy and require `approved_by = auth.uid()`.
- Grade-band management is administrator-only; authenticated users have read access.
- Anonymous users have no score read/insert/update privilege and no report-publication read privilege.
- Authenticated users have publication insert/update table grants, but RLS confines them to the administrator policy.
- Score rows have one unique constraint, three foreign keys, one non-negative score check and one enabled trigger.
- Score insert/update policies are teacher-assignment scoped; administrators have a separate read policy and no score write policy.
- There is no score DELETE policy.

## Limitations
These are source and database metadata checks, not browser execution or a test with separate real teacher and administrator sessions. The current database has only one learner, one assessment, no saved assessment scores and one class-subject assignment, as documented in the acceptance checklist. Therefore, a meaningful multi-learner PDF, page-count verification, grading calculation test, and role-based live interaction test still require disposable test accounts and test records. No such records were created in this batch.

No production learner records, marks, grades, report publications or credentials were changed.
