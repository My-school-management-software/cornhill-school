-- CORNHILL automatic attendance deduction workflow.
-- The Director controls the master switch. The background processor runs independently
-- of the Director's daily presence. General no-clock-in days are escalated, never auto-deducted.

alter table public.staff_attendance_policy_settings
  add column if not exists automatic_deductions_enabled boolean not null default false;

comment on column public.staff_attendance_policy_settings.automatic_deductions_enabled is
  'Director-controlled master switch for automatic missed-clock-in deductions after the two-hour review window.';

create or replace function private.finalize_staff_attendance_auto_deductions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Africa/Kampala')::date;
  v_enabled boolean := false;
  v_scheduled_count integer := 0;
  v_clocked_count integer := 0;
  v_incident record;
  v_daily_rate bigint;
  v_already_approved bigint;
  v_deduction bigint;
  v_count integer := 0;
  v_leader uuid;
begin
  select coalesce(s.automatic_deductions_enabled,false)
    into v_enabled
  from public.staff_attendance_policy_settings s
  where s.id=true;

  if not coalesce(v_enabled,false) then
    return jsonb_build_object('automatic_deductions_enabled',false,'deductions_processed',0);
  end if;

  -- A school-wide no-clock-in day is not evidence of individual absence.
  -- Count the active staff roster scheduled to work today, respecting Sundays,
  -- Saturday eligibility, weekdays and published calendar closures.
  if extract(dow from v_today)=0 or exists (
    select 1 from public.staff_attendance_calendar_exceptions ce
    where ce.attendance_date=v_today and ce.is_working_day=false
  ) then
    return jsonb_build_object('automatic_deductions_enabled',true,'school_wide_review',false,
      'deductions_processed',0,'reason','non_working_day');
  end if;

  select count(distinct a.staff_user_id)
    into v_scheduled_count
  from public.staff_attendance_schedule_assignments a
  join public.staff_work_schedules s on s.id=a.schedule_id and s.is_active
  join public.user_profiles p on p.id=a.staff_user_id and p.employment_status='Active'
  where (
    (extract(dow from v_today)=6 and a.saturday_required)
    or
    (extract(dow from v_today) between 1 and 5
      and s.weekdays @> array[extract(dow from v_today)::smallint])
  );

  select count(distinct e.staff_user_id)
    into v_clocked_count
  from public.staff_attendance_events e
  join public.staff_attendance_schedule_assignments a on a.staff_user_id=e.staff_user_id
  join public.staff_work_schedules s on s.id=a.schedule_id and s.is_active
  join public.user_profiles p on p.id=e.staff_user_id and p.employment_status='Active'
  where e.event_type='clock_in'
    and e.occurred_at >= (v_today::timestamp at time zone 'Africa/Kampala')
    and e.occurred_at < ((v_today+1)::timestamp at time zone 'Africa/Kampala')
    and (
      (extract(dow from v_today)=6 and a.saturday_required)
      or (extract(dow from v_today) between 1 and 5
        and s.weekdays @> array[extract(dow from v_today)::smallint])
    );

  if v_scheduled_count>0 and v_clocked_count=0 then
    for v_leader in
      select p.id
      from public.user_profiles p
      left join public.school_staff_directory d on d.linked_user_id=p.id
      where p.employment_status='Active'
        and upper(trim(coalesce(d.job_title,p.job_title,''))) in
          ('DIRECTOR','HEADTEACHER','HEAD TEACHER','DEPUTY HEADTEACHER',
           'DEPUTY HEAD TEACHER','DOS','DIRECTOR OF STUDIES')
    loop
      insert into public.school_notifications
        (category,severity,title,message,recipient_user_id,action_workspace,
         source_key,is_actionable,action_payload)
      values
        ('attendance','urgent','School-wide attendance review required',
         'No scheduled staff member has clocked in today. This may be a school-wide closure or disruption. Automatic deductions are suspended for this date; please record the reason and Director decision.',
         v_leader,'attendance',
         'attendance:schoolwide-no-clockin:'||v_today::text||':'||v_leader::text,
         true,jsonb_build_object('attendance_date',v_today,'scheduled_staff_count',v_scheduled_count))
      on conflict (source_key) do nothing;
    end loop;

    return jsonb_build_object('automatic_deductions_enabled',true,'school_wide_review',true,
      'scheduled_staff_count',v_scheduled_count,'clocked_in_staff_count',v_clocked_count,
      'deductions_processed',0);
  end if;

  -- Only missed clock-ins are eligible for this automatic rule. A Headteacher/DOS
  -- statement within the review window protects the case from automatic deduction
  -- and leaves it for the Director's decision.
  for v_incident in
    select i.id,i.staff_user_id,i.attendance_date
    from public.staff_attendance_incidents i
    where i.attendance_date=v_today
      and i.incident_type='missed_clock_in'
      and i.status='pending'
      and i.director_decision is null
      and i.review_deadline_at is not null
      and i.review_deadline_at<=now()
      and nullif(btrim(i.headteacher_statement),'') is null
    for update
  loop
    select coalesce(a.daily_rate_ugx,case
      when a.salary_basis='Monthly' then round(a.base_salary_ugx::numeric /
        extract(day from (date_trunc('month',v_incident.attendance_date::timestamp)
          + interval '1 month - 1 day')))::bigint
      when a.salary_basis='Yearly' then round(a.base_salary_ugx::numeric /
        extract(day from (date_trunc('year',v_incident.attendance_date::timestamp)
          + interval '1 year - 1 day')))::bigint
      else null end)::bigint
    into v_daily_rate
    from public.staff_salary_agreements a
    where a.staff_user_id=v_incident.staff_user_id
      and a.is_active
      and a.effective_from<=v_incident.attendance_date
      and (a.effective_to is null or a.effective_to>=v_incident.attendance_date)
    order by a.effective_from desc,a.created_at desc
    limit 1;

    if coalesce(v_daily_rate,0)<=0 then
      continue;
    end if;

    select coalesce(sum(i.approved_deduction_ugx),0)::bigint
      into v_already_approved
    from public.staff_attendance_incidents i
    where i.staff_user_id=v_incident.staff_user_id
      and i.attendance_date=v_incident.attendance_date
      and i.id<>v_incident.id
      and i.status in ('approved','deducted');

    v_deduction:=greatest(0,v_daily_rate-v_already_approved);
    if v_deduction<=0 then
      continue;
    end if;

    update public.staff_attendance_incidents
    set status='approved',
        approved_deduction_ugx=v_deduction,
        director_decision='deduct',
        director_decision_by=null,
        director_decision_at=now(),
        reviewed_at=now(),
        review_note='Automatically applied under the Director-enabled attendance policy after the two-hour review window; no Headteacher/DOS statement was submitted.'
    where id=v_incident.id
      and status='pending'
      and director_decision is null
      and nullif(btrim(headteacher_statement),'') is null;

    if found then
      insert into public.school_notifications
        (category,severity,title,message,recipient_user_id,action_workspace,
         source_key,source_id,is_actionable,action_payload)
      values
        ('attendance','warning','Attendance deduction recorded',
         'For '||v_incident.attendance_date::text||
         ', no clock-in or Headteacher/DOS explanation was recorded within the two-hour review window. An attendance deduction of UGX '||
         to_char(v_deduction,'FM999,999,999,999')||
         ' has been recorded for the next payroll run. Review your attendance account for details.',
         v_incident.staff_user_id,'attendance',
         'attendance:auto-deduction:'||v_incident.id::text||':staff',
         v_incident.id,true,jsonb_build_object('incident_id',v_incident.id,
           'attendance_date',v_incident.attendance_date,'deduction_ugx',v_deduction))
      on conflict (source_key) do nothing;

      for v_leader in
        select p.id
        from public.user_profiles p
        left join public.school_staff_directory d on d.linked_user_id=p.id
        where p.employment_status='Active'
          and upper(trim(coalesce(d.job_title,p.job_title,''))) in
            ('DIRECTOR','HEADTEACHER','HEAD TEACHER','DEPUTY HEADTEACHER',
             'DEPUTY HEAD TEACHER','DOS','DIRECTOR OF STUDIES')
      loop
        insert into public.school_notifications
          (category,severity,title,message,recipient_user_id,action_workspace,
           source_key,source_id,is_actionable,action_payload)
        values
          ('attendance','warning','Automatic attendance deduction recorded',
           'An attendance deduction of UGX '||to_char(v_deduction,'FM999,999,999,999')||
           ' was recorded for a staff member on '||v_incident.attendance_date::text||
           ' after the review window expired without a Headteacher/DOS statement.',
           v_leader,'attendance',
           'attendance:auto-deduction:'||v_incident.id::text||':lead:'||v_leader::text,
           v_incident.id,true,jsonb_build_object('incident_id',v_incident.id,
             'attendance_date',v_incident.attendance_date,'deduction_ugx',v_deduction))
        on conflict (source_key) do nothing;
      end loop;

      v_count:=v_count+1;
    end if;
  end loop;

  return jsonb_build_object('automatic_deductions_enabled',true,
    'school_wide_review',false,'scheduled_staff_count',v_scheduled_count,
    'clocked_in_staff_count',v_clocked_count,'deductions_processed',v_count,
    'payroll_timing','next payroll run');
end;
$function$;

revoke all on function private.finalize_staff_attendance_auto_deductions() from public,anon,authenticated;

do $$
begin
  if not exists (
    select 1 from cron.job
    where command ilike '%finalize_staff_attendance_auto_deductions%'
  ) then
    perform cron.schedule(
      'cornhill-auto-attendance-deductions',
      '*/5 * * * *',
      'select private.finalize_staff_attendance_auto_deductions();'
    );
  end if;
end;
$$;
