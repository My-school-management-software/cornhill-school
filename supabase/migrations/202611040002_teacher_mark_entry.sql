-- Teacher mark-entry permissions. Teachers may see and edit marks only
-- for assessments matching a class/subject assigned to their user profile.
drop policy if exists "Authenticated users can read assessments" on public.assessments;
drop policy if exists "Authenticated users can read scores" on public.assessment_scores;
drop policy if exists "Assigned teachers read assessments" on public.assessments;
create policy "Assigned teachers read assessments" on public.assessments
for select to authenticated using (
 public.is_school_admin()
 or exists(select 1 from public.class_subjects cs
  where cs.class_id=assessments.class_id and cs.subject_id=assessments.subject_id
  and cs.teacher_user_id=(select auth.uid()))
);
drop policy if exists "Assigned teachers read scores" on public.assessment_scores;
create policy "Assigned teachers read scores" on public.assessment_scores
for select to authenticated using (
 public.is_school_admin()
 or exists(select 1 from public.assessments a
  join public.class_subjects cs on cs.class_id=a.class_id and cs.subject_id=a.subject_id
  where a.id=assessment_scores.assessment_id and cs.teacher_user_id=(select auth.uid()))
);
drop policy if exists "Assigned teachers enter scores" on public.assessment_scores;
create policy "Assigned teachers enter scores" on public.assessment_scores
for insert to authenticated with check (
 entered_by=(select auth.uid())
 and exists(select 1 from public.assessments a
  join public.class_subjects cs on cs.class_id=a.class_id and cs.subject_id=a.subject_id
  join public.students s on s.id=assessment_scores.student_id and s.class_id=a.class_id
  where a.id=assessment_scores.assessment_id and cs.teacher_user_id=(select auth.uid()))
);
drop policy if exists "Assigned teachers update scores" on public.assessment_scores;
create policy "Assigned teachers update scores" on public.assessment_scores
for update to authenticated using (
 exists(select 1 from public.assessments a
  join public.class_subjects cs on cs.class_id=a.class_id and cs.subject_id=a.subject_id
  where a.id=assessment_scores.assessment_id and cs.teacher_user_id=(select auth.uid()))
) with check (
 entered_by=(select auth.uid())
 and exists(select 1 from public.assessments a
  join public.class_subjects cs on cs.class_id=a.class_id and cs.subject_id=a.subject_id
  join public.students s on s.id=assessment_scores.student_id and s.class_id=a.class_id
  where a.id=assessment_scores.assessment_id and cs.teacher_user_id=(select auth.uid()))
);
create index if not exists class_subjects_teacher_assignment_idx
on public.class_subjects(teacher_user_id,class_id,subject_id)
where teacher_user_id is not null;
