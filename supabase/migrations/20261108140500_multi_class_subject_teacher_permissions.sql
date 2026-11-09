-- CORNHILL: specialist/subject teacher access without full-class privilege.
-- One teacher account may hold subject assignments in multiple classes.

drop trigger if exists class_subjects_enforce_single_teacher_class on public.class_subjects;

create or replace function public.is_class_teacher_for_class(p_class_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
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
            and coalesce(td.employment_status, 'Active') = 'Active'
        )
      )
  );
$function$;

create or replace function public.can_teacher_view_subject(p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
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
    )
  );
$function$;

create or replace function public.can_teacher_access_subject(p_class_id uuid, p_subject_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.user_profiles up
    where up.id = (select auth.uid())
      and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
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
    )
  );
$function$;

create or replace function public.teacher_list_my_assignments()
returns table (
  class_id uuid,
  class_name text,
  stream text,
  is_full_class boolean,
  subject_id uuid,
  subject_name text,
  can_enter_marks boolean,
  can_view_reports boolean,
  can_message_parents boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_profiles up
    where up.id = v_uid and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
  ) then
    raise exception 'An active teacher account is required' using errcode = '42501';
  end if;

  return query
  select distinct c.id, c.name, c.stream, true, null::uuid, null::text, true, true, false
  from public.school_classes c
  where exists (
    select 1 from public.class_teacher_access a
    where a.class_id = c.id and a.user_id = v_uid
  ) or exists (
    select 1
    from public.class_teacher_directory_assignments a
    join public.academic_teacher_directory td on td.id = a.teacher_directory_id
    where a.class_id = c.id and td.linked_user_id = v_uid
      and coalesce(td.employment_status, 'Active') = 'Active'
  )
  union all
  select cs.class_id, c.name, c.stream, false, cs.subject_id, sub.name,
         cs.can_enter_marks, cs.can_view_reports, cs.can_message_parents
  from public.class_subjects cs
  join public.school_classes c on c.id = cs.class_id
  join public.subjects sub on sub.id = cs.subject_id
  left join public.academic_teacher_directory td on td.id = cs.teacher_directory_id
  where (cs.teacher_user_id = v_uid or td.linked_user_id = v_uid)
    and (cs.starts_on is null or cs.starts_on <= current_date)
    and (cs.ends_on is null or cs.ends_on >= current_date)
    and (cs.can_enter_marks or cs.can_view_reports or cs.can_message_parents)
  order by 2, 5;
end;
$function$;

create or replace function public.teacher_subject_learner_roster(p_class_id uuid)
returns table (
  id uuid,
  admission_number text,
  lin text,
  p7_index_number text,
  first_name text,
  middle_name text,
  last_name text,
  gender text,
  birth_year integer,
  date_of_birth date,
  admission_date date,
  class_id uuid,
  learner_type text,
  status text,
  previous_school text,
  created_at timestamptz,
  admission_complete boolean,
  school_classes jsonb
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.user_profiles up
    where up.id = v_uid and up.role = 'Teacher'
      and coalesce(up.employment_status, 'Active') = 'Active'
  ) then
    raise exception 'An active teacher account is required' using errcode = '42501';
  end if;

  if public.is_full_class_teacher_for_class(p_class_id) then
    raise exception 'Use the full class register for this class' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.class_subjects cs
    left join public.academic_teacher_directory td on td.id = cs.teacher_directory_id
    where cs.class_id = p_class_id
      and (cs.teacher_user_id = v_uid or td.linked_user_id = v_uid)
      and (cs.starts_on is null or cs.starts_on <= current_date)
      and (cs.ends_on is null or cs.ends_on >= current_date)
      and (cs.can_enter_marks or cs.can_view_reports)
  ) then
    raise exception 'This class is not assigned to your teaching account' using errcode = '42501';
  end if;

  return query
  select s.id, s.admission_number, s.lin, s.p7_index_number,
         s.first_name, s.middle_name, s.last_name,
         null::text, null::integer, null::date, null::date,
         s.class_id, null::text, s.status, null::text, s.created_at,
         false, jsonb_build_object('name', c.name, 'stream', c.stream)
  from public.students s
  join public.school_classes c on c.id = s.class_id
  where s.class_id = p_class_id and s.status <> 'Archived'
  order by s.last_name, s.first_name, s.id;
end;
$function$;

revoke all on function public.is_class_teacher_for_class(uuid) from public, anon;
revoke all on function public.can_teacher_view_subject(uuid,uuid) from public, anon;
revoke all on function public.can_teacher_access_subject(uuid,uuid) from public, anon;
revoke all on function public.teacher_list_my_assignments() from public, anon;
revoke all on function public.teacher_subject_learner_roster(uuid) from public, anon;
grant execute on function public.is_class_teacher_for_class(uuid) to authenticated;
grant execute on function public.can_teacher_view_subject(uuid,uuid) to authenticated;
grant execute on function public.can_teacher_access_subject(uuid,uuid) to authenticated;
grant execute on function public.teacher_list_my_assignments() to authenticated;
grant execute on function public.teacher_subject_learner_roster(uuid) to authenticated;

drop policy if exists "Admins and assigned teachers read class subjects" on public.class_subjects;
drop policy if exists "Admins and permitted teachers read class subjects" on public.class_subjects;
create policy "Admins and permitted teachers read class subjects"
on public.class_subjects for select to authenticated
using (
  public.is_school_admin()
  or public.is_full_class_teacher_for_class(class_id)
  or (
    (teacher_user_id = (select auth.uid()) or exists (
      select 1 from public.academic_teacher_directory td
      where td.id = class_subjects.teacher_directory_id
        and td.linked_user_id = (select auth.uid())
        and coalesce(td.employment_status,'Active')='Active'
    ))
    and (starts_on is null or starts_on <= current_date)
    and (ends_on is null or ends_on >= current_date)
    and (can_enter_marks or can_view_reports or can_message_parents)
  )
);

create or replace function public.can_teacher_view_assessment(p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment_id
      and public.can_teacher_view_subject(a.class_id, a.subject_id)
  );
$function$;

create or replace function public.can_teacher_access_assessment(p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment_id
      and public.can_teacher_access_subject(a.class_id, a.subject_id)
  );
$function$;

revoke all on function public.can_teacher_view_assessment(uuid) from public, anon;
revoke all on function public.can_teacher_access_assessment(uuid) from public, anon;
grant execute on function public.can_teacher_view_assessment(uuid) to authenticated;
grant execute on function public.can_teacher_access_assessment(uuid) to authenticated;
