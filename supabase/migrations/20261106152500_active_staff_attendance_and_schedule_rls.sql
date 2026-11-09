-- Align staff attendance and work-schedule RLS with active account authorization.
-- is_school_admin() requires the signed-in profile to be an active administrator.
drop policy if exists "Admins insert attendance events" on public.staff_attendance_events;
create policy "Admins insert attendance events"
on public.staff_attendance_events
for insert to authenticated
with check (recorded_by = (select auth.uid()) and public.is_school_admin());

drop policy if exists "Staff read own attendance events and admins read all" on public.staff_attendance_events;
create policy "Staff read own attendance events and admins read all"
on public.staff_attendance_events
for select to authenticated
using (
  (staff_user_id = (select auth.uid()) and exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and (p.employment_status = 'Active' or p.employment_status is null)
  ))
  or public.is_school_admin()
);

drop policy if exists "Admins manage work schedules" on public.staff_work_schedules;
create policy "Admins manage work schedules"
on public.staff_work_schedules
for all to authenticated
using (public.is_school_admin())
with check (created_by = (select auth.uid()) and public.is_school_admin());

drop policy if exists "Authenticated staff read active work schedules" on public.staff_work_schedules;
create policy "Authenticated staff read active work schedules"
on public.staff_work_schedules
for select to authenticated
using (
  (
    is_active
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid())
        and (p.employment_status = 'Active' or p.employment_status is null)
    )
  )
  or public.is_school_admin()
);
