create or replace function private.process_staff_attendance_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now_local timestamp without time zone := now() at time zone 'Africa/Kampala';
  v_local_date date := (now() at time zone 'Africa/Kampala')::date;
  v_deduction_enabled boolean := false;
  v_processed integer := 0;
  r record;
  v_schedule_date date;
  v_schedule_start timestamp without time zone;
  v_schedule_end timestamp without time zone;
  v_first_in timestamptz;
  v_last_out timestamptz;
  v_first_in_local timestamp without time zone;
  v_last_out_local timestamp without time zone;
  v_daily_rate bigint;
  v_incident_type text;
  v_message text;
  v_remaining bigint;
  v_auto_amount bigint;
begin
  select coalesce(s.enabled, false) into v_deduction_enabled
  from public.staff_attendance_deduction_settings s where s.id = true;

  for r in
    select a.staff_user_id, p.full_name, s.start_time, s.end_time, s.grace_minutes, s.weekdays,
      coalesce(sa.daily_rate_ugx, 0)::bigint as daily_rate_ugx,
      case when s.end_time <= s.start_time and v_now_local::time < s.start_time
        then v_local_date - 1 else v_local_date end as schedule_date
    from public.staff_attendance_schedule_assignments a
    join public.staff_work_schedules s on s.id = a.schedule_id and s.is_active
    join public.user_profiles p on p.id = a.staff_user_id
    left join lateral (
      select agreement.daily_rate_ugx
      from public.staff_salary_agreements agreement
      where agreement.staff_user_id = a.staff_user_id and agreement.is_active
        and agreement.effective_from <= case when s.end_time <= s.start_time and v_now_local::time < s.start_time then v_local_date - 1 else v_local_date end
        and (agreement.effective_to is null or agreement.effective_to >= case when s.end_time <= s.start_time and v_now_local::time < s.start_time then v_local_date - 1 else v_local_date end)
      order by agreement.effective_from desc, agreement.created_at desc limit 1
    ) sa on true
    where p.employment_status = 'Active'
      and s.weekdays @> array[extract(dow from (case when s.end_time <= s.start_time and v_now_local::time < s.start_time then v_local_date - 1 else v_local_date end))::smallint]
  loop
    v_schedule_date := r.schedule_date;
    v_schedule_start := v_schedule_date + r.start_time;
    v_schedule_end := v_schedule_date + r.end_time + case when r.end_time <= r.start_time then interval '1 day' else interval '0 day' end;

    select min(e.occurred_at) filter (where e.event_type = 'clock_in'),
           max(e.occurred_at) filter (where e.event_type = 'clock_out')
      into v_first_in, v_last_out
    from public.staff_attendance_events e
    where e.staff_user_id = r.staff_user_id
      and e.occurred_at >= (v_schedule_date::timestamp at time zone 'Africa/Kampala')
      and e.occurred_at < ((v_schedule_date + 2)::timestamp at time zone 'Africa/Kampala');

    v_first_in_local := case when v_first_in is null then null else v_first_in at time zone 'Africa/Kampala' end;
    v_last_out_local := case when v_last_out is null then null else v_last_out at time zone 'Africa/Kampala' end;
    v_daily_rate := greatest(coalesce(r.daily_rate_ugx, 0), 0);

    if v_first_in is null and v_now_local > v_schedule_start + make_interval(mins => r.grace_minutes) then
      v_incident_type := 'missed_clock_in';
      v_message := 'You have not clocked in by your scheduled start time and grace period. Please contact the administrator if this is incorrect.';
    elsif v_first_in is not null and v_first_in_local > v_schedule_start + make_interval(mins => r.grace_minutes) then
      v_incident_type := 'missed_clock_in';
      v_message := 'You clocked in after your scheduled start time and grace period. Please contact the administrator if this is incorrect.';
    else
      v_incident_type := null;
    end if;

    if v_incident_type is not null then
      insert into public.staff_attendance_alerts(staff_user_id,attendance_date,alert_type,message,status)
      values(r.staff_user_id,v_schedule_date,v_incident_type,v_message,'unread')
      on conflict(staff_user_id,attendance_date,alert_type) do update set message=excluded.message;

      select greatest(0,v_daily_rate-coalesce(sum(i.approved_deduction_ugx),0))::bigint into v_remaining
      from public.staff_attendance_incidents i
      where i.staff_user_id=r.staff_user_id and i.attendance_date=v_schedule_date and i.status in ('approved','deducted');
      v_auto_amount := case when v_deduction_enabled and v_daily_rate>0 then least(v_daily_rate,v_remaining) else 0 end;

      insert into public.staff_attendance_incidents(staff_user_id,attendance_date,incident_type,status,proposed_deduction_ugx,approved_deduction_ugx,review_note)
      values(r.staff_user_id,v_schedule_date,v_incident_type,case when v_deduction_enabled and v_daily_rate>0 then 'approved' else 'pending' end,
        v_daily_rate,v_auto_amount,case when v_deduction_enabled and v_daily_rate>0 then 'Automatically approved by the enabled attendance deduction setting.' else null end)
      on conflict(staff_user_id,attendance_date,incident_type) do update set
        proposed_deduction_ugx=excluded.proposed_deduction_ugx,
        status=case when public.staff_attendance_incidents.status='pending' then excluded.status else public.staff_attendance_incidents.status end,
        approved_deduction_ugx=case when public.staff_attendance_incidents.status='pending' then excluded.approved_deduction_ugx else public.staff_attendance_incidents.approved_deduction_ugx end,
        review_note=case when public.staff_attendance_incidents.status='pending' then excluded.review_note else public.staff_attendance_incidents.review_note end;
      v_processed := v_processed+1;
    end if;

    -- A late clock-out is not a missed clock-out. Only create this incident
    -- when no clock-out exists after the scheduled end plus the grace period.
    if v_first_in is not null
       and v_last_out is null
       and v_now_local > v_schedule_end + make_interval(mins => r.grace_minutes) then
      v_incident_type := 'missed_clock_out';
      v_message := 'You have not clocked out by your scheduled end time and grace period. Please contact the administrator if this is incorrect.';

      insert into public.staff_attendance_alerts(staff_user_id,attendance_date,alert_type,message,status)
      values(r.staff_user_id,v_schedule_date,v_incident_type,v_message,'unread')
      on conflict(staff_user_id,attendance_date,alert_type) do update set message=excluded.message;

      select greatest(0,v_daily_rate-coalesce(sum(i.approved_deduction_ugx),0))::bigint into v_remaining
      from public.staff_attendance_incidents i
      where i.staff_user_id=r.staff_user_id and i.attendance_date=v_schedule_date and i.status in ('approved','deducted');
      v_auto_amount := case when v_deduction_enabled and v_daily_rate>0 then least(v_daily_rate,v_remaining) else 0 end;

      insert into public.staff_attendance_incidents(staff_user_id,attendance_date,incident_type,status,proposed_deduction_ugx,approved_deduction_ugx,review_note)
      values(r.staff_user_id,v_schedule_date,v_incident_type,case when v_deduction_enabled and v_daily_rate>0 then 'approved' else 'pending' end,
        v_daily_rate,v_auto_amount,case when v_deduction_enabled and v_daily_rate>0 then 'Automatically approved by the enabled attendance deduction setting.' else null end)
      on conflict(staff_user_id,attendance_date,incident_type) do update set
        proposed_deduction_ugx=excluded.proposed_deduction_ugx,
        status=case when public.staff_attendance_incidents.status='pending' then excluded.status else public.staff_attendance_incidents.status end,
        approved_deduction_ugx=case when public.staff_attendance_incidents.status='pending' then excluded.approved_deduction_ugx else public.staff_attendance_incidents.approved_deduction_ugx end,
        review_note=case when public.staff_attendance_incidents.status='pending' then excluded.review_note else public.staff_attendance_incidents.review_note end;
      v_processed := v_processed+1;
    end if;
  end loop;

  return jsonb_build_object('checked_at',now(),'timezone','Africa/Kampala','incidents_processed',v_processed,'automatic_deductions_enabled',v_deduction_enabled);
end;
$function$;
