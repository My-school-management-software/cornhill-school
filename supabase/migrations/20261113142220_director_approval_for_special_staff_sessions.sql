-- Director approval/publishing for evening prep, morning winter and Saturday study.
-- Approval creates one attendance row for each assigned staff member.
create or replace function public.director_approve_staff_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if not public.is_school_director() then
    raise exception 'Only the Director can approve scheduled prep, winter or Saturday study sessions.'
      using errcode = '42501';
  end if;
  if p_session_id is null then
    raise exception 'Choose a special session to approve.';
  end if;

  update public.staff_prep_sessions
  set approval_status='approved',
      is_published=true,
      director_approved_at=now(),
      director_approved_by=(select auth.uid())
  where id=p_session_id and approval_status='draft';
  get diagnostics v_count=row_count;
  if v_count=0 then
    raise exception 'Session not found or it is not a draft.';
  end if;

  insert into public.staff_scheduled_session_attendance(session_id,staff_user_id)
  select p_session_id,a.staff_user_id
  from public.staff_prep_assignments a
  join public.user_profiles p on p.id=a.staff_user_id
  where a.prep_session_id=p_session_id
    and p.employment_status='Active'
  on conflict(session_id,staff_user_id) do nothing;

  return jsonb_build_object(
    'ok',true,
    'session_id',p_session_id,
    'assigned_staff_count',(
      select count(*)
      from public.staff_scheduled_session_attendance
      where session_id=p_session_id
    )
  );
end;
$function$;

revoke all on function public.director_approve_staff_session(uuid) from public,anon;
grant execute on function public.director_approve_staff_session(uuid) to authenticated;
