-- CORNHILL School Management System V3 foundation
-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'teacher' check (role in ('admin','teacher','bursar')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''), 'teacher')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = ''
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  stream text not null default '',
  teacher_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_number text not null unique,
  first_name text not null,
  last_name text not null,
  gender text not null check (gender in ('Male','Female')),
  date_of_birth date,
  class_id uuid references public.school_classes(id) on delete set null,
  guardian_name text not null default '',
  guardian_phone text not null default '',
  address text not null default '',
  status text not null default 'Active' check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_class_id_idx on public.students(class_id);
create index if not exists students_name_idx on public.students(last_name, first_name);

alter table public.user_profiles enable row level security;
alter table public.school_classes enable row level security;
alter table public.students enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile" on public.user_profiles
for select to authenticated using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Admins manage profiles" on public.user_profiles;
create policy "Admins manage profiles" on public.user_profiles
for update to authenticated using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Signed-in staff can read classes" on public.school_classes;
create policy "Signed-in staff can read classes" on public.school_classes
for select to authenticated using (true);
drop policy if exists "Admins and teachers manage classes" on public.school_classes;
create policy "Admins and teachers manage classes" on public.school_classes
for all to authenticated using (public.current_user_role() in ('admin','teacher'))
with check (public.current_user_role() in ('admin','teacher'));

drop policy if exists "Signed-in staff can read students" on public.students;
create policy "Signed-in staff can read students" on public.students
for select to authenticated using (true);
drop policy if exists "Admins and teachers manage students" on public.students;
create policy "Admins and teachers manage students" on public.students
for all to authenticated using (public.current_user_role() in ('admin','teacher'))
with check (public.current_user_role() in ('admin','teacher'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.school_classes, public.students to authenticated;
grant select, update on public.user_profiles to authenticated;

insert into public.school_classes (name, stream)
values ('Baby Class',''),('Middle Class',''),('Top Class',''),
       ('Primary 1',''),('Primary 2',''),('Primary 3',''),('Primary 4',''),
       ('Primary 5',''),('Primary 6',''),('Primary 7','')
on conflict (name) do nothing;
