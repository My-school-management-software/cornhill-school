-- Keep App Centre and bank-account reads separate from administrator writes.
-- In permissive RLS, an ALL policy with a broad USING clause also permits DELETE.
-- These policies ensure only administrators can insert, update, or delete either registry.

drop policy if exists "School apps role and administrator access" on public.school_apps;
drop policy if exists "School apps assigned users read" on public.school_apps;
drop policy if exists "School apps administrators manage" on public.school_apps;

create policy "School apps assigned users read"
  on public.school_apps
  for select to authenticated
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
  );

create policy "School apps administrators manage"
  on public.school_apps
  for all to authenticated
  using ((select public.is_school_admin()))
  with check ((select public.is_school_admin()));

drop policy if exists "Bank accounts role access" on public.school_bank_accounts;
drop policy if exists "Bank accounts finance operators read" on public.school_bank_accounts;
drop policy if exists "Bank accounts administrators manage" on public.school_bank_accounts;

create policy "Bank accounts finance operators read"
  on public.school_bank_accounts
  for select to authenticated
  using (
    (select public.is_school_admin())
    or (select public.is_school_finance_operator())
  );

create policy "Bank accounts administrators manage"
  on public.school_bank_accounts
  for all to authenticated
  using ((select public.is_school_admin()))
  with check ((select public.is_school_admin()));
