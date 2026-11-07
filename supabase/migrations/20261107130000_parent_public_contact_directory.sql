alter table public.user_profiles
  add column if not exists parent_contact_phone text,
  add column if not exists parent_contact_visible boolean not null default false;

create table if not exists public.school_public_contact_settings (
  id integer primary key default 1 check (id = 1),
  school_phone text,
  school_email text,
  school_website text,
  school_address text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.school_public_contact_settings enable row level security;
revoke all on table public.school_public_contact_settings from anon, authenticated;
insert into public.school_public_contact_settings (id) values (1)
on conflict (id) do nothing;
comment on column public.user_profiles.parent_contact_phone is 'School-approved phone number for display in the authenticated parent contact directory; separate from private staff phone.';
comment on column public.user_profiles.parent_contact_visible is 'Administrator-approved visibility flag for parent contact directory.';
comment on table public.school_public_contact_settings is 'Single-row school contact details displayed only to verified parent portal sessions; values are managed by school administrators.';
