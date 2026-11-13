# CORNHILL Local Academic Records Foundation — Batch 13

## Added
- Academic years with date and single-active-year constraints.
- Three-term academic-year structure with validated term dates and single active term per year.
- Fifteen subject/learning-area catalogue entries across Nursery, Lower Primary and Upper Primary.
- Class-specific subject mappings for Baby, Middle, Top and P.1–P.7.
- Assessment records scoped to an academic term and class, with draft/open/locked/published lifecycle.
- Learner marks with numeric score bounds, teacher attribution and unique learner/assessment/subject records.
- Composite foreign keys ensure each mark's subject is assigned to the assessment's class.
- Five academic permission catalogue entries; no permissions are automatically assigned to staff roles.
- Integration verifier checks all twelve school-domain tables, seeded subjects and class mapping counts.

## Subject mappings
- Baby, Middle, Top: Numbers, Language Development, Reading, Health Habits, Social Development, Writing, Drawing.
- P.1–P.3: English, Mathematics, Literacy I, Literacy II, Local Language, Religious Education.
- P.4–P.7: English, Mathematics, Science, Social Studies.
- Total marks, total aggregate, division and position are intended to be calculated consistently by the results/reporting layer, not manually entered as subjects.
- P.7 index number remains part of the learner identity record.

## Safety and validation
- Migration is additive and isolated to `cornhill_school` in the local database.
- No live Supabase data is read, altered, or imported.
- PUBLIC and browser roles receive no direct database grants.
- CI applies migrations to a disposable PostgreSQL 17 service, checks migration repeatability, runs PostgreSQL integration verifiers and the Windows unit suite.
- New migration CI result must be checked before describing this batch as fully verified.

## Still pending
- Local academic repository and protected teacher/admin API routes.
- Staff-class-subject assignment rules and permission mapping.
- Result calculations, report-card rendering and term publication workflows.
- Read-only legacy data mapping and reconciliation before any import.