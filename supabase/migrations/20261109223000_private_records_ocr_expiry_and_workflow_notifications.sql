-- CORNHILL records vault hardening, expiry scheduling and HR workflow notifications.
-- Keep privileged OCR/expiry code behind the non-exposed private schema.
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create or replace function private.generate_school_record_expiry_notifications()
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_count integer := 0;
begin
  if auth.uid() is not null and not coalesce(public.is_school_admin(),false) then
    raise exception 'Only administrators can generate document expiry alerts' using errcode='42501';
  end if;
  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    audience_role,action_payload,is_actionable
  )
  select
    'document_expiry',
    case when x.expires_on < current_date then 'urgent' else 'warning' end,
    case when x.expires_on < current_date then 'School document expired' else 'School document expiring soon' end,
    x.record_title||' ('||x.record_type||') '||
      case when x.expires_on < current_date
        then 'expired on '||to_char(x.expires_on,'DD Mon YYYY')||'. Check the original record and arrange a valid replacement.'
        else 'expires on '||to_char(x.expires_on,'DD Mon YYYY')||'. Arrange renewal before the expiry date.'
      end,
    'reports',
    'record-expiry:'||x.id::text||':'||case when x.expires_on < current_date then 'expired' else 'due' end||':'||x.expires_on::text,
    x.id,'Admin',
    jsonb_build_object('workspace','reports','target_id','recordsVault','record_index_id',x.id),
    true
  from public.school_record_index x
  where x.expires_on is not null
    and x.verification_status <> 'Archived'
    and x.expires_on <= current_date + 30
  on conflict(source_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function private.generate_school_record_expiry_notifications() from public,anon;
grant execute on function private.generate_school_record_expiry_notifications() to authenticated;

create or replace function public.refresh_school_record_expiry_notifications()
returns integer language plpgsql security invoker set search_path=''
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only administrators can refresh document expiry alerts' using errcode='42501';
  end if;
  return private.generate_school_record_expiry_notifications();
end;
$function$;
revoke all on function public.refresh_school_record_expiry_notifications() from public,anon;
grant execute on function public.refresh_school_record_expiry_notifications() to authenticated;

create or replace function private.save_school_record_ocr_text(
  p_evidence_file_id uuid,
  p_extracted_text text,
  p_extracted_fields jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_uploader uuid;
begin
  if auth.uid() is null then raise exception 'Sign-in required' using errcode='42501'; end if;
  select f.uploaded_by into v_uploader
    from public.evidence_capture_files f
    where f.id=p_evidence_file_id;
  if not found then raise exception 'Evidence file not found'; end if;
  if v_uploader is distinct from auth.uid()
     and not coalesce(public.is_school_admin(),false) then
    raise exception 'You may only save OCR results for a file you uploaded' using errcode='42501';
  end if;
  if p_extracted_fields is not null and jsonb_typeof(p_extracted_fields)<>'object' then
    raise exception 'Extracted fields must be a JSON object';
  end if;
  update public.school_record_index
    set extracted_text=left(coalesce(p_extracted_text,''),200000),
        extracted_fields=coalesce(p_extracted_fields,'{}'::jsonb),
        ocr_status=case when length(btrim(coalesce(p_extracted_text,'')))>0 then 'Completed' else 'Needs review' end
    where evidence_file_id=p_evidence_file_id;
  if not found then raise exception 'Document index entry not found'; end if;
end;
$function$;
revoke all on function private.save_school_record_ocr_text(uuid,text,jsonb) from public,anon;
grant execute on function private.save_school_record_ocr_text(uuid,text,jsonb) to authenticated;

create or replace function public.save_school_record_ocr_text(
  p_evidence_file_id uuid,
  p_extracted_text text,
  p_extracted_fields jsonb default '{}'::jsonb
)
returns void language plpgsql security invoker set search_path=''
as $function$
begin
  if auth.uid() is null then raise exception 'Sign-in required' using errcode='42501'; end if;
  perform private.save_school_record_ocr_text(p_evidence_file_id,p_extracted_text,p_extracted_fields);
end;
$function$;
revoke all on function public.save_school_record_ocr_text(uuid,text,jsonb) from public,anon;
grant execute on function public.save_school_record_ocr_text(uuid,text,jsonb) to authenticated;

-- A separate administrator-side summary refresh is also run every day at
-- 07:00 Africa/Kampala (04:00 UTC), independently of the browser session.
do $block$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='cornhill-document-expiry-alerts' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end
$block$;
select cron.schedule(
  'cornhill-document-expiry-alerts',
  '0 4 * * *',
  'select private.generate_school_record_expiry_notifications();'
);

-- Staff leave requests and administrator decisions belong in the same notification
-- system as admissions, banking, expenses and evidence submissions.
create or replace function public.notify_school_staff_leave_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_staff_name text;
  v_key text;
  v_title text;
  v_message text;
  v_severity text;
  v_recipient uuid;
  v_audience text;
begin
  select p.full_name into v_staff_name
    from public.user_profiles p where p.id=new.staff_user_id;

  if tg_op='INSERT' then
    if new.status<>'Pending' then return new; end if;
    v_key:='staff-leave-request:'||new.id::text||':Pending';
    v_title:='Staff leave request needs approval';
    v_message:=coalesce(v_staff_name,'A staff member')||' submitted a '||new.leave_type||
      ' leave request from '||to_char(new.start_date,'DD Mon YYYY')||
      ' to '||to_char(new.end_date,'DD Mon YYYY')||'.';
    v_severity:='warning';
    v_audience:='Admin';
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='staff-leave-decision:'||new.id::text||':'||new.status;
    v_title:='Your leave request was updated';
    v_message:='Your '||new.leave_type||' leave request ('||
      to_char(new.start_date,'DD Mon YYYY')||' to '||
      to_char(new.end_date,'DD Mon YYYY')||') is now '||new.status||
      case when nullif(btrim(new.decision_note),'') is not null then '. Note: '||new.decision_note else '.' end;
    v_severity:=case when new.status='Approved' then 'info' else 'warning' end;
    v_recipient:=new.staff_user_id;
  end if;

  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable
  )
  values(
    case when tg_op='INSERT' then 'staff_leave_request' else 'staff_leave_decision' end,
    v_severity,v_title,v_message,'reports',v_key,new.id,
    v_recipient,v_audience,
    jsonb_build_object('url','/school-services.html#hr-payroll','workspace','reports','target_id','hr-payroll'),
    tg_op='INSERT'
  )
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
revoke all on function public.notify_school_staff_leave_event() from public,anon,authenticated;
drop trigger if exists school_staff_leave_notification_insert on public.school_hr_leave_requests;
create trigger school_staff_leave_notification_insert
after insert on public.school_hr_leave_requests
for each row execute function public.notify_school_staff_leave_event();
drop trigger if exists school_staff_leave_notification_update on public.school_hr_leave_requests;
create trigger school_staff_leave_notification_update
after update of status on public.school_hr_leave_requests
for each row execute function public.notify_school_staff_leave_event();

-- Remove the redundant older descending-created-at index on admissions.
drop index if exists public.school_admission_enquiries_created_at_desc_idx;
