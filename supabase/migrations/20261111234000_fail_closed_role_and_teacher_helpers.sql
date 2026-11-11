-- Apply the fail-closed active-session guard consistently to core role helpers.
-- SECURITY DEFINER is retained only on helpers that already had it.

create or replace function public.is_school_admin()
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'Admin'
    );
$function$;

create or replace function public.is_school_finance_operator()
returns boolean language sql stable set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid())
        and (
          p.role = 'Admin'
          or (p.role = 'Staff' and lower(btrim(coalesce(p.job_title,''))) in
            ('bursar','school bursar','main bursar','deputy bursar','deputy school bursar'))
        )
    );
$function$;

create or replace function public.is_school_dos()
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid())
        and p.role = 'Staff'
        and lower(btrim(coalesce(p.job_title,''))) in
          ('director of studies','director of studies (dos)','dos')
    );
$function$;

create or replace function public.is_school_headteacher()
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid())
        and p.role = 'Staff'
        and lower(btrim(coalesce(p.job_title,''))) in ('headteacher','head teacher')
    );
$function$;

create or replace function public.is_class_teacher_for_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1
      from public.user_profiles up
      where up.id = (select auth.uid())
        and up.role = 'Teacher'
        and (
          exists (
            select 1 from public.class_teacher_access cta
            where cta.class_id = p_class_id and cta.user_id = (select auth.uid())
          )
          or exists (
            select 1
            from public.class_teacher_directory_assignments ctda
            join public.academic_teacher_directory td on td.id = ctda.teacher_directory_id
            where ctda.class_id = p_class_id
              and td.linked_user_id = (select auth.uid())
              and td.employment_status = 'Active'
          )
        )
    );
$function$;

create or replace function public.is_full_class_teacher_for_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1
      from public.user_profiles up
      where up.id = (select auth.uid())
        and up.role = 'Teacher'
        and (
          exists (
            select 1 from public.class_teacher_access cta
            where cta.class_id = p_class_id and cta.user_id = (select auth.uid())
          )
          or exists (
            select 1
            from public.class_teacher_directory_assignments ctda
            join public.academic_teacher_directory td on td.id = ctda.teacher_directory_id
            where ctda.class_id = p_class_id
              and td.linked_user_id = (select auth.uid())
              and td.employment_status = 'Active'
          )
        )
    );
$function$;

create or replace function public.can_teacher_access_subject(p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid())
        and (up.role = 'Teacher' or (up.role = 'Staff' and up.staff_category = 'Teaching'))
    )
    and (
      public.is_full_class_teacher_for_class(p_class_id)
      or exists (
        select 1
        from public.class_subjects cs
        left join public.academic_teacher_directory td on td.id = cs.teacher_directory_id
        where cs.class_id = p_class_id
          and cs.subject_id = p_subject_id
          and (cs.teacher_user_id = (select auth.uid()) or td.linked_user_id = (select auth.uid()))
          and (cs.starts_on is null or cs.starts_on <= current_date)
          and (cs.ends_on is null or cs.ends_on >= current_date)
          and cs.can_enter_marks
          and (td.id is null or td.employment_status = 'Active')
      )
    );
$function$;

create or replace function public.can_teacher_view_subject(p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $function$
  select public.is_active_staff_session()
    and exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid())
        and (up.role = 'Teacher' or (up.role = 'Staff' and up.staff_category = 'Teaching'))
    )
    and (
      public.is_full_class_teacher_for_class(p_class_id)
      or exists (
        select 1
        from public.class_subjects cs
        left join public.academic_teacher_directory td on td.id = cs.teacher_directory_id
        where cs.class_id = p_class_id
          and cs.subject_id = p_subject_id
          and (cs.teacher_user_id = (select auth.uid()) or td.linked_user_id = (select auth.uid()))
          and (cs.starts_on is null or cs.starts_on <= current_date)
          and (cs.ends_on is null or cs.ends_on >= current_date)
          and (cs.can_view_reports or cs.can_enter_marks)
          and (td.id is null or td.employment_status = 'Active')
      )
    );
$function$;

create or replace function public.list_staff_directory()
returns table(id uuid, full_name text, role text)
language sql stable security definer set search_path to ''
as $function$
  select p.id, coalesce(p.full_name,'Staff member'), p.role
  from public.user_profiles p
  where public.is_active_staff_session()
    and p.id <> (select auth.uid())
    and p.employment_status = 'Active'
  order by p.full_name nulls last;
$function$;

comment on function public.is_school_admin() is 'Active Director role check; requires explicit Active employment status.';
comment on function public.is_school_finance_operator() is 'Active Director or authorised Bursar role check; requires explicit Active employment status.';
comment on function public.is_class_teacher_for_class(uuid) is 'Class teacher assignment check; requires an explicit Active staff profile and active teacher directory assignment.';
