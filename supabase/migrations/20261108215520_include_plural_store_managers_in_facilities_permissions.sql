
drop policy if exists "Administrators and asset managers read assets" on public.school_assets;
create policy "Administrators and asset managers read assets"
on public.school_assets for select to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p
 where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
));
drop policy if exists "Administrators and store managers insert assets" on public.school_assets;
create policy "Administrators and store managers insert assets"
on public.school_assets for insert to authenticated
with check (created_by=(select auth.uid()) and ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager')
)));
drop policy if exists "Administrators and store managers update assets" on public.school_assets;
create policy "Administrators and store managers update assets"
on public.school_assets for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager')
))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager')
));
drop policy if exists "Staff read own maintenance reports and managers read all" on public.school_asset_maintenance;
create policy "Staff read own maintenance reports and managers read all"
on public.school_asset_maintenance for select to authenticated
using (
 reported_by=(select auth.uid()) or (select public.is_school_admin())
 or exists (
  select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
  and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
 )
);
drop policy if exists "Administrators and asset managers update maintenance" on public.school_asset_maintenance;
create policy "Administrators and asset managers update maintenance"
on public.school_asset_maintenance for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('store manager','store managers','store officer','stores manager','property officer','maintenance officer','ict support','ict officer')
));
