-- Consolidate App Centre and bank-account policies; add missing FK indexes.
drop policy if exists "School apps administrator manage" on public.school_apps;
drop policy if exists "Users read assigned school apps" on public.school_apps;
drop policy if exists "School apps role and administrator access" on public.school_apps;
create policy "School apps role and administrator access"
  on public.school_apps
  for all to authenticated
  using (
    (select public.is_school_admin())
    or (
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
    )
  )
  with check ((select public.is_school_admin()));

drop policy if exists "Bank accounts admin manage" on public.school_bank_accounts;
drop policy if exists "Bank accounts finance operator read" on public.school_bank_accounts;
drop policy if exists "Bank accounts role access" on public.school_bank_accounts;
create policy "Bank accounts role access"
  on public.school_bank_accounts
  for all to authenticated
  using (
    (select public.is_school_admin())
    or (select public.is_school_finance_operator())
  )
  with check ((select public.is_school_admin()));

create index if not exists school_apps_created_by_idx
  on public.school_apps(created_by);
create index if not exists school_apps_updated_by_idx
  on public.school_apps(updated_by);
create index if not exists school_bank_accounts_created_by_idx
  on public.school_bank_accounts(created_by);
