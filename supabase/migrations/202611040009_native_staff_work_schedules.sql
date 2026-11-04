-- Native Cornhill staff work schedules and staff-to-schedule assignments.
-- Jibble remains a design reference only; this schema has no external time-tracking dependency.

create table if not exists public.staff_work_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  start_time time not null,
  end_time time not null,
  grace_minutes integer not null default 10 check (grace_minutes between 0 and 240),
  break_minutes integer not null default 0 check (break_minutes between 0 and 480),
  weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  is_active boolean not null default true,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  check (start_time <> end_time),
  check (cardinality(weekdays) between 1 and 7),
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table if not exists public.staff_attendance_schedule_assignments (
  staff_user_id uuid primary key references public.user_profiles(id) on delete cascade,
  schedule_id uuid not null references public.staff_work_schedules(id),
  assigned_by uuid not null references public.user_profiles(id),
  assigned_at timestamptz not null default now()
);

alter table public.staff_work_schedules enable row level security;
alter table public.staff_attendance_schedule_assignments enable row level security;

-- Supabase Data API no longer grants new public-schema tables automatically.
grant select on public.staff_work_schedules to authenticated;
grant insert, update, delete on public.staff_work_schedules to authenticated;
grant select on public.staff_attendance_schedule_assignments to authenticated;
grant insert, update, delete on public.staff_attendance_schedule_assignments to authenticated;

create policy "Authenticated staff read active work schedules"
on public.staff_work_schedules for select to authenticated
using (is_active or exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.role='Admin'
));

create policy "Admins manage work schedules"
on public.staff_work_schedules for all to authenticated
using (exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.role='Admin'
))
with check (
  created_by=(select auth.uid()) and exists (
    select 1 from public.user_profiles p
    where p.id=(select auth.uid()) and p.role='Admin'
  )
);

create policy "Staff read own schedule assignment and admins read all"
on public.staff_attendance_schedule_assignments for select to authenticated
using (
  staff_user_id=(select auth.uid()) or exists (
    select 1 from public.user_profiles p
    where p.id=(select auth.uid()) and p.role='Admin'
  )
);

create policy "Admins manage schedule assignments"
on public.staff_attendance_schedule_assignments for all to authenticated
using (exists (
  select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and p.role='Admin'
))
with check (
  assigned_by=(select auth.uid()) and exists (
    select 1 from public.user_profiles p
    where p.id=(select auth.uid()) and p.role='Admin'
  )
);

create index if not exists staff_attendance_schedule_assignments_schedule_idx
on public.staff_attendance_schedule_assignments(schedule_id);
