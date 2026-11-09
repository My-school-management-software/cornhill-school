-- CORNHILL: assessment setup is administrator-controlled.
-- Teachers enter marks only into assessments prepared by an administrator.
-- The existing "Admins manage assessments" ALL policy remains unchanged.
drop policy if exists "Teachers create only assigned subject assessments" on public.assessments;

comment on table public.assessments is
'Assessment definitions and periods are prepared by school administrators. Assigned teachers may read their permitted assessments and enter marks through assessment_scores policies.';
