# CORNHILL bulk academic and promotion verification — 8 November 2026

## Scope
Read-only review of the original school Excel workbooks and current academic/promotion code. No learner marks, learner classes, finance rows, attendance records, or other live school data were changed.

## Original workbook review
- Reviewed 10 class levels: Baby, Middle, Top, P1, P2, P3, P4, P5, P6 and P7.
- 11 Library files were present because Middle had two duplicate copies; both Middle copies were reviewed.
- 567 named learner rows across the 10 unique class workbooks (the duplicate Middle copy is counted once).
- Every detected curriculum subject column in the reviewed workbooks mapped to a known class subject alias in the current importer.
- The original workbook structures include multiple periods/sets, totals, aggregates, divisions, positions, boarding/bursary columns, comments, formulas and summary sections.
- Blank subject cells are skipped rather than imported as zero; formulas are skipped rather than treated as marks.
- One actual P7 source-data issue was identified: SST1, Excel row 16, contains text `33O` rather than a numeric mark. The importer should flag this for correction and must not silently guess that letter O means zero.
- Summary rows such as class enrolment, division summaries, performance analysis and gender totals must remain excluded from learner import rows.

## Code-level checks
- 32/32 workbook mapping, teacher-role, promotion, work-plan and HTML-ID checks passed.
- 9/9 inline JavaScript blocks parsed successfully.
- 10/10 workbook class sheet names recognised by the importer.
- 10/10 class curriculum mappings passed against the actual workbook subject headings.
- Teacher assessment setup is hidden from teacher accounts; administrators prepare assessments.
- Individual missed-paper entry is retained in a collapsed section.
- Main class-wide all-subject mark sheet and Excel preview/confirmation controls remain present.
- Teacher individual and bulk promotion controls are disabled and labelled administrator-only.
- Private administrator work plan includes future teacher promotion, fingerprint hardware, SMS provider setup, offline sync, backup restore and other pending features.

## Promotion verification
- The administrator bulk-promotion handler's previous targeted checks passed 22/22.
- Live database checks from the prior verification found consistent active enrolment class links and no duplicate active pupil codes.
- Do not run test promotions against real learners. A controlled test account and test learners are required for end-to-end promotion verification.

## Not yet end-to-end verified
- Actual Excel import into assessment records and the resulting report-card previews, using dedicated test learner records.
- Mobile browser interaction for the full all-subject grid and import review.
- Live teacher account access, teacher marks submission and report-card display.
- Controlled bulk-promotion transaction using test-only learners.
- Full finance, parent portal, attendance/fingerprint, inventory and backup restore workflows.

## Deployment note
The latest source commit after this verification is not yet deployed. Vercel rejected another preview deployment with its free-plan daily API deployment limit (`api-deployments-free-per-day`, retry after 24 hours). The latest successful preview is older than the latest source changes and must not be represented as containing this verification's updates.
