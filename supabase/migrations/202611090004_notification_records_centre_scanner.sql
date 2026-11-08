-- CORNHILL notification centre, workflow coverage and record-expiry automation.
-- Reuses school_notifications and school_record_index; does not create duplicate
-- notification or file stores. All trigger functions are private to database triggers.

create or replace function public.list_school_notification_center(
  p_include_resolved boolean default false,
  p_archived boolean default false
)
returns table (
  id uuid, category text, severity text, title text, message text,
  student_id uuid, action_workspace text, created_at timestamptz,
  source_key text, source_id uuid, created_by_name text, action_payload jsonb,
  is_actionable boolean, read_at timestamptz, resolved_at timestamptz,
  archived_at timestamptz
)
language plpgsql security definer set search_path=''
as $function$
declare v_role text; v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required' using errcode='42501';
  end if;
  select p.role into v_role
  from public.user_profiles p
  where p.id=(select auth.uid()) and coalesce(p.employment_status,'Active')='Active';
  if v_role is null then
    raise exception 'An active school account is required' using errcode='42501';
  end if;
  v_admin:=coalesce(public.is_school_admin(),false);

  return query
  select n.id,n.category,n.severity,n.title,n.message,n.student_id,
         n.action_workspace,n.created_at,n.source_key,n.source_id,
         coalesce(author.full_name,'School system'),n.action_payload,
         n.is_actionable,us.read_at,n.resolved_at,us.archived_at
  from public.school_notifications n
  left join public.user_profiles author on author.id=n.created_by
  left join public.school_notification_user_state us
    on us.notification_id=n.id and us.user_id=(select auth.uid())
  where n.archived_at is null
    and (coalesce(p_include_resolved,false) or n.resolved_at is null)
    and (
      (coalesce(p_archived,false) and us.archived_at is not null)
      or (not coalesce(p_archived,false) and us.archived_at is null)
    )
    and (
      (
        v_admin
        and (n.recipient_user_id is null or n.recipient_user_id=(select auth.uid()))
        and (n.audience_role is null or n.audience_role='Admin')
      )
      or
      (
        not v_admin
        and (
          n.recipient_user_id=(select auth.uid())
          or (
            n.recipient_user_id is null
            and n.audience_role=v_role
            and (
              n.student_id is null
              or (
                v_role='Teacher'
                and exists (
                  select 1 from public.students s
                  where s.id=n.student_id and s.status<>'Archived'
                    and public.is_class_teacher_for_class(s.class_id)
                )
              )
            )
          )
        )
      )
    )
    and (
      n.student_id is null
      or exists (
        select 1 from public.students s
        where s.id=n.student_id and s.status<>'Archived'
      )
    )
  order by
    case n.severity when 'urgent' then 0 when 'warning' then 1 else 2 end,
    n.created_at desc
  limit 250;
end;
$function$;
revoke all on function public.list_school_notification_center(boolean,boolean) from public,anon;
grant execute on function public.list_school_notification_center(boolean,boolean) to authenticated;

-- Escalating expiry reminders: 30 days, 7 days, due today and expired.
-- Old stages are resolved automatically when the expiry date changes or the
-- document advances to the next stage / is archived.
create or replace function private.generate_school_record_expiry_notifications()
returns integer
language plpgsql security definer set search_path=''
as $function$
declare v_count integer := 0;
begin
  if auth.uid() is not null and not coalesce(public.is_school_admin(),false) then
    raise exception 'Only administrators can generate document expiry alerts' using errcode='42501';
  end if;

  update public.school_notifications n
  set resolved_at=now()
  where n.category='document_expiry'
    and n.resolved_at is null
    and not exists (
      select 1
      from public.school_record_index x
      cross join lateral (
        select case
          when x.expires_on < current_date then 'expired'
          when x.expires_on = current_date then 'today'
          when x.expires_on <= current_date + 7 then '7-day'
          when x.expires_on <= current_date + 30 then '30-day'
          else null
        end as stage
      ) st
      where x.id=n.source_id
        and x.expires_on is not null
        and x.verification_status<>'Archived'
        and st.stage is not null
        and n.source_key='record-expiry:'||x.id::text||':'||st.stage||':'||x.expires_on::text
    );

  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    audience_role,action_payload,is_actionable
  )
  select
    'document_expiry',
    case st.stage when '30-day' then 'warning' else 'urgent' end,
    case st.stage
      when '30-day' then 'Document expires within 30 days'
      when '7-day' then 'Document renewal due within 7 days'
      when 'today' then 'Document expires today'
      else 'School document expired'
    end,
    x.record_title||' ('||x.record_type||') '||
      case st.stage
        when '30-day' then 'expires on '||to_char(x.expires_on,'DD Mon YYYY')||'. Arrange renewal.'
        when '7-day' then 'expires on '||to_char(x.expires_on,'DD Mon YYYY')||'. Renewal is urgent.'
        when 'today' then 'expires today ('||to_char(x.expires_on,'DD Mon YYYY')||'). Replace or renew it.'
        else 'expired on '||to_char(x.expires_on,'DD Mon YYYY')||'. Check the source record and arrange a valid replacement.'
      end,
    'reports',
    'record-expiry:'||x.id::text||':'||st.stage||':'||x.expires_on::text,
    x.id,
    'Admin',
    jsonb_build_object('url','/records.html','workspace','reports','target_id','recordsVault','record_index_id',x.id),
    true
  from public.school_record_index x
  cross join lateral (
    select case
      when x.expires_on < current_date then 'expired'
      when x.expires_on = current_date then 'today'
      when x.expires_on <= current_date + 7 then '7-day'
      when x.expires_on <= current_date + 30 then '30-day'
      else null
    end as stage
  ) st
  where x.expires_on is not null
    and x.verification_status<>'Archived'
    and st.stage is not null
  on conflict(source_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function private.generate_school_record_expiry_notifications() from public,anon,authenticated;
grant execute on function private.generate_school_record_expiry_notifications() to postgres,service_role;

-- Daily run at 06:00 Africa/Kampala (03:00 UTC).
select cron.schedule(
  'cornhill-record-expiry-check',
  '0 3 * * *',
  'select private.generate_school_record_expiry_notifications();'
);

-- Attendance adjustment submissions and decisions.
create or replace function public.notify_school_attendance_adjustment_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_severity text;
        v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    if new.status<>'pending' then return new; end if;
    v_key:='attendance-adjustment:'||new.id::text||':pending';
    v_title:='Attendance adjustment needs review';
    v_message:='A staff attendance adjustment was submitted for '||to_char(new.attendance_date,'DD Mon YYYY')||
      '. Type: '||new.adjustment_type||'. Check the reason and supporting attendance record.';
    v_severity:='warning'; v_audience:='Admin';
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='attendance-adjustment:'||new.id::text||':'||new.status;
    v_title:=case new.status when 'approved' then 'Attendance adjustment approved'
             when 'rejected' then 'Attendance adjustment rejected' else 'Attendance adjustment updated' end;
    v_message:='Your attendance adjustment for '||to_char(new.attendance_date,'DD Mon YYYY')||
      ' was '||new.status||'.'||case when coalesce(new.review_note,'')<>'' then ' Note: '||new.review_note else '' end;
    v_severity:=case when new.status='rejected' then 'warning' else 'info' end;
    v_recipient:=new.requested_by;
  end if;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable)
  values('attendance_adjustment',v_severity,v_title,v_message,'attendance',v_key,new.id,
    v_recipient,v_audience,jsonb_build_object('url','/?workspace=attendance','workspace','attendance','record_id',new.id),
    new.status='pending')
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_attendance_adjustment_notification on public.staff_attendance_adjustments;
create trigger school_attendance_adjustment_notification
after insert or update of status on public.staff_attendance_adjustments
for each row execute function public.notify_school_attendance_adjustment_event();
revoke all on function public.notify_school_attendance_adjustment_event() from public,anon,authenticated;

-- Attendance deduction incidents.
create or replace function public.notify_school_attendance_incident_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_severity text; v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    if new.status<>'pending' then return new; end if;
    v_key:='attendance-incident:'||new.id::text||':pending';
    v_title:='Attendance incident needs review';
    v_message:='A staff attendance incident was raised for '||to_char(new.attendance_date,'DD Mon YYYY')||
      '. Verify the clocking record before making a payroll decision.';
    v_severity:='warning'; v_audience:='Admin';
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='attendance-incident:'||new.id::text||':'||new.status;
    v_title:='Attendance incident decision recorded';
    v_message:='Your attendance incident for '||to_char(new.attendance_date,'DD Mon YYYY')||
      ' is now '||new.status||'.';
    v_severity:=case when new.status='rejected' then 'warning' else 'info' end;
    v_recipient:=new.staff_user_id;
  end if;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable)
  values('attendance_incident',v_severity,v_title,v_message,'attendance',v_key,new.id,
    v_recipient,v_audience,jsonb_build_object('url','/?workspace=attendance','workspace','attendance','record_id',new.id),
    new.status='pending')
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_attendance_incident_notification on public.staff_attendance_incidents;
create trigger school_attendance_incident_notification
after insert or update of status on public.staff_attendance_incidents
for each row execute function public.notify_school_attendance_incident_event();
revoke all on function public.notify_school_attendance_incident_event() from public,anon,authenticated;

-- Salary advance approvals and decisions.
create or replace function public.notify_school_salary_advance_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_severity text; v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    if new.status<>'Pending' then return new; end if;
    v_key:='salary-advance:'||new.id::text||':Pending';
    v_title:='Staff salary advance needs approval';
    v_message:='A salary advance request for UGX '||to_char(new.amount_ugx,'FM999,999,999,999,990')||
      ' needs review. Check the staff account and repayment details.';
    v_severity:='urgent'; v_audience:='Admin';
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='salary-advance:'||new.id::text||':'||new.status;
    v_title:='Salary advance status updated';
    v_message:='Your salary advance request is now '||new.status||
      '. Outstanding balance: UGX '||to_char(new.outstanding_ugx,'FM999,999,999,999,990')||'.';
    v_severity:=case when new.status='Cancelled' then 'warning' else 'info' end;
    v_recipient:=new.staff_user_id;
  end if;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable)
  values('salary_advance',v_severity,v_title,v_message,'finance',v_key,new.id,
    v_recipient,v_audience,jsonb_build_object('url','/school-services.html#hr-payroll','workspace','finance','record_id',new.id),
    new.status='Pending')
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_salary_advance_notification on public.staff_salary_advances;
create trigger school_salary_advance_notification
after insert or update of status on public.staff_salary_advances
for each row execute function public.notify_school_salary_advance_event();
revoke all on function public.notify_school_salary_advance_event() from public,anon,authenticated;

-- Individual payroll payment updates; only the employee concerned sees the notice.
create or replace function public.notify_school_payroll_item_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_title text; v_message text; v_severity text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('Paid','On hold') then return new; end if;
  v_title:=case new.status when 'Paid' then 'Salary payment recorded' else 'Payroll item placed on hold' end;
  v_message:=case new.status
    when 'Paid' then 'Your payroll payment has been marked Paid. Net amount: UGX '||
      to_char(coalesce(new.net_pay_ugx,new.base_salary_ugx+new.allowances_ugx-new.deductions_ugx-new.advance_recovery_ugx),'FM999,999,999,999,990')||'.'
    else 'Your payroll item is on hold. Contact the Bursar or school administration for the approved explanation.' end;
  v_severity:=case when new.status='On hold' then 'warning' else 'info' end;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,action_payload,is_actionable)
  values('payroll',v_severity,v_title,v_message,'finance',
    'payroll-item:'||new.id::text||':'||new.status,new.id,
    new.staff_user_id,jsonb_build_object('url','/school-services.html#hr-payroll','workspace','finance','payroll_item_id',new.id),
    new.status='On hold')
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_payroll_item_notification on public.payroll_items;
create trigger school_payroll_item_notification
after update of status on public.payroll_items
for each row execute function public.notify_school_payroll_item_event();
revoke all on function public.notify_school_payroll_item_event() from public,anon,authenticated;

-- Restricted welfare cases: send only a generic alert, never the private case narrative.
create or replace function public.notify_school_welfare_case_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_severity text; v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    v_key:='welfare-case:'||new.id::text||':opened';
    v_title:='New restricted welfare case';
    v_message:='A new restricted welfare case was opened. Sign in with authorised welfare permissions to review it.';
    v_severity:='warning'; v_audience:='Admin';
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='welfare-case:'||new.id::text||':'||new.status;
    v_title:='Restricted welfare case updated';
    v_message:='A restricted welfare case status changed to '||new.status||'. Open the welfare workspace using your authorised account.';
    v_severity:=case when new.status in ('Referred','Follow-up') then 'warning' else 'info' end;
    v_recipient:=new.created_by;
  end if;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable)
  values('welfare',v_severity,v_title,v_message,'school',v_key,new.id,
    v_recipient,v_audience,jsonb_build_object('url','/school-services.html#welfare','workspace','school','record_id',new.id),
    new.status in ('Open','Follow-up','Referred'))
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_welfare_case_notification_insert on public.school_welfare_cases;
create trigger school_welfare_case_notification_insert
after insert on public.school_welfare_cases
for each row execute function public.notify_school_welfare_case_event();
drop trigger if exists school_welfare_case_notification_update on public.school_welfare_cases;
create trigger school_welfare_case_notification_update
after update of status on public.school_welfare_cases
for each row execute function public.notify_school_welfare_case_event();
revoke all on function public.notify_school_welfare_case_event() from public,anon,authenticated;

-- School asset maintenance submissions, assignments and decisions.
create or replace function public.notify_school_asset_maintenance_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_message text; v_severity text;
begin
  if tg_op='INSERT' then
    v_key:='asset-maintenance:'||new.id::text||':reported:admin';
    v_message:='A maintenance issue was reported: '||new.issue_title||' ('||new.asset_label||'). Urgency: '||new.urgency||'.';
    v_severity:=case when new.urgency in ('High','Urgent') then 'urgent' else 'warning' end;
    insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
      audience_role,action_payload,is_actionable)
    values('asset_maintenance',v_severity,'New school maintenance issue',v_message,'school',v_key,new.id,'Admin',
      jsonb_build_object('url','/school-services.html#facilities','workspace','school','record_id',new.id),true)
    on conflict(source_key) do nothing;
    if new.assigned_to is not null then
      insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
        recipient_user_id,action_payload,is_actionable)
      values('asset_maintenance','warning','Maintenance task assigned to you',
        'You have been assigned: '||new.issue_title||' ('||new.asset_label||').','school',
        'asset-maintenance:'||new.id::text||':assigned:'||new.assigned_to::text,new.id,
        new.assigned_to,jsonb_build_object('url','/school-services.html#facilities','workspace','school','record_id',new.id),true)
      on conflict(source_key) do nothing;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    v_key:='asset-maintenance:'||new.id::text||':status:'||new.status;
    v_message:='Maintenance issue "'||new.issue_title||'" is now '||new.status||'.';
    v_severity:=case when new.status='Cancelled' then 'warning' else 'info' end;
    insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
      audience_role,action_payload,is_actionable)
    values('asset_maintenance',v_severity,'Maintenance status updated',v_message,'school',v_key,new.id,
      'Admin',jsonb_build_object('url','/school-services.html#facilities','workspace','school','record_id',new.id),
      new.status not in ('Completed','Cancelled'))
    on conflict(source_key) do nothing;
    if new.reported_by is not null then
      insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
        recipient_user_id,action_payload,is_actionable)
      values('asset_maintenance',v_severity,'Maintenance report updated',v_message,'school',
        v_key||':reporter',new.id,new.reported_by,
        jsonb_build_object('url','/school-services.html#facilities','workspace','school','record_id',new.id),
        new.status not in ('Completed','Cancelled'))
      on conflict(source_key) do nothing;
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
      recipient_user_id,action_payload,is_actionable)
    values('asset_maintenance','warning','Maintenance task assigned to you',
      'You have been assigned: '||new.issue_title||' ('||new.asset_label||').','school',
      'asset-maintenance:'||new.id::text||':assigned:'||new.assigned_to::text,new.id,new.assigned_to,
      jsonb_build_object('url','/school-services.html#facilities','workspace','school','record_id',new.id),true)
    on conflict(source_key) do nothing;
  end if;
  return new;
end;
$function$;
drop trigger if exists school_asset_maintenance_notification on public.school_asset_maintenance;
create trigger school_asset_maintenance_notification
after insert or update of status,assigned_to on public.school_asset_maintenance
for each row execute function public.notify_school_asset_maintenance_event();
revoke all on function public.notify_school_asset_maintenance_event() from public,anon,authenticated;

-- Visitor arrival and departure notices for the school administration.
create or replace function public.notify_school_visitor_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    v_key:='visitor:'||new.id::text||':checked-in';
    v_title:='Visitor checked in';
    v_message:=new.visitor_name||' checked in to visit '||new.person_to_visit||'. Purpose: '||new.visit_purpose||'.';
    v_audience:='Admin';
  else
    if new.status is not distinct from old.status or new.status<>'Checked Out' then return new; end if;
    v_key:='visitor:'||new.id::text||':checked-out';
    v_title:='Visitor checked out';
    v_message:='Visitor '||new.visitor_name||' has checked out.';
    v_recipient:=new.checked_in_by;
  end if;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable)
  values('visitor','info',v_title,v_message,'school',v_key,new.id,v_recipient,v_audience,
    jsonb_build_object('url','/school-services.html#visitor-register','workspace','school','record_id',new.id),
    false)
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_visitor_notification on public.school_visitor_log;
create trigger school_visitor_notification
after insert or update of status on public.school_visitor_log
for each row execute function public.notify_school_visitor_event();
revoke all on function public.notify_school_visitor_event() from public,anon,authenticated;

-- Reports published for a class notify administrators and only the relevant class teacher.
create or replace function public.notify_school_report_publication()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_student_name text; v_class_name text; v_term_label text;
begin
  select concat_ws(' ',s.first_name,s.middle_name,s.last_name),c.name,t.name
    into v_student_name,v_class_name,v_term_label
  from public.students s
  left join public.school_classes c on c.id=new.class_id
  left join public.academic_terms t on t.id=new.term_id
  where s.id=new.student_id;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    student_id,audience_role,action_payload,is_actionable)
  values('report_publication','info','Learner report approved',
    'A report card for '||coalesce(v_student_name,'a learner')||' in '||coalesce(v_class_name,'the assigned class')||
      ' ('||coalesce(v_term_label,'current term')||') was approved for publication.',
    'academics','report-publication:'||new.id::text||':admin',new.id,new.student_id,'Admin',
    jsonb_build_object('url','/?workspace=academics','workspace','academics','student_id',new.student_id),false)
  on conflict(source_key) do nothing;

  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    student_id,audience_role,action_payload,is_actionable)
  values('report_publication','info','Report card publication approved',
    'A learner report card for '||coalesce(v_class_name,'your assigned class')||
      ' was approved for publication. Check the academic workspace.',
    'academics','report-publication:'||new.id::text||':teacher',new.id,new.student_id,'Teacher',
    jsonb_build_object('url','/?workspace=academics','workspace','academics','student_id',new.student_id),false)
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_report_publication_notification on public.report_card_publications;
create trigger school_report_publication_notification
after insert on public.report_card_publications
for each row execute function public.notify_school_report_publication();
revoke all on function public.notify_school_report_publication() from public,anon,authenticated;

-- Every newly approved learner bursary has an auditable admin notification.
create or replace function public.notify_school_bursary_award()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_name text; v_code text;
begin
  select concat_ws(' ',s.first_name,s.middle_name,s.last_name),s.admission_number
    into v_name,v_code from public.students s where s.id=new.student_id;
  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    student_id,audience_role,action_payload,is_actionable)
  values('bursary_award','info','Bursary award recorded',
    'A bursary award of UGX '||to_char(new.amount_payable_ugx,'FM999,999,999,999,990')||
      ' was recorded for '||coalesce(v_name,'a learner')||' ('||coalesce(v_code,'learner code pending')||').',
    'finance','bursary-award:'||new.id::text,new.id,new.student_id,'Admin',
    jsonb_build_object('url','/?workspace=finance','workspace','finance','student_id',new.student_id),false)
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_bursary_award_notification on public.learner_bursary_awards;
create trigger school_bursary_award_notification
after insert on public.learner_bursary_awards
for each row execute function public.notify_school_bursary_award();
revoke all on function public.notify_school_bursary_award() from public,anon,authenticated;

-- App Centre entries for the central centres. The role rules are enforced twice:
-- here in the registry and again by each page's own authentication/RLS checks.
insert into public.school_apps(app_key,name,description,category,icon,app_url,app_kind,
  allowed_roles,allowed_job_titles,sort_order,is_active)
values
 ('notification-centre','Notification Centre',
  'Live school alerts, admission enquiries, approvals, evidence submissions and action history.',
  'School','bell','/notifications.html','Internal',
  array['Admin','Teacher','Staff']::text[],array[]::text[],15,true),
 ('records-centre','Records Centre',
  'Searchable private school document index with OCR text, source links, verification and expiry tracking.',
  'School','file-search','/records.html','Internal',
  array['Admin']::text[],array[]::text[],16,true)
on conflict(app_key) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  icon=excluded.icon,app_url=excluded.app_url,app_kind=excluded.app_kind,
  allowed_roles=excluded.allowed_roles,allowed_job_titles=excluded.allowed_job_titles,
  sort_order=excluded.sort_order,is_active=true;
