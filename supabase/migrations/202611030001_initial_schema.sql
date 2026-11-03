-- Cornhill School Management System: initial database
-- Run this file in Supabase SQL Editor before signing in to the app.
create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'Staff' check (role in ('Admin','Staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stream text not null default '',
  created_at timestamptz not null default now(),
  unique (name, stream)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_number text not null unique,
  first_name text not null,
  last_name text not null,
  gender text not null check (gender in ('Male','Female')),
  date_of_birth date,
  class_id uuid references public.school_classes(id) on delete set null,
  guardian_name text,
  guardian_phone text,
  address text,
  status text not null default 'Active' check (status in ('Active','Inactive','Transferred')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 'Staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.user_profiles enable row level security;
alter table public.school_classes enable row level security;
alter table public.students enable row level security;

-- SECURITY DEFINER avoids recursive RLS evaluation when checking administrator role.
create or replace function public.is_school_admin()
returns boolean language sql stable security definer set search_path = ''
as $
  select exists (
    select 1 from public.user_profiles
    where id = (select auth.uid()) and role = 'Admin'
  );
$;

-- Staff can view their own profile; administrators can view all profiles.
create policy "Users can read own profile or admins can read all"
on public.user_profiles for select to authenticated
using (id = (select auth.uid()) or public.is_school_admin());

-- Staff cannot promote themselves: profile updates are intentionally not granted.
create policy "Authenticated staff can read classes"
on public.school_classes for select to authenticated using (true);
create policy "Authenticated staff can add classes"
on public.school_classes for insert to authenticated with check (true);
create policy "Authenticated staff can update classes"
on public.school_classes for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete classes"
on public.school_classes for delete to authenticated using (true);

create policy "Authenticated staff can read students"
on public.students for select to authenticated using (true);
create policy "Authenticated staff can register students"
on public.students for insert to authenticated with check (true);
create policy "Authenticated staff can update students"
on public.students for update to authenticated using (true) with check (true);
create policy "Authenticated staff can delete students"
on public.students for delete to authenticated using (true);

grant usage on schema public to authenticated;
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.school_classes, public.students to authenticated;

-- After creating the first staff account in Supabase Authentication,
-- promote that account once from the SQL Editor using its exact email:
-- update public.user_profiles
-- set role = 'Admin', full_name = 'School Administrator'
-- where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
