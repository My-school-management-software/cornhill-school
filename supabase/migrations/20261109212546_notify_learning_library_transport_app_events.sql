-- CORNHILL: cover event notifications for learning resources, library loans and transport assignments.
-- Notification messages intentionally contain no learner names, LINs, guardian numbers or case details.

create or replace function public.notify_school_learning_resource_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_class_name text;
  v_event_key text;
  v_user_id uuid;
begin
  if tg_op='DELETE' then
    update public.school_notifications set resolved_at=coalesce(resolved_at,now())
    where source_id=old.id and category='learning_resource' and resolved_at is null;
    return old;
  end if;

  select c.name into v_class_name from public.school_classes c where c.id=new.class_id;
  v_event_key:='learning-resource:'||new.id::text||':'||
    md5(coalesce(new.title,'')||'|'||coalesce(new.subject,'')||'|'||
        coalesce(new.resource_type,'')||'|'||coalesce(new.instructions,'')||'|'||
        coalesce(new.resource_url,'')||'|'||coalesce(new.created_at::text,''));

  if tg_op='UPDATE' then
    update public.school_notifications set resolved_at=coalesce(resolved_at,now())
    where source_id=new.id and category='learning_resource' and resolved_at is null;
  end if;

  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    audience_role,action_payload,is_actionable
  ) values (
    'learning_resource','info','New class learning resource',
    'A new '||coalesce(new.resource_type,'learning resource')||' for '||
      coalesce(new.subject,'a class subject')||
      case when nullif(btrim(v_class_name),'') is not null then ' in '||v_class_name else '' end||
      ' is available. Open Learning Resources to review it.',
    'learning',v_event_key||':admin',new.id,'Admin',
    jsonb_build_object(
      'url','https://learning-cornhill-school.vercel.app/apps/learning-resources/',
      'workspace','learning','target_id','learning-resources','record_id',new.id
    ),true
  ) on conflict(source_key) do nothing;

  -- Notify the active teacher(s) assigned to this class, not all teachers.
  for v_user_id in
    select distinct a.user_id
    from public.class_teacher_access a
    join public.user_profiles p on p.id=a.user_id
    where a.class_id=new.class_id and p.role='Teacher'
      and coalesce(p.employment_status,'Active')='Active'
      and p.id is distinct from new.created_by
  loop
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      recipient_user_id,action_payload,is_actionable
    ) values (
      'learning_resource','info','New resource for your assigned class',
      'A new '||coalesce(new.resource_type,'learning resource')||' for '||
        coalesce(new.subject,'a subject')||
        ' is available in your assigned class. Open Learning Resources to review it.',
      'learning',v_event_key||':'||v_user_id::text,new.id,v_user_id,
      jsonb_build_object(
        'url','https://learning-cornhill-school.vercel.app/apps/learning-resources/',
        'workspace','learning','target_id','learning-resources','record_id',new.id
      ),true
    ) on conflict(source_key) do nothing;
  end loop;
  return new;
end;
$function$;

drop trigger if exists school_learning_resource_notification on public.school_learning_resources;
create trigger school_learning_resource_notification
after insert or update or delete on public.school_learning_resources
for each row execute function public.notify_school_learning_resource_event();
revoke all on function public.notify_school_learning_resource_event() from public,anon,authenticated;

create or replace function public.notify_school_library_loan_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_status text;
  v_user_id uuid;
  v_event_key text;
  v_message text;
begin
  if tg_op='DELETE' then
    update public.school_notifications set resolved_at=coalesce(resolved_at,now())
    where source_id=old.id and category='library_loan' and resolved_at is null;
    return old;
  end if;

  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;

  v_status:=coalesce(new.status,'Updated');
  v_event_key:='library-loan:'||new.id::text||':'||v_status;
  v_message:=case
    when v_status='Issued' then 'A library book was issued. Open Library Management to review the loan record.'
    when v_status='Returned' then 'A library book was returned. Open Library Management to review the loan record.'
    else 'A library loan record changed to '||v_status||'. Open Library Management to review it.'
  end;

  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    audience_role,action_payload,is_actionable
  ) values (
    'library_loan','info',
    case when v_status='Issued' then 'Library book issued'
         when v_status='Returned' then 'Library book returned'
         else 'Library loan updated' end,
    v_message,'library',v_event_key||':admin',new.id,'Admin',
    jsonb_build_object(
      'url','https://library-cornhill-school.vercel.app/apps/school-library/',
      'workspace','library','target_id','library','record_id',new.id
    ),true
  ) on conflict(source_key) do nothing;

  -- Notify active library operators and a staff borrower, when applicable.
  for v_user_id in
    select p.id
    from public.user_profiles p
    where coalesce(p.employment_status,'Active')='Active'
      and lower(btrim(coalesce(p.job_title,'')))=any(array['librarian','library manager','library officer']::text[])
  loop
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      recipient_user_id,action_payload,is_actionable
    ) values (
      'library_loan','info','Library activity needs review',v_message,'library',
      v_event_key||':operator:'||v_user_id::text,new.id,v_user_id,
      jsonb_build_object(
        'url','https://library-cornhill-school.vercel.app/apps/school-library/',
        'workspace','library','target_id','library','record_id',new.id
      ),true
    ) on conflict(source_key) do nothing;
  end loop;

  if new.borrower_user_id is not null then
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      recipient_user_id,action_payload,is_actionable
    ) values (
      'library_loan','info',
      case when v_status='Issued' then 'Library loan recorded' else 'Library loan updated' end,
      case when v_status='Issued' then 'A library loan has been recorded against your staff account.'
           else 'Your library loan status is now '||v_status||'.' end,
      'library',v_event_key||':borrower:'||new.borrower_user_id::text,new.id,new.borrower_user_id,
      jsonb_build_object(
        'url','https://library-cornhill-school.vercel.app/apps/school-library/',
        'workspace','library','target_id','library','record_id',new.id
      ),false
    ) on conflict(source_key) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists school_library_loan_notification on public.school_library_loans;
create trigger school_library_loan_notification
after insert or update of status or delete on public.school_library_loans
for each row execute function public.notify_school_library_loan_event();
revoke all on function public.notify_school_library_loan_event() from public,anon,authenticated;

create or replace function public.notify_school_transport_assignment_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_driver uuid;
  v_user_id uuid;
  v_event_key text;
  v_status text;
begin
  if tg_op='DELETE' then
    update public.school_notifications set resolved_at=coalesce(resolved_at,now())
    where source_id=old.id and category='transport_assignment' and resolved_at is null;
    return old;
  end if;

  if tg_op='UPDATE' and new.status is not distinct from old.status
     and new.route_id is not distinct from old.route_id then return new; end if;

  v_status:=coalesce(new.status,'Updated');
  select r.driver_user_id into v_driver
  from public.school_transport_routes r where r.id=new.route_id;
  v_event_key:='transport-assignment:'||new.id::text||':'||
    coalesce(new.route_id::text,'no-route')||':'||v_status;

  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    audience_role,action_payload,is_actionable
  ) values (
    'transport_assignment','warning','School transport assignment updated',
    'A school transport assignment has been created or updated. Open School Transport to review the route and register.',
    'transport',v_event_key||':admin',new.id,'Admin',
    jsonb_build_object(
      'url','https://transport-cornhill-school.vercel.app/apps/school-transport/',
      'workspace','transport','target_id','transport','record_id',new.id
    ),true
  ) on conflict(source_key) do nothing;

  for v_user_id in
    select p.id from public.user_profiles p
    where coalesce(p.employment_status,'Active')='Active'
      and lower(btrim(coalesce(p.job_title,'')))=any(array['transport manager','transport officer','driver','bus driver']::text[])
  loop
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      recipient_user_id,action_payload,is_actionable
    ) values (
      'transport_assignment','warning','School transport update',
      'A school transport assignment has been created or updated. Open School Transport to review the route and register.',
      'transport',v_event_key||':operator:'||v_user_id::text,new.id,v_user_id,
      jsonb_build_object(
        'url','https://transport-cornhill-school.vercel.app/apps/school-transport/',
        'workspace','transport','target_id','transport','record_id',new.id
      ),true
    ) on conflict(source_key) do nothing;
  end loop;

  if v_driver is not null then
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      recipient_user_id,action_payload,is_actionable
    ) values (
      'transport_assignment','warning','Your transport route has an assignment update',
      'A learner assignment on a route assigned to you has changed. Open School Transport to review the current duty information.',
      'transport',v_event_key||':driver:'||v_driver::text,new.id,v_driver,
      jsonb_build_object(
        'url','https://transport-cornhill-school.vercel.app/apps/school-transport/',
        'workspace','transport','target_id','transport','record_id',new.id
      ),true
    ) on conflict(source_key) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists school_transport_assignment_notification on public.school_transport_assignments;
create trigger school_transport_assignment_notification
after insert or update of status,route_id or delete on public.school_transport_assignments
for each row execute function public.notify_school_transport_assignment_event();
revoke all on function public.notify_school_transport_assignment_event() from public,anon,authenticated;
