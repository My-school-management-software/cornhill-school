-- Enforce one-class-only access for every teacher. Subject assignments are
-- descriptive/admin configuration and must never grant cross-class access.
drop policy if exists "Admins and assigned teachers read students" on public.students;
create policy "Admins and assigned teachers read students"
on public.students for select to authenticated
using (public.is_school_admin() or public.is_class_teacher_for_class(class_id));

drop policy if exists "Admins and assigned teachers read classes" on public.school_classes;
create policy "Admins and assigned teachers read classes"
on public.school_classes for select to authenticated
using (public.is_school_admin() or public.is_class_teacher_for_class(id));

drop policy if exists "Admins and assigned teachers read class subjects" on public.class_subjects;
create policy "Admins and assigned teachers read class subjects"
on public.class_subjects for select to authenticated
using (public.is_school_admin() or public.is_class_teacher_for_class(class_id));

drop policy if exists "Assigned teachers read assessments" on public.assessments;
create policy "Assigned teachers read assessments"
on public.assessments for select to authenticated
using (public.is_school_admin() or public.is_class_teacher_for_class(class_id));

drop policy if exists "Assigned teachers read scores" on public.assessment_scores;
create policy "Assigned teachers read scores"
on public.assessment_scores for select to authenticated
using (
  public.is_school_admin()
  or exists (
    select 1 from public.assessments a
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);

drop policy if exists "Assigned teachers enter scores" on public.assessment_scores;
create policy "Assigned teachers enter scores"
on public.assessment_scores for insert to authenticated
with check (
  entered_by = (select auth.uid())
  and exists (
    select 1
    from public.assessments a
    join public.students s on s.id = assessment_scores.student_id
                         and s.class_id = a.class_id
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);

drop policy if exists "Assigned teachers update scores" on public.assessment_scores;
create policy "Assigned teachers update scores"
on public.assessment_scores for update to authenticated
using (
  exists (
    select 1 from public.assessments a
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
    where a.id = assessment_scores.assessment_id
      and public.is_class_teacher_for_class(a.class_id)
  )
);
