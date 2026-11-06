revoke all privileges on table
  public.academic_years,
  public.academic_terms,
  public.assessments,
  public.assessment_scores,
  public.class_subjects,
  public.school_classes,
  public.students,
  public.subjects
from anon, authenticated;

grant select, insert, update, delete on table
  public.academic_years,
  public.academic_terms,
  public.assessments,
  public.class_subjects,
  public.school_classes,
  public.students,
  public.subjects
to authenticated;

grant select, insert, update on table public.assessment_scores to authenticated;
