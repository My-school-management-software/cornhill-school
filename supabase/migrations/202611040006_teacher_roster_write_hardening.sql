-- Keep learner and class mutations administrator-only.
drop policy if exists "Authenticated staff can register students" on public.students;
drop policy if exists "Authenticated staff can update students" on public.students;
drop policy if exists "Authenticated staff can delete students" on public.students;
create policy "Admins manage students" on public.students
for all to authenticated
using (public.is_school_admin())
with check (public.is_school_admin());

drop policy if exists "Authenticated staff can add classes" on public.school_classes;
drop policy if exists "Authenticated staff can update classes" on public.school_classes;
drop policy if exists "Authenticated staff can delete classes" on public.school_classes;
create policy "Admins manage classes" on public.school_classes
for all to authenticated
using (public.is_school_admin())
with check (public.is_school_admin());
