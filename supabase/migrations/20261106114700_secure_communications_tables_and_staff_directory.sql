-- Allow only authenticated school administrators to manage message templates.
drop policy if exists communication_templates_admin_select on public.communication_templates;
drop policy if exists communication_templates_admin_insert on public.communication_templates;
drop policy if exists communication_templates_admin_update on public.communication_templates;
drop policy if exists communication_templates_admin_delete on public.communication_templates;
create policy communication_templates_admin_select
 on public.communication_templates for select to authenticated
 using (public.is_school_admin());
create policy communication_templates_admin_insert
 on public.communication_templates for insert to authenticated
 with check (public.is_school_admin());
create policy communication_templates_admin_update
 on public.communication_templates for update to authenticated
 using (public.is_school_admin()) with check (public.is_school_admin());
create policy communication_templates_admin_delete
 on public.communication_templates for delete to authenticated
 using (public.is_school_admin());

-- Outbox contains guardian/staff phone numbers and message contents; keep it admin-only.
drop policy if exists communication_outbox_admin_select on public.communication_outbox;
create policy communication_outbox_admin_select
 on public.communication_outbox for select to authenticated
 using (public.is_school_admin());

-- Staff directory access requires a real, active staff profile. A verified parent
-- portal phone session without a staff profile must not enumerate staff identities.
create or replace function public.list_staff_directory()
returns table(id uuid, full_name text, role text)
language sql
stable
security definer
set search_path to ''
as $function$
  select p.id, coalesce(p.full_name,'Staff member'), p.role
  from public.user_profiles p
  where auth.uid() is not null
    and exists (
      select 1
      from public.user_profiles caller
      where caller.id = auth.uid()
        and nullif(btrim(caller.role),'') is not null
        and coalesce(caller.employment_status,'Active')
          not in ('Exited','Inactive','Terminated','Suspended')
    )
    and p.id <> auth.uid()
    and coalesce(p.employment_status,'Active')
      not in ('Exited','Inactive','Terminated','Suspended')
  order by p.full_name nulls last;
$function$;
