create or replace function public.is_school_finance_operator()
returns boolean
language sql
stable
set search_path to ''
as $function$
 select exists(
  select 1
  from public.user_profiles p
  where p.id=(select auth.uid())
   and coalesce(p.employment_status,'Active')='Active'
   and (
    p.role='Admin'
    or (p.role='Staff' and lower(btrim(coalesce(p.job_title,''))) in
      ('bursar','school bursar','main bursar','deputy bursar','deputy school bursar'))
   )
 );
$function$;