create or replace function public.is_active_staff_session()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_profiles p
      where p.id = (select auth.uid())
        and nullif(btrim(p.role), '') is not null
        and coalesce(p.employment_status, 'Active') = 'Active'
    );
$function$;

revoke all on function public.is_active_staff_session() from public;
revoke all on function public.is_active_staff_session() from anon;
grant execute on function public.is_active_staff_session() to authenticated;

comment on function public.is_active_staff_session() is
  'True only for a signed-in user with an active staff profile; used to prevent inactive accounts from accessing staff collaboration data.';
