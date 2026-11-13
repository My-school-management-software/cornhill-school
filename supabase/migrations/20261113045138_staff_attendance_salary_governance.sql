-- CORNHILL staff attendance and salary governance.
-- All attendance incidents remain pending until the Director decides.
-- Automatic attendance deductions are deliberately not enabled.

alter table public.staff_work_schedules
  add column if not exists saturday_start_time time,
  add column if not exists saturday_end_time time;
alter table public.staff_attendance_schedule_assignments
  add column if not exists saturday_required boolean not null default false;
alter table public.staff_attendance_incidents
  add column if not exists detected_at timestamptz not null default now(),
  add column if not exists review_deadline_at timestamptz,
  add column if not exists headteacher_statement text,
  add column if not exists headteacher_statement_by uuid references auth.users(id),
  add column if not exists headteacher_statement_at timestamptz,
  add column if not exists director_decision text,
  add column if not exists director_decision_by uuid references auth.users(id),
  add column if not exists director_decision_at timestamptz;
alter table public.staff_attendance_incidents
  add constraint staff_attendance_incidents_director_decision_check
  check (director_decision is null or director_decision in ('excused','deduct'));
update public.staff_attendance_incidents
set review_deadline_at = coalesce(review_deadline_at, detected_at + interval '2 hours')
where review_deadline_at is null;

create table if not exists public.staff_attendance_policy_settings (
  id boolean primary key default true check (id = true),
  review_window_minutes integer not null default 120 check (review_window_minutes between 60 and 360),
  sunday_paid_rest_day boolean not null default true,
  saturday_start_time time not null default '08:00',
  saturday_end_time time not null default '15:00',
  prep_enabled boolean not null default false,
  prep_deduction_ugx bigint not null default 0 check (prep_deduction_ugx >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint saturday_hours_valid check (saturday_end_time > saturday_start_time)
);
insert into public.staff_attendance_policy_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.staff_attendance_calendar_exceptions (
  attendance_date date primary key,
  exception_type text not null check (exception_type in ('public_holiday','school_closed','special_working_day')),
  is_working_day boolean not null default false,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.staff_prep_sessions (
  id uuid primary key default gen_random_uuid(),
  prep_date date not null,
  title text not null,
  start_time time not null,
  end_time time not null,
  class_name text not null,
  notes text,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint prep_hours_valid check (end_time > start_time)
);
create table if not exists public.staff_prep_assignments (
  id uuid primary key default gen_random_uuid(),
  prep_session_id uuid not null references public.staff_prep_sessions(id) on delete cascade,
  staff_user_id uuid not null references public.user_profiles(id) on delete restrict,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique (prep_session_id, staff_user_id)
);

create index if not exists staff_attendance_incidents_review_deadline_idx
  on public.staff_attendance_incidents(review_deadline_at)
  where status = 'pending' and director_decision is null;
create index if not exists staff_prep_sessions_date_idx on public.staff_prep_sessions(prep_date,start_time);
create index if not exists staff_prep_assignments_staff_idx on public.staff_prep_assignments(staff_user_id,prep_session_id);

alter table public.staff_attendance_policy_settings enable row level security;
alter table public.staff_attendance_calendar_exceptions enable row level security;
alter table public.staff_prep_sessions enable row level security;
alter table public.staff_prep_assignments enable row level security;
grant select,insert,update,delete on public.staff_attendance_policy_settings to authenticated;
grant select,insert,update,delete on public.staff_attendance_calendar_exceptions to authenticated;
grant select,insert,update,delete on public.staff_prep_sessions to authenticated;
grant select,insert,update,delete on public.staff_prep_assignments to authenticated;

create or replace function public.is_school_director()
returns boolean language sql stable security definer set search_path=''
as $function$
  select public.is_active_staff_session() and exists (
    select 1 from public.user_profiles p
    left join public.school_staff_directory d on d.linked_user_id=p.id
    where p.id=(select auth.uid())
      and upper(trim(coalesce(d.job_title,p.job_title,'')))='DIRECTOR'
  );
$function$;
create or replace function public.is_attendance_lead()
returns boolean language sql stable security definer set search_path=''
as $function$
  select public.is_active_staff_session() and exists (
    select 1 from public.user_profiles p
    left join public.school_staff_directory d on d.linked_user_id=p.id
    where p.id=(select auth.uid())
      and upper(trim(coalesce(d.job_title,p.job_title,''))) in
      ('DIRECTOR','HEADTEACHER','HEAD TEACHER','DEPUTY HEADTEACHER','DEPUTY HEAD TEACHER','DOS','DIRECTOR OF STUDIES')
  );
$function$;
revoke all on function public.is_school_director() from public,anon;
revoke all on function public.is_attendance_lead() from public,anon;
grant execute on function public.is_school_director() to authenticated;
grant execute on function public.is_attendance_lead() to authenticated;

create policy "Director manages attendance policy settings"
on public.staff_attendance_policy_settings for all to authenticated
using (public.is_school_director()) with check (public.is_school_director());
create policy "Active staff read attendance calendar exceptions"
on public.staff_attendance_calendar_exceptions for select to authenticated
using (public.is_active_staff_session());
create policy "Director manages attendance calendar exceptions"
on public.staff_attendance_calendar_exceptions for all to authenticated
using (public.is_school_director()) with check (public.is_school_director());
create policy "Director manages prep sessions"
on public.staff_prep_sessions for all to authenticated
using (public.is_school_director()) with check (public.is_school_director());
create policy "Assigned staff read own prep sessions"
on public.staff_prep_sessions for select to authenticated
using (exists (select 1 from public.staff_prep_assignments a
  where a.prep_session_id=staff_prep_sessions.id and a.staff_user_id=(select auth.uid())));
create policy "Director manages prep assignments"
on public.staff_prep_assignments for all to authenticated
using (public.is_school_director()) with check (public.is_school_director());
create policy "Staff read own prep assignments"
on public.staff_prep_assignments for select to authenticated
using (staff_user_id=(select auth.uid()));

create policy "Staff read own salary agreements"
on public.staff_salary_agreements for select to authenticated
using (staff_user_id=(select auth.uid()));
create policy "Staff read own attendance incidents"
on public.staff_attendance_incidents for select to authenticated
using (staff_user_id=(select auth.uid()));
create policy "Attendance leads read attendance incidents"
on public.staff_attendance_incidents for select to authenticated
using (public.is_attendance_lead());

create or replace function public.set_staff_saturday_attendance_requirement()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_required boolean;
begin
  select exists (
    select 1 from public.class_teacher_access a
    join public.school_classes c on c.id=a.class_id
    where a.user_id=new.staff_user_id
      and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
    union
    select 1 from public.class_subjects cs
    join public.school_classes c on c.id=cs.class_id
    where cs.teacher_user_id=new.staff_user_id
      and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
  ) into v_required;
  new.saturday_required:=coalesce(v_required,false);
  return new;
end;
$function$;
revoke all on function public.set_staff_saturday_attendance_requirement() from public,anon,authenticated;
drop trigger if exists trg_set_staff_saturday_attendance_requirement on public.staff_attendance_schedule_assignments;
create trigger trg_set_staff_saturday_attendance_requirement
before insert or update of staff_user_id on public.staff_attendance_schedule_assignments
for each row execute function public.set_staff_saturday_attendance_requirement();

create or replace function public.refresh_staff_saturday_attendance_requirement()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_staff_id uuid;
begin
  v_staff_id:=coalesce(new.user_id,old.user_id);
  update public.staff_attendance_schedule_assignments a
  set saturday_required=exists (
    select 1 from public.class_teacher_access cta
    join public.school_classes c on c.id=cta.class_id
    where cta.user_id=a.staff_user_id
      and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
    union
    select 1 from public.class_subjects cs
    join public.school_classes c on c.id=cs.class_id
    where cs.teacher_user_id=a.staff_user_id
      and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
  )
  where a.staff_user_id=v_staff_id;
  return coalesce(new,old);
end;
$function$;
revoke all on function public.refresh_staff_saturday_attendance_requirement() from public,anon,authenticated;
drop trigger if exists trg_refresh_saturday_from_class_teacher_access on public.class_teacher_access;
create trigger trg_refresh_saturday_from_class_teacher_access
after insert or update or delete on public.class_teacher_access
for each row execute function public.refresh_staff_saturday_attendance_requirement();

create or replace function public.refresh_saturday_requirement_from_subject_teacher()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_staff_id uuid;
begin
  v_staff_id:=coalesce(new.teacher_user_id,old.teacher_user_id);
  if v_staff_id is not null then
    update public.staff_attendance_schedule_assignments a
    set saturday_required=exists (
      select 1 from public.class_teacher_access cta
      join public.school_classes c on c.id=cta.class_id
      where cta.user_id=a.staff_user_id
        and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
      union
      select 1 from public.class_subjects cs
      join public.school_classes c on c.id=cs.class_id
      where cs.teacher_user_id=a.staff_user_id
        and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
    )
    where a.staff_user_id=v_staff_id;
  end if;
  return coalesce(new,old);
end;
$function$;
revoke all on function public.refresh_saturday_requirement_from_subject_teacher() from public,anon,authenticated;
drop trigger if exists trg_refresh_saturday_from_class_subjects on public.class_subjects;
create trigger trg_refresh_saturday_from_class_subjects
after insert or update or delete on public.class_subjects
for each row execute function public.refresh_saturday_requirement_from_subject_teacher();

create or replace function public.staff_submit_attendance_statement(p_incident_id uuid,p_statement text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_row public.staff_attendance_incidents%rowtype;
begin
  if not public.is_attendance_lead() then
    raise exception 'Only the Director, Headteacher or DOS may submit an attendance statement.';
  end if;
  if length(btrim(coalesce(p_statement,'')))<8 or length(p_statement)>1500 then
    raise exception 'Enter an attendance statement of 8 to 1500 characters.';
  end if;
  select * into v_row from public.staff_attendance_incidents where id=p_incident_id for update;
  if not found then raise exception 'Attendance incident not found.'; end if;
  if v_row.status<>'pending' or v_row.director_decision is not null then
    raise exception 'This incident has already been decided.';
  end if;
  update public.staff_attendance_incidents
  set headteacher_statement=btrim(p_statement),
      headteacher_statement_by=(select auth.uid()),
      headteacher_statement_at=now()
  where id=p_incident_id;
  return jsonb_build_object('ok',true,'incident_id',p_incident_id,'statement_saved_at',now());
end;
$function$;
revoke all on function public.staff_submit_attendance_statement(uuid,text) from public,anon;
grant execute on function public.staff_submit_attendance_statement(uuid,text) to authenticated;

create or replace function public.director_decide_staff_attendance_incident(
 p_incident_id uuid,p_decision text,p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_row public.staff_attendance_incidents%rowtype;
 v_daily_rate bigint;
 v_already_approved bigint;
 v_deduction bigint;
begin
 if not public.is_school_director() then
   raise exception 'Only the Director can make the final attendance deduction decision.';
 end if;
 if p_decision not in ('excused','deduct') then
   raise exception 'Decision must be excused or deduct.';
 end if;
 select * into v_row from public.staff_attendance_incidents where id=p_incident_id for update;
 if not found then raise exception 'Attendance incident not found.'; end if;
 if v_row.status<>'pending' or v_row.director_decision is not null then
   raise exception 'This attendance incident has already been decided.';
 end if;
 if p_decision='deduct' then
   if v_row.review_deadline_at is null or now()<v_row.review_deadline_at then
     raise exception 'The two-hour review window has not ended. No deduction can be approved yet.';
   end if;
   if nullif(btrim(v_row.headteacher_statement),'') is null then
     raise exception 'A Headteacher or DOS statement must be recorded before a deduction can be approved.';
   end if;
   select coalesce(a.daily_rate_ugx,case
     when a.salary_basis='Monthly' then round(a.base_salary_ugx::numeric/
       extract(day from (date_trunc('month',v_row.attendance_date::timestamp)+interval '1 month - 1 day')))::bigint
     when a.salary_basis='Yearly' then round(a.base_salary_ugx::numeric/
       extract(day from (date_trunc('year',v_row.attendance_date::timestamp)+interval '1 year - 1 day')))::bigint
     else null end)::bigint
   into v_daily_rate
   from public.staff_salary_agreements a
   where a.staff_user_id=v_row.staff_user_id and a.is_active
     and a.effective_from<=v_row.attendance_date
     and (a.effective_to is null or a.effective_to>=v_row.attendance_date)
   order by a.effective_from desc,a.created_at desc limit 1;
   if coalesce(v_daily_rate,0)<=0 then
     raise exception 'No valid daily rate is configured. Add a daily rate to the staff salary agreement before approving a deduction.';
   end if;
   select coalesce(sum(i.approved_deduction_ugx),0)::bigint into v_already_approved
   from public.staff_attendance_incidents i
   where i.staff_user_id=v_row.staff_user_id and i.attendance_date=v_row.attendance_date
     and i.id<>v_row.id and i.status in ('approved','deducted');
   v_deduction:=greatest(0,v_daily_rate-v_already_approved);
   if v_deduction<=0 then
     raise exception 'The daily absence deduction limit has already been reached for this date.';
   end if;
   update public.staff_attendance_incidents
   set director_decision='deduct',director_decision_by=(select auth.uid()),
       director_decision_at=now(),status='approved',approved_deduction_ugx=v_deduction,
       reviewed_by=(select auth.uid()),reviewed_at=now(),
       review_note=nullif(btrim(coalesce(p_review_note,'')),'')
   where id=p_incident_id;
 else
   update public.staff_attendance_incidents
   set director_decision='excused',director_decision_by=(select auth.uid()),
       director_decision_at=now(),status='rejected',approved_deduction_ugx=0,
       reviewed_by=(select auth.uid()),reviewed_at=now(),
       review_note=nullif(btrim(coalesce(p_review_note,'')),'')
   where id=p_incident_id;
 end if;
 return jsonb_build_object('ok',true,'incident_id',p_incident_id,'decision',p_decision,
   'deduction_ugx',case when p_decision='deduct' then v_deduction else 0 end);
end;
$function$;
revoke all on function public.director_decide_staff_attendance_incident(uuid,text,text) from public,anon;
grant execute on function public.director_decide_staff_attendance_incident(uuid,text,text) to authenticated;

create or replace function private.process_staff_attendance_alerts()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_now_local timestamp without time zone:=now() at time zone 'Africa/Kampala';
 v_local_date date:=(now() at time zone 'Africa/Kampala')::date;
 v_processed integer:=0;
 r record;
 v_start_time time;
 v_end_time time;
 v_schedule_start timestamp without time zone;
 v_schedule_end timestamp without time zone;
 v_cutoff timestamp without time zone;
 v_review_deadline timestamptz;
 v_first_in timestamptz;
 v_last_out timestamptz;
 v_incident_type text;
 v_message text;
 v_incident_id uuid;
 v_exception_working boolean;
 v_recipient uuid;
begin
 for r in
  select a.staff_user_id,a.saturday_required,s.name as schedule_name,
         s.start_time,s.end_time,s.saturday_start_time,s.saturday_end_time,
         s.grace_minutes,s.weekdays
  from public.staff_attendance_schedule_assignments a
  join public.staff_work_schedules s on s.id=a.schedule_id and s.is_active
  join public.user_profiles p on p.id=a.staff_user_id
  where p.employment_status='Active'
 loop
  if extract(dow from v_local_date)=0 then continue; end if;
  if extract(dow from v_local_date)=6 then
    if not r.saturday_required then continue; end if;
    v_start_time:=coalesce(r.saturday_start_time,time '08:00');
    v_end_time:=coalesce(r.saturday_end_time,time '15:00');
  else
    if not (r.weekdays @> array[extract(dow from v_local_date)::smallint]) then continue; end if;
    v_start_time:=r.start_time;
    v_end_time:=r.end_time;
  end if;
  select ce.is_working_day into v_exception_working
  from public.staff_attendance_calendar_exceptions ce
  where ce.attendance_date=v_local_date;
  if found and not coalesce(v_exception_working,false) then continue; end if;

  v_schedule_start:=v_local_date+v_start_time;
  v_schedule_end:=v_local_date+v_end_time+
    case when v_end_time<=v_start_time then interval '1 day' else interval '0 day' end;
  v_cutoff:=v_schedule_start+make_interval(mins=>r.grace_minutes);

  select min(e.occurred_at) filter(where e.event_type='clock_in'),
         max(e.occurred_at) filter(where e.event_type='clock_out')
  into v_first_in,v_last_out
  from public.staff_attendance_events e
  where e.staff_user_id=r.staff_user_id
    and e.occurred_at >= (v_local_date::timestamp at time zone 'Africa/Kampala')
    and e.occurred_at < ((v_local_date+1)::timestamp at time zone 'Africa/Kampala');

  v_incident_type:=null;
  if v_first_in is null and v_now_local>v_cutoff then
    v_incident_type:='missed_clock_in';
    v_message:='Your attendance deadline has passed without a recorded clock-in. The Headteacher/DOS and Director must review the reason before any salary decision.';
  elsif v_first_in is not null and (v_first_in at time zone 'Africa/Kampala')>v_cutoff then
    v_incident_type:='missed_clock_in';
    v_message:='Your clock-in was later than the permitted start and grace period. The Headteacher/DOS and Director must review the reason before any salary decision.';
  end if;
  if v_incident_type is not null then
    insert into public.staff_attendance_alerts(staff_user_id,attendance_date,alert_type,message,status)
    values(r.staff_user_id,v_local_date,v_incident_type,v_message,'unread')
    on conflict(staff_user_id,attendance_date,alert_type) do update set message=excluded.message;
    v_review_deadline:=(v_cutoff+interval '2 hours') at time zone 'Africa/Kampala';
    insert into public.staff_attendance_incidents
      (staff_user_id,attendance_date,incident_type,status,proposed_deduction_ugx,approved_deduction_ugx,detected_at,review_deadline_at)
    values(r.staff_user_id,v_local_date,v_incident_type,'pending',0,0,now(),v_review_deadline)
    on conflict(staff_user_id,attendance_date,incident_type) do nothing
    returning id into v_incident_id;
    if v_incident_id is null then
      select i.id into v_incident_id from public.staff_attendance_incidents i
      where i.staff_user_id=r.staff_user_id and i.attendance_date=v_local_date and i.incident_type=v_incident_type;
    end if;
    insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id,is_actionable,action_payload)
    values('attendance','warning','Attendance requires review',v_message,r.staff_user_id,'attendance',
      'attendance:'||v_incident_id::text||':staff',v_incident_id,true,jsonb_build_object('incident_id',v_incident_id))
    on conflict(source_key) do nothing;
    for v_recipient in
      select p.id from public.user_profiles p
      left join public.school_staff_directory d on d.linked_user_id=p.id
      where p.employment_status='Active'
        and upper(trim(coalesce(d.job_title,p.job_title,''))) in
        ('DIRECTOR','HEADTEACHER','HEAD TEACHER','DEPUTY HEADTEACHER','DEPUTY HEAD TEACHER','DOS','DIRECTOR OF STUDIES')
    loop
      insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id,is_actionable,action_payload)
      values('attendance','warning','Staff attendance decision required',
        'A staff attendance incident requires a leadership statement and Director review.',
        v_recipient,'attendance','attendance:'||v_incident_id::text||':lead:'||v_recipient::text,
        v_incident_id,true,jsonb_build_object('incident_id',v_incident_id))
      on conflict(source_key) do nothing;
    end loop;
    v_processed:=v_processed+1;
  end if;

  if v_first_in is not null and v_last_out is null
     and v_now_local>v_schedule_end+make_interval(mins=>r.grace_minutes) then
    v_incident_type:='missed_clock_out';
    v_message:='There is no recorded clock-out after the scheduled end and grace period. Leadership must review this before any salary decision.';
    insert into public.staff_attendance_alerts(staff_user_id,attendance_date,alert_type,message,status)
    values(r.staff_user_id,v_local_date,v_incident_type,v_message,'unread')
    on conflict(staff_user_id,attendance_date,alert_type) do update set message=excluded.message;
    v_review_deadline:=((v_schedule_end+make_interval(mins=>r.grace_minutes)+interval '2 hours') at time zone 'Africa/Kampala');
    insert into public.staff_attendance_incidents
      (staff_user_id,attendance_date,incident_type,status,proposed_deduction_ugx,approved_deduction_ugx,detected_at,review_deadline_at)
    values(r.staff_user_id,v_local_date,v_incident_type,'pending',0,0,now(),v_review_deadline)
    on conflict(staff_user_id,attendance_date,incident_type) do nothing
    returning id into v_incident_id;
    if v_incident_id is null then
      select i.id into v_incident_id from public.staff_attendance_incidents i
      where i.staff_user_id=r.staff_user_id and i.attendance_date=v_local_date and i.incident_type=v_incident_type;
    end if;
    insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id,is_actionable,action_payload)
    values('attendance','warning','Clock-out requires review',v_message,r.staff_user_id,'attendance',
      'attendance:'||v_incident_id::text||':staff',v_incident_id,true,jsonb_build_object('incident_id',v_incident_id))
    on conflict(source_key) do nothing;
    for v_recipient in
      select p.id from public.user_profiles p
      left join public.school_staff_directory d on d.linked_user_id=p.id
      where p.employment_status='Active'
        and upper(trim(coalesce(d.job_title,p.job_title,''))) in
        ('DIRECTOR','HEADTEACHER','HEAD TEACHER','DEPUTY HEADTEACHER','DEPUTY HEAD TEACHER','DOS','DIRECTOR OF STUDIES')
    loop
      insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id,is_actionable,action_payload)
      values('attendance','warning','Staff clock-out requires review',
        'A missing clock-out needs a leadership statement and Director decision.',
        v_recipient,'attendance','attendance:'||v_incident_id::text||':lead:'||v_recipient::text,
        v_incident_id,true,jsonb_build_object('incident_id',v_incident_id))
      on conflict(source_key) do nothing;
    end loop;
    v_processed:=v_processed+1;
  end if;
 end loop;

 insert into public.school_notifications(category,severity,title,message,recipient_user_id,action_workspace,source_key,source_id,is_actionable,action_payload)
 select 'attendance','urgent','Attendance decision overdue',
   'The two-hour review window has ended. A Director decision is still required; payroll has not been deducted.',
   p.id,'attendance','attendance:'||i.id::text||':review_due:'||p.id::text,
   i.id,true,jsonb_build_object('incident_id',i.id)
 from public.staff_attendance_incidents i
 cross join public.user_profiles p
 left join public.school_staff_directory d on d.linked_user_id=p.id
 where i.status='pending' and i.director_decision is null and i.review_deadline_at<=now()
   and p.employment_status='Active'
   and upper(trim(coalesce(d.job_title,p.job_title,'')))='DIRECTOR'
 on conflict(source_key) do nothing;

 return jsonb_build_object('checked_at',now(),'timezone','Africa/Kampala',
   'incidents_processed',v_processed,'automatic_deductions_enabled',false,
   'director_approval_required',true,'review_window_hours',2);
end;
$function$;
revoke all on function private.process_staff_attendance_alerts() from public,anon,authenticated;
