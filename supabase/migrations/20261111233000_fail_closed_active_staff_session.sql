-- Fail closed when a profile has no explicit employment status.
-- The production directory currently has explicit Active statuses for all
-- 11 existing accounts; a future NULL must not inherit access accidentally.
create or replace function public.is_active_staff_session()
returns boolean
language sql
stable
set search_path to ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_profiles p
      where p.id = (select auth.uid())
        and nullif(btrim(p.role), '') is not null
        and p.employment_status = 'Active'
    );
$function$;

comment on function public.is_active_staff_session() is
  'Returns true only for a signed-in profile with an explicit Active employment status. Missing or NULL status fails closed.';
