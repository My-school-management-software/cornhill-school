-- Finalise kiosk event sequencing and reject invalid/inactive staff targets.
create or replace function public.director_record_staff_attendance_event(
  p_staff_user_id uuid,
  p_event_type text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_now timestamptz := now();
  v_local_date date := (now() at time zone 'Africa/Kampala')::date;
  v_start timestamptz;
  v_end timestamptz;
  v_last_event text;
  v_event_id uuid;
begin
  if not public.is_school_director() then
    raise exception 'Only the Director can record attendance from the central office kiosk.'
      using errcode = '42501';
  end if;
  if p_staff_user_id is null then raise exception 'Select a staff member.'; end if;
  if p_event_type is null or p_event_type not in ('clock_in','break_start','break_end','clock_out') then
    raise exception 'Choose clock-in, break-start, break-end or clock-out.';
  end if;

  perform 1 from public.user_profiles p
  where p.id = p_staff_user_id and p.employment_status = 'Active'
  for update;
  if not found then raise exception 'The selected staff account is not active.'; end if;

  v_start := v_local_date::timestamp at time zone 'Africa/Kampala';
  v_end := (v_local_date + 1)::timestamp at time zone 'Africa/Kampala';

  select e.event_type into v_last_event
  from public.staff_attendance_events e
  where e.staff_user_id = p_staff_user_id
    and e.occurred_at >= v_start and e.occurred_at < v_end
  order by e.occurred_at desc, e.created_at desc
  limit 1
  for update;

  if v_last_event is null then
    if p_event_type <> 'clock_in' then raise exception 'Record clock-in first.'; end if;
  elsif v_last_event = 'clock_out' then
    raise exception 'Attendance is already closed for this staff member today.';
  elsif p_event_type = 'clock_in' then
    raise exception 'Clock-in has already been recorded for this staff member today.';
  elsif p_event_type = 'break_start' and v_last_event not in ('clock_in','break_end') then
    raise exception 'A break can start only after clock-in or after the previous break has ended.';
  elsif p_event_type = 'break_end' and v_last_event <> 'break_start' then
    raise exception 'There is no open break to end.';
  elsif p_event_type = 'clock_out' and v_last_event = 'break_start' then
    raise exception 'End the open break before clocking out.';
  elsif p_event_type = 'clock_out' and v_last_event not in ('clock_in','break_end') then
    raise exception 'Record clock-in before clocking out.';
  end if;

  insert into public.staff_attendance_events(
    staff_user_id,event_type,occurred_at,source,device_model,device_serial,recorded_by,dedupe_key
  ) values (
    p_staff_user_id,p_event_type,v_now,'manual',
    'Director-controlled office kiosk','CORNHILL-DIRECTOR-KIOSK',(select auth.uid()),
    'director-kiosk:'||p_staff_user_id::text||':'||p_event_type||':'||gen_random_uuid()::text
  ) returning id into v_event_id;

  return jsonb_build_object('ok',true,'event_id',v_event_id,'staff_user_id',p_staff_user_id,
    'event_type',p_event_type,'occurred_at',v_now,'recorded_by',(select auth.uid()),
    'source','director_kiosk');
end;
$function$;

create or replace function public.director_record_staff_session_event(
  p_session_id uuid,
  p_staff_user_id uuid,
  p_event_type text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_row public.staff_scheduled_session_attendance%rowtype;
  v_now timestamptz := now();
begin
  if not public.is_school_director() then
    raise exception 'Only the Director can record special-session attendance from the central kiosk.'
      using errcode = '42501';
  end if;
  if p_session_id is null or p_staff_user_id is null then
    raise exception 'Choose an approved session and an assigned staff member.';
  end if;
  if p_event_type is null or p_event_type not in ('clock_in','clock_out') then
    raise exception 'Special sessions accept clock-in or clock-out only.';
  end if;
  if not exists (
    select 1 from public.staff_prep_sessions s
    where s.id = p_session_id and s.approval_status = 'approved' and s.is_published = true
  ) then
    raise exception 'This special session has not been approved and published by the Director.';
  end if;

  perform 1 from public.user_profiles p
  where p.id = p_staff_user_id and p.employment_status = 'Active'
  for update;
  if not found then raise exception 'The selected staff account is not active.'; end if;

  select a.* into v_row
  from public.staff_scheduled_session_attendance a
  where a.session_id = p_session_id and a.staff_user_id = p_staff_user_id
  for update;
  if not found then raise exception 'The selected staff member is not assigned to this special session.'; end if;

  if p_event_type = 'clock_in' then
    if v_row.clock_in_at is not null then raise exception 'Clock-in is already recorded for this special session.'; end if;
    update public.staff_scheduled_session_attendance
    set clock_in_at=v_now,clock_in_source='director_kiosk',updated_at=v_now
    where id=v_row.id;
  else
    if v_row.clock_in_at is null then raise exception 'Record clock-in before clocking out.'; end if;
    if v_row.clock_out_at is not null then raise exception 'Clock-out is already recorded for this special session.'; end if;
    update public.staff_scheduled_session_attendance
    set clock_out_at=v_now,clock_out_source='director_kiosk',updated_at=v_now
    where id=v_row.id;
  end if;

  return jsonb_build_object('ok',true,'session_id',p_session_id,'staff_user_id',p_staff_user_id,
    'event',p_event_type,'recorded_at',v_now,'source','director_kiosk');
end;
$function$;

revoke all on function public.director_record_staff_attendance_event(uuid,text) from public,anon;
grant execute on function public.director_record_staff_attendance_event(uuid,text) to authenticated;
revoke all on function public.director_record_staff_session_event(uuid,uuid,text) from public,anon;
grant execute on function public.director_record_staff_session_event(uuid,uuid,text) to authenticated;
