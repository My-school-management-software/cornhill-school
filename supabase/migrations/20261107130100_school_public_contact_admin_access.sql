grant select, insert, update on public.school_public_contact_settings to authenticated;
drop policy if exists school_public_contact_admin_read on public.school_public_contact_settings;
drop policy if exists school_public_contact_admin_write on public.school_public_contact_settings;
create policy school_public_contact_admin_read
on public.school_public_contact_settings
for select to authenticated
using (exists (select 1 from public.user_profiles p where p.id = (select auth.uid()) and p.role = 'Admin' and p.employment_status = 'Active'));
create policy school_public_contact_admin_write
on public.school_public_contact_settings
for all to authenticated
using (exists (select 1 from public.user_profiles p where p.id = (select auth.uid()) and p.role = 'Admin' and p.employment_status = 'Active'))
with check (exists (select 1 from public.user_profiles p where p.id = (select auth.uid()) and p.role = 'Admin' and p.employment_status = 'Active'));
