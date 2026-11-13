-- Remove overlapping permissive policies and index new foreign keys.
drop policy if exists "Director manages prep sessions" on public.staff_prep_sessions;
drop policy if exists "Assigned staff read own prep sessions" on public.staff_prep_sessions;
create policy "Director and assigned staff read prep sessions"
on public.staff_prep_sessions for select to authenticated
using (public.is_school_director() or exists (
  select 1 from public.staff_prep_assignments a
  where a.prep_session_id=staff_prep_sessions.id and a.staff_user_id=(select auth.uid())
));
create policy "Director inserts prep sessions" on public.staff_prep_sessions for insert to authenticated with check (public.is_school_director());
create policy "Director updates prep sessions" on public.staff_prep_sessions for update to authenticated using (public.is_school_director()) with check (public.is_school_director());
create policy "Director deletes prep sessions" on public.staff_prep_sessions for delete to authenticated using (public.is_school_director());

drop policy if exists "Director manages prep assignments" on public.staff_prep_assignments;
drop policy if exists "Staff read own prep assignments" on public.staff_prep_assignments;
create policy "Director and assigned staff read prep assignments"
on public.staff_prep_assignments for select to authenticated
using (public.is_school_director() or staff_user_id=(select auth.uid()));
create policy "Director inserts prep assignments" on public.staff_prep_assignments for insert to authenticated with check (public.is_school_director());
create policy "Director updates prep assignments" on public.staff_prep_assignments for update to authenticated using (public.is_school_director()) with check (public.is_school_director());
create policy "Director deletes prep assignments" on public.staff_prep_assignments for delete to authenticated using (public.is_school_director());

drop policy if exists "Active staff read attendance calendar exceptions" on public.staff_attendance_calendar_exceptions;
drop policy if exists "Director manages attendance calendar exceptions" on public.staff_attendance_calendar_exceptions;
create policy "Active staff read attendance calendar exceptions"
on public.staff_attendance_calendar_exceptions for select to authenticated using (public.is_active_staff_session());
create policy "Director inserts attendance calendar exceptions" on public.staff_attendance_calendar_exceptions for insert to authenticated with check (public.is_school_director());
create policy "Director updates attendance calendar exceptions" on public.staff_attendance_calendar_exceptions for update to authenticated using (public.is_school_director()) with check (public.is_school_director());
create policy "Director deletes attendance calendar exceptions" on public.staff_attendance_calendar_exceptions for delete to authenticated using (public.is_school_director());

create index if not exists staff_attendance_policy_settings_updated_by_idx on public.staff_attendance_policy_settings(updated_by);
create index if not exists staff_prep_sessions_created_by_idx on public.staff_prep_sessions(created_by);
create index if not exists staff_prep_assignments_assigned_by_idx on public.staff_prep_assignments(assigned_by);
