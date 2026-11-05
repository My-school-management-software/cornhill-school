-- Class-specific teacher accounts and access boundaries.
create table if not exists public.class_teacher_access (
 class_id uuid primary key references public.school_classes(id) on delete cascade,
 user_id uuid not null unique references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.class_teacher_access enable row level security;
drop policy if exists "Admins manage class teacher access" on public.class_teacher_access;
create policy "Admins manage class teacher access" on public.class_teacher_access for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
drop policy if exists "Teachers read own class access" on public.class_teacher_access;
create policy "Teachers read own class access" on public.class_teacher_access for select to authenticated using (user_id=(select auth.uid()));
create or replace function public.is_class_teacher_for_class(p_class_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.class_teacher_access c where c.class_id=p_class_id and c.user_id=(select auth.uid())); $$;
revoke all on function public.is_class_teacher_for_class(uuid) from public,anon;
grant execute on function public.is_class_teacher_for_class(uuid) to authenticated;
drop policy if exists "Admins and assigned teachers read students" on public.students;
create policy "Admins and assigned teachers read students" on public.students for select to authenticated using (public.is_school_admin() or public.is_class_teacher_for_class(class_id) or exists(select 1 from public.class_subjects cs where cs.class_id=students.class_id and cs.teacher_user_id=(select auth.uid())));
drop policy if exists "Assigned teachers read assessments" on public.assessments;
create policy "Assigned teachers read assessments" on public.assessments for select to authenticated using (public.is_school_admin() or public.is_class_teacher_for_class(class_id) or exists(select 1 from public.class_subjects cs where cs.class_id=assessments.class_id and cs.subject_id=assessments.subject_id and cs.teacher_user_id=(select auth.uid())));
drop policy if exists "Assigned teachers read scores" on public.assessment_scores;
create policy "Assigned teachers read scores" on public.assessment_scores for select to authenticated using (public.is_school_admin() or exists(select 1 from public.assessments a where a.id=assessment_scores.assessment_id and (public.is_class_teacher_for_class(a.class_id) or exists(select 1 from public.class_subjects cs where cs.class_id=a.class_id and cs.subject_id=a.subject_id and cs.teacher_user_id=(select auth.uid())))));
drop policy if exists "Assigned teachers enter scores" on public.assessment_scores;
create policy "Assigned teachers enter scores" on public.assessment_scores for insert to authenticated with check (entered_by=(select auth.uid()) and exists(select 1 from public.assessments a join public.students s on s.id=assessment_scores.student_id and s.class_id=a.class_id where a.id=assessment_scores.assessment_id and (public.is_class_teacher_for_class(a.class_id) or exists(select 1 from public.class_subjects cs where cs.class_id=a.class_id and cs.subject_id=a.subject_id and cs.teacher_user_id=(select auth.uid())))));
drop policy if exists "Assigned teachers update scores" on public.assessment_scores;
create policy "Assigned teachers update scores" on public.assessment_scores for update to authenticated using (exists(select 1 from public.assessments a where a.id=assessment_scores.assessment_id and (public.is_class_teacher_for_class(a.class_id) or exists(select 1 from public.class_subjects cs where cs.class_id=a.class_id and cs.subject_id=a.subject_id and cs.teacher_user_id=(select auth.uid()))))) with check (entered_by=(select auth.uid()) and exists(select 1 from public.assessments a join public.students s on s.id=assessment_scores.student_id and s.class_id=a.class_id where a.id=assessment_scores.assessment_id and (public.is_class_teacher_for_class(a.class_id) or exists(select 1 from public.class_subjects cs where cs.class_id=a.class_id and cs.subject_id=a.subject_id and cs.teacher_user_id=(select auth.uid())))));
drop policy if exists "Admins and assigned teachers read class subjects" on public.class_subjects;
create policy "Admins and assigned teachers read class subjects" on public.class_subjects for select to authenticated using (public.is_school_admin() or teacher_user_id=(select auth.uid()) or public.is_class_teacher_for_class(class_id));
drop policy if exists "Admins and assigned teachers read classes" on public.school_classes;
create policy "Admins and assigned teachers read classes" on public.school_classes for select to authenticated using (public.is_school_admin() or public.is_class_teacher_for_class(id) or exists(select 1 from public.class_subjects cs where cs.class_id=school_classes.id and cs.teacher_user_id=(select auth.uid())));
