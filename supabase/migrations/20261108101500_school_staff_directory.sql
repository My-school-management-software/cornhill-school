create table if not exists public.school_staff_directory (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  phone text,
  gender text check (gender in ('Male','Female','Other','Prefer not to say')),
  staff_category text not null check (staff_category in ('Teaching','Non-teaching')),
  job_title text,
  department text,
  responsibilities text,
  employment_start_date date,
  reporting_date date,
  employment_end_date date,
  employment_status text not null default 'Active' check (employment_status in ('Active','On Leave','Exited')),
  linked_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_staff_directory_active_category_idx on public.school_staff_directory (employment_status, staff_category);
alter table public.school_staff_directory enable row level security;
create policy "Administrators manage school staff directory" on public.school_staff_directory for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());
grant select, insert, update, delete on public.school_staff_directory to authenticated;
