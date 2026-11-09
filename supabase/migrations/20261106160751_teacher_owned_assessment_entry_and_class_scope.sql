create or replace function public.is_class_teacher_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
      and (
        exists (
          select 1
          from public.class_teacher_access cta
          where cta.class_id = p_class_id
            and cta.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.class_subjects cs
          where cs.class_id = p_class_id
            and cs.teacher_user_id = (select auth.uid())
        )
      )
  );
$function$;

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
      and (assessments.assessment_date is null
        or assessments.assessment_date between t.starts_on and t.ends_on)
  )
);
