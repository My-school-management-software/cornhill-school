-- Cornhill staff attendance foundation
-- USB exports are imported by an authorized administrator. This migration does not
-- connect a physical fingerprint terminal or store biometric templates.

create table if not exists public.staff_attendance_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('usb_csv','manual')),
  source_file_name text,
  source_file_sha256 text,
  device_model text,
  device_serial text,
  imported_rows integer not null default 0 check (imported_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  notes text,
  created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_attendance_events (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.user_profiles(id),
  event_type text not null check (event_type in ('clock_in','clock_out','break_start','break_end')),
  occurred_at timestamptz not null,
  source text not null check (source in ('usb_csv','manual','device_api')),
  import_batch_id uuid references public.staff_attendance_import_batches(id),
  device_model text,
  device_serial text,
  device_user_id text,
  external_event_id text,
  recorded_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  constraint staff_attendance_event_source_batch_check check (
    (source = 'usb_csv' and import_batch_id is not null) or
    (source <> 'usb_csv')
  )
);

create unique index if not exists staff_attendance_device_event_unique
  on public.staff_attendance_events(device_serial, external_event_id)
  where device_serial is not null and external_event_id is not null;

create index if not exists staff_attendance_events_staff_time_idx
  on public.staff_attendance_events(staff_user_id, occurred_at desc);

create index if not exists staff_attendance_events_time_idx
  on public.staff_attendance_events(occurred_at desc);

create table if not exists public.staff_attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.user_profiles(id),
  attendance_date date not null,
  adjustment_type text not null check (adjustment_type in ('missed_clock_in','missed_clock_out','time_correction','absence_excuse','other')),
  proposed_time timestamptz,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.user_profiles(id),
  reviewed_by uuid references public.user_profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint staff_attendance_adjustment_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null) or
    (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists staff_attendance_adjustments_staff_date_idx
  on public.staff_attendance_adjustments(staff_user_id, attendance_date desc);

alter table public.staff_attendance_import_batches enable row level security;
alter table public.staff_attendance_events enable row level security;
alter table public.staff_attendance_adjustments enable row level security;

-- Admin identity is checked against the caller's own protected profile row.
drop policy if exists "Admins read attendance import batches" on public.staff_attendance_import_batches;
create policy "Admins read attendance import batches"
on public.staff_attendance_import_batches for select to authenticated
using (exists (
  select 1 from public.user_profiles p
  where p.id = (select auth.uid()) and p.role = 'Admin'
));

drop policy if exists "Admins create attendance import batches" on public.staff_attendance_import_batches;
create policy "Admins create attendance import batches"
on public.staff_attendance_import_batches for insert to authenticated
with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'Admin'
  )
);

drop policy if exists "Staff read own attendance events and admins read all" on public.staff_attendance_events;
create policy "Staff read own attendance events and admins read all"
on public.staff_attendance_events for select to authenticated
using (
  staff_user_id = (select auth.uid()) or exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'Admin'
  )
);

drop policy if exists "Admins insert attendance events" on public.staff_attendance_events;
create policy "Admins insert attendance events"
on public.staff_attendance_events for insert to authenticated
with check (
  recorded_by = (select auth.uid()) and exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'Admin'
  )
);

drop policy if exists "Staff read own attendance adjustments and admins read all" on public.staff_attendance_adjustments;
create policy "Staff read own attendance adjustments and admins read all"
on public.staff_attendance_adjustments for select to authenticated
using (
  staff_user_id = (select auth.uid()) or exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'Admin'
  )
);

drop policy if exists "Staff request attendance adjustments for themselves" on public.staff_attendance_adjustments;
create policy "Staff request attendance adjustments for themselves"
on public.staff_attendance_adjustments for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and staff_user_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "Admins review attendance adjustments" on public.staff_attendance_adjustments;
create policy "Admins review attendance adjustments"
on public.staff_attendance_adjustments for update to authenticated
using (exists (
  select 1 from public.user_profiles p
  where p.id = (select auth.uid()) and p.role = 'Admin'
))
with check (
  exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid()) and p.role = 'Admin'
  )
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
);

grant select, insert on public.staff_attendance_import_batches to authenticated;
grant select, insert on public.staff_attendance_events to authenticated;
grant select, insert, update on public.staff_attendance_adjustments to authenticated;

-- Raw attendance events are intentionally append-only for authenticated clients:
-- there are no UPDATE or DELETE grants/policies. Corrections use the adjustment ledger.
