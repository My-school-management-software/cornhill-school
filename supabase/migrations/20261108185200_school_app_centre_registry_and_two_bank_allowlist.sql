-- CORNHILL App Centre registry with role and optional job-title visibility.
-- Restricts bank institution names to the two school-approved institutions.
create table if not exists public.school_apps (
  id uuid primary key default gen_random_uuid(),
  app_key text not null unique
    check (app_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null
    check (length(btrim(name)) between 2 and 100),
  description text not null default ''
    check (length(description) <= 500),
  category text not null
    check (category in ('School','Parent Access','Finance','Communication','Learning','External Service')),
  icon text not null default '📱'
    check (length(icon) <= 16),
  app_url text not null,
  app_kind text not null
    check (app_kind in ('Internal','External')),
  allowed_roles text[] not null default array['Admin']::text[]
    check (
      cardinality(allowed_roles) between 1 and 3
      and allowed_roles <@ array['Admin','Teacher','Staff']::text[]
    ),
  allowed_job_titles text[] not null default '{}'::text[]
    check (cardinality(allowed_job_titles) <= 20),
  sort_order integer not null default 100
    check (sort_order between 0 and 9999),
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_apps_url_kind_check check (
    (app_kind = 'Internal' and left(app_url, 1) = '/' and left(app_url, 2) <> '//')
    or
    (app_kind = 'External' and app_url ~ '^https://[^[:space:]]+$')
  )
);

comment on table public.school_apps is
  'Administrator-managed App Centre directory. Visibility is restricted by active user role and optional job-title allowlist. Each application authenticates separately.';

create index if not exists school_apps_visibility_order_idx
  on public.school_apps(is_active, sort_order, name);

alter table public.school_apps enable row level security;
revoke all privileges on table public.school_apps from public, anon;
grant select, insert, update on table public.school_apps to authenticated;

drop policy if exists "School apps administrator manage" on public.school_apps;
create policy "School apps administrator manage"
  on public.school_apps
  for all to authenticated
  using ((select public.is_school_admin()))
  with check ((select public.is_school_admin()));

drop policy if exists "Users read assigned school apps" on public.school_apps;
create policy "Users read assigned school apps"
  on public.school_apps
  for select to authenticated
  using (
    is_active
    and exists (
      select 1
      from public.user_profiles p
      where p.id = (select auth.uid())
        and p.employment_status = 'Active'
        and p.role = any(public.school_apps.allowed_roles)
        and (
          cardinality(public.school_apps.allowed_job_titles) = 0
          or lower(btrim(coalesce(p.job_title, ''))) = any(public.school_apps.allowed_job_titles)
        )
    )
  );

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_bank_accounts_cornhill_institution_check'
      and conrelid = 'public.school_bank_accounts'::regclass
  ) then
    alter table public.school_bank_accounts
      add constraint school_bank_accounts_cornhill_institution_check
      check (bank_name in ('KYAMUHUNGA JUBILEE SACCO', 'KYAPS'));
  end if;
end
$migration$;

insert into public.school_apps
  (app_key, name, description, category, icon, app_url, app_kind,
   allowed_roles, allowed_job_titles, sort_order, is_active)
values
  ('main-school-system','School Management System',
   'Core CORNHILL school management workspace. Existing role and class permissions remain in force.',
   'School','🏫','/','Internal',
   array['Admin','Teacher','Staff']::text[],'{}'::text[],10,true),
  ('parents-portal','Parents Portal',
   'Separate guardian sign-in for parent access. This link does not grant access to school administration.',
   'Parent Access','👨‍👩‍👧','/parents.html','Internal',
   array['Admin']::text[],'{}'::text[],20,true),
  ('banking-daily-deposits','Banking & Daily Deposits',
   'Restricted banking register for administrators and authorised bursary staff.',
   'Finance','🏦','/banking.html','Internal',
   array['Admin','Staff']::text[],
   array['bursar','school bursar','deputy bursar','deputy school bursar']::text[],30,true),
  ('evidence-capture','Evidence Capture',
   'Phone evidence capture and administrator review workflow.',
   'Finance','📷','/evidence.html','Internal',
   array['Admin','Teacher','Staff']::text[],'{}'::text[],40,true)
on conflict (app_key) do nothing;
