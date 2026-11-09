-- Staff profile and HR foundation. Sensitive identity documents are intentionally excluded.
alter table public.user_profiles
  add column if not exists phone text,
  add column if not exists job_title text,
  add column if not exists department text,
  add column if not exists responsibilities text,
  add column if not exists employment_start_date date,
  add column if not exists reporting_date date,
  add column if not exists employment_end_date date,
  add column if not exists employment_status text not null default 'Active';

alter table public.user_profiles
  drop constraint if exists user_profiles_employment_status_check;
alter table public.user_profiles
  add constraint user_profiles_employment_status_check
  check (employment_status in ('Active','On Leave','Exited'));

create index if not exists user_profiles_employment_status_idx
  on public.user_profiles (employment_status);
create index if not exists user_profiles_department_idx
  on public.user_profiles (department);

grant update on public.user_profiles to authenticated;
drop policy if exists "Administrators can update staff profiles" on public.user_profiles;
create policy "Administrators can update staff profiles"
on public.user_profiles for update to authenticated
using (public.is_school_admin())
with check (public.is_school_admin());
