-- A teacher may read or update a score only when both the assessment
-- and the scored learner belong to the teacher's assigned class.
drop policy if exists "Assigned teachers read scores" on public.assessment_scores;
create policy "Assigned teachers read scores"
on public.assessment_scores
for select
to authenticated
using (
  public.is_school_admin()
  or exists (
    select 1
    from public.assessments a
    join public.students s
      on s.id = assessment_scores.student_id
     and s.class_id = a.class_id
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);

drop policy if exists "Assigned teachers update scores" on public.assessment_scores;
create policy "Assigned teachers update scores"
on public.assessment_scores
for update
to authenticated
using (
  exists (
    select 1
    from public.assessments a
    join public.students s
      on s.id = assessment_scores.student_id
     and s.class_id = a.class_id
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
)
with check (
  entered_by = (select auth.uid())
  and exists (
    select 1
    from public.assessments a
    join public.students s
      on s.id = assessment_scores.student_id
     and s.class_id = a.class_id
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);