create or replace function public.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.role = 'Admin'
      and coalesce(p.employment_status, 'Active') = 'Active'
  );
$function$;

create or replace function public.is_class_teacher_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.class_teacher_access cta
    join public.user_profiles up on up.id = cta.user_id
    where cta.class_id = p_class_id
      and cta.user_id = (select auth.uid())
      and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
  );
$function$;
