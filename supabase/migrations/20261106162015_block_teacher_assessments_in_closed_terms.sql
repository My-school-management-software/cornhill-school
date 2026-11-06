drop policy if exists "Assigned teachers create assessments" on public.assessments;
create policy "Assigned teachers create assessments"
on public.assessments
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_class_teacher_for_class(class_id)
  and max_score > 0
  and exists (
    select 1
    from public.class_subjects cs
    where cs.class_id = assessments.class_id
      and cs.subject_id = assessments.subject_id
      and cs.teacher_user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.academic_terms t
    where t.id = assessments.term_id
      and not t.is_closed
      and (assessments.assessment_date is null
        or assessments.assessment_date between t.starts_on and t.ends_on)
  )
);
