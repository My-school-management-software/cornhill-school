-- Optional, first-party, pseudonymised school usage analytics.
-- No learner identifiers, message data, form text, phone numbers or raw IP addresses.
create table if not exists public.school_usage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  workspace text not null,
  event_type text not null,
  audience text not null check (audience in ('public','guardian','staff')),
  device_class text not null check (device_class in ('mobile','tablet','desktop','unknown')),
  visitor_hash text,
  session_hash text not null,
  actor_hash text,
  dedupe_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint school_usage_workspace_valid check (workspace in (
    'school_website','admissions','parent_portal','main_dashboard','staff_services',
    'academics','finance','attendance','hr_payroll','banking','evidence','records',
    'notifications','learning','library','transport','welfare','system_health',
    'noticeboard','calendar','visitor_register','asset_maintenance','other'
  )),
  constraint school_usage_event_valid check (event_type in (
    'page_view','admissions_form_started','admissions_form_submitted',
    'parent_login_success','parent_login_failure'
  ))
);

alter table public.school_usage_events enable row level security;
revoke all on table public.school_usage_events from public, anon, authenticated;
grant select, insert, delete on table public.school_usage_events to service_role;

create index if not exists school_usage_events_time_idx
  on public.school_usage_events(occurred_at desc);
create index if not exists school_usage_events_workspace_time_idx
  on public.school_usage_events(workspace, occurred_at desc);
create index if not exists school_usage_events_audience_time_idx
  on public.school_usage_events(audience, occurred_at desc);

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
  if p_end_date - p_start_date > 90 then
    raise exception 'Usage analytics date ranges cannot exceed 90 days.';
  end if;
  if p_end_date > (now() at time zone 'Africa/Kampala')::date then
    raise exception 'The analytics end date cannot be in the future.';
  end if;

  v_start := p_start_date::timestamp at time zone 'Africa/Kampala';
  v_end := (p_end_date + 1)::timestamp at time zone 'Africa/Kampala';

  select jsonb_build_object(
    'start_date',p_start_date,'end_date',p_end_date,'timezone','Africa/Kampala',
    'summary',(
      select jsonb_build_object(
        'events',count(*),
        'public_visitors',count(distinct visitor_hash) filter(where audience='public'),
        'guardian_accounts',count(distinct actor_hash) filter(where audience='guardian'),
        'staff_accounts',count(distinct actor_hash) filter(where audience='staff'),
        'admission_form_starts',count(*) filter(where event_type='admissions_form_started'),
        'admission_form_submissions',count(*) filter(where event_type='admissions_form_submitted'),
        'admission_form_received',count(*) filter(where event_type='admissions_form_accepted'),
        'guardian_sign_ins',count(*) filter(where event_type='parent_login_success'),
        'guardian_sign_in_failures',count(*) filter(where event_type='parent_login_failure')
      )
      from public.school_usage_events
      where occurred_at >= v_start and occurred_at < v_end
    ),
    'by_workspace',coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspace',workspace,'views',page_views,'events',event_count,
        'unique_visitors',public_visitors,'guardian_accounts',guardian_accounts,
        'staff_accounts',staff_accounts
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

do $retention$
declare v_job bigint;
begin
  select jobid into v_job from cron.job
  where jobname='cornhill-usage-analytics-90-day-retention';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'cornhill-usage-analytics-90-day-retention',
    '10 1 * * *',
    $job$delete from public.school_usage_events where occurred_at < now() - interval '90 days';$job$
  );
end;
$retention$;
