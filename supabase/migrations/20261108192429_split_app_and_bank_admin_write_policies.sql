-- Separate administrator write permissions from read permissions to avoid broad ALL-policy behavior.

drop policy if exists "School apps administrators manage" on public.school_apps;
drop policy if exists "School apps administrators insert" on public.school_apps;
drop policy if exists "School apps administrators update" on public.school_apps;
drop policy if exists "School apps administrators delete" on public.school_apps;

create policy "School apps administrators insert"
  on public.school_apps
  for insert to authenticated
  with check ((select public.is_school_admin()));

create policy "School apps administrators update"
  on public.school_apps
  for update to authenticated
  using ((select public.is_school_admin()))
  with check ((select public.is_school_admin()));

create policy "School apps administrators delete"
  on public.school_apps
  for delete to authenticated
  using ((select public.is_school_admin()));

drop policy if exists "Bank accounts administrators manage" on public.school_bank_accounts;
drop policy if exists "Bank accounts administrators insert" on public.school_bank_accounts;
drop policy if exists "Bank accounts administrators update" on public.school_bank_accounts;
drop policy if exists "Bank accounts administrators delete" on public.school_bank_accounts;

create policy "Bank accounts administrators insert"
  on public.school_bank_accounts
  for insert to authenticated
  with check ((select public.is_school_admin()));

create policy "Bank accounts administrators update"
  on public.school_bank_accounts
  for update to authenticated
  using ((select public.is_school_admin()))
  with check ((select public.is_school_admin()));

create policy "Bank accounts administrators delete"
  on public.school_bank_accounts
  for delete to authenticated
  using ((select public.is_school_admin()));
