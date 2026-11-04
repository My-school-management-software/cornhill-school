-- Restrict learner and class roster reads to administrators and teachers
-- assigned to the corresponding class. Teachers cannot browse other classes.
drop policy if exists "Authenticated staff can read students" on public.students;
create policy "Admins and assigned teachers read students" on public.students
for select to authenticated
using (
  public.is_school_admin()
  or exists (
    select 1 from public.class_subjects cs
    where cs.class_id = students.class_id
      and cs.teacher_user_id = (select auth.uid())
  )
);

drop policy if exists "Authenticated staff can read classes" on public.school_classes;
create policy "Admins and assigned teachers read classes" on public.school_classes
for select to authenticated
using (
  public.is_school_admin()
  or exists (
    select 1 from public.class_subjects cs
    where cs.class_id = school_classes.id
      and cs.teacher_user_id = (select auth.uid())
  )
);

drop policy if exists "Authenticated users can read class subjects" on public.class_subjects;
create policy "Admins and assigned teachers read class subjects" on public.class_subjects
for select to authenticated
using (
  public.is_school_admin()
  or teacher_user_id = (select auth.uid())
);
