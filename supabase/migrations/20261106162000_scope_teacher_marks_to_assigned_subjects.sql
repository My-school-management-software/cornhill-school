drop policy if exists "Assigned teachers read assessments" on public.assessments;
create policy "Assigned teachers read assessments"
on public.assessments
for select
to authenticated
using (
  public.is_school_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.class_id = assessments.class_id
      and cs.subject_id = assessments.subject_id
      and cs.teacher_user_id = (select auth.uid())
      and public.is_class_teacher_for_class(assessments.class_id)
  )
);

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
    join public.students s on s.id = assessment_scores.student_id
      and s.class_id = a.class_id
    join public.class_subjects cs on cs.class_id = a.class_id
      and cs.subject_id = a.subject_id
      and cs.teacher_user_id = (select auth.uid())
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);

drop policy if exists "Assigned teachers enter scores" on public.assessment_scores;
create policy "Assigned teachers enter scores"
on public.assessment_scores
for insert
to authenticated
with check (
  entered_by = (select auth.uid())
  and exists (
    select 1
    from public.assessments a
    join public.students s on s.id = assessment_scores.student_id
      and s.class_id = a.class_id
    join public.class_subjects cs on cs.class_id = a.class_id
      and cs.subject_id = a.subject_id
      and cs.teacher_user_id = (select auth.uid())
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
    join public.students s on s.id = assessment_scores.student_id
      and s.class_id = a.class_id
    join public.class_subjects cs on cs.class_id = a.class_id
      and cs.subject_id = a.subject_id
      and cs.teacher_user_id = (select auth.uid())
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
)
with check (
  entered_by = (select auth.uid())
  and exists (
    select 1
    from public.assessments a
    join public.students s on s.id = assessment_scores.student_id
      and s.class_id = a.class_id
    join public.class_subjects cs on cs.class_id = a.class_id
      and cs.subject_id = a.subject_id
      and cs.teacher_user_id = (select auth.uid())
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);
