create or replace function public.get_school_usage_analytics_report(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Choose a valid analytics date range.';
  end if;
  if p_end_date - p_start_date > 89 then
    raise exception 'Usage analytics date ranges cannot exceed 90 calendar days.';
  end if;
  if p_end_date > (now() at time zone 'Africa/Kampala')::date then
    raise exception 'The analytics end date cannot be in the future.';
  end if;

  v_start := p_start_date::timestamp at time zone 'Africa/Kampala';
  v_end := (p_end_date + 1)::timestamp at time zone 'Africa/Kampala';

  select jsonb_build_object(
    'start_date',p_start_date,
    'end_date',p_end_date,
    'timezone','Africa/Kampala',
    'summary',(
      select jsonb_build_object(
        'events',count(*),
        'public_visitors',count(distinct visitor_hash) filter(where audience='public'),
        'guardian_accounts',count(distinct actor_hash) filter(where audience='guardian'),
        'staff_accounts',count(distinct actor_hash) filter(where audience='staff'),
        'admission_form_starts',count(*) filter(where event_type='admissions_form_started'),
        'admission_form_attempts',count(*) filter(where event_type='admissions_form_submitted'),
        'admission_form_accepted',count(*) filter(where event_type='admissions_form_accepted'),
        'admission_form_errors',count(*) filter(where event_type='admissions_form_error'),
        'guardian_sign_ins',count(*) filter(where event_type='parent_login_success'),
        'guardian_sign_in_failures',count(*) filter(where event_type='parent_login_failure')
      )
      from public.school_usage_events
      where occurred_at >= v_start and occurred_at < v_end
    ),
    'by_workspace',coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspace',workspace,'views',page_views,'events',event_count,
        'unique_visitors',public_visitors,
        'guardian_accounts',guardian_accounts,'staff_accounts',staff_accounts
      ) order by page_views desc,event_count desc,workspace)
      from (
        select workspace,
          count(*) filter(where event_type='page_view') page_views,
          count(*) event_count,
          count(distinct visitor_hash) filter(where audience='public') public_visitors,
          count(distinct actor_hash) filter(where audience='guardian') guardian_accounts,
          count(distinct actor_hash) filter(where audience='staff') staff_accounts
        from public.school_usage_events
        where occurred_at >= v_start and occurred_at < v_end
        group by workspace
      ) q
    ),'[]'::jsonb),
    'by_device',coalesce((
      select jsonb_agg(jsonb_build_object('device',device_class,'events',n) order by n desc)
      from (
        select device_class,count(*) n
        from public.school_usage_events
        where occurred_at >= v_start and occurred_at < v_end
        group by device_class
      ) q
    ),'[]'::jsonb),
    'by_event',coalesce((
      select jsonb_agg(jsonb_build_object('event',event_type,'events',n) order by n desc)
      from (
        select event_type,count(*) n
        from public.school_usage_events
        where occurred_at >= v_start and occurred_at < v_end
        group by event_type
      ) q
    ),'[]'::jsonb),
    'daily_trend',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',event_day,'events',n,'public_visitors',visitors,
        'guardian_accounts',guardians,'staff_accounts',staff
      ) order by event_day)
      from (
        select (occurred_at at time zone 'Africa/Kampala')::date event_day,
          count(*) n,
          count(distinct visitor_hash) filter(where audience='public') visitors,
          count(distinct actor_hash) filter(where audience='guardian') guardians,
          count(distinct actor_hash) filter(where audience='staff') staff
        from public.school_usage_events
        where occurred_at >= v_start and occurred_at < v_end
        group by (occurred_at at time zone 'Africa/Kampala')::date
      ) q
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_school_usage_analytics_report(date,date) from public,anon,authenticated;
grant execute on function public.get_school_usage_analytics_report(date,date) to service_role;
