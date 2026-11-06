revoke all privileges on table
  public.school_curriculum_subjects,
  public.uneb_subject_grade_bands
from anon, authenticated;

grant select, insert, update, delete on table
  public.school_curriculum_subjects,
  public.uneb_subject_grade_bands
to authenticated;
