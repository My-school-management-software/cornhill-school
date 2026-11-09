-- CORNHILL: event-driven notifications and a searchable, expiry-aware document index.
-- Evidence blobs stay in the existing private bucket. The index references them;
-- it does not create another copy of the underlying file.

create table if not exists public.school_record_index (
  id uuid primary key default gen_random_uuid(),
  evidence_file_id uuid not null references public.evidence_capture_files(id) on delete cascade,
  request_id uuid not null references public.evidence_capture_requests(id) on delete cascade,
  record_type text not null,
  record_title text not null,
  source_context_type text,
  source_record_id text,
  original_file_name text not null,
  record_identifier text,
  issuing_authority text,
  issued_on date,
  expires_on date,
  extracted_text text not null default '',
  extracted_fields jsonb not null default '{}'::jsonb,
  ocr_status text not null default 'Not started'
    check (ocr_status = any(array['Not started','Processing','Completed','Needs review','Failed']::text[])),
  verification_status text not null default 'Pending'
    check (verification_status = any(array['Pending','Verified','Rejected','Archived']::text[])),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_record_index_extracted_fields_object
    check (jsonb_typeof(extracted_fields) = 'object'),
  constraint school_record_index_identifier_length
    check (record_identifier is null or length(record_identifier) <= 120),
  constraint school_record_index_notes_length
    check (notes is null or length(notes) <= 2000)
);

create unique index if not exists school_record_index_file_unique
  on public.school_record_index(evidence_file_id);
create index if not exists school_record_index_expiry_idx
  on public.school_record_index(expires_on)
  where expires_on is not null and verification_status <> 'Archived';
create index if not exists school_record_index_context_idx
  on public.school_record_index(source_context_type, source_record_id);
create index if not exists school_record_index_type_created_idx
  on public.school_record_index(record_type, created_at desc);
create index if not exists school_record_index_ocr_search_idx
  on public.school_record_index using gin (to_tsvector('simple', coalesce(extracted_text,'')));

alter table public.school_record_index enable row level security;
revoke all on public.school_record_index from public, anon, authenticated;
grant select, update on public.school_record_index to authenticated;
drop policy if exists "Administrators read school record index" on public.school_record_index;
create policy "Administrators read school record index"
  on public.school_record_index for select to authenticated
  using ((select public.is_school_admin()));
drop policy if exists "Administrators update school record index" on public.school_record_index;
create policy "Administrators update school record index"
  on public.school_record_index for update to authenticated
  using ((select public.is_school_admin()))
  with check ((select public.is_school_admin()));

create or replace function public.touch_school_record_index_updated_at()
returns trigger language plpgsql set search_path=''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
drop trigger if exists school_record_index_touch_updated_at on public.school_record_index;
create trigger school_record_index_touch_updated_at
before update on public.school_record_index
for each row execute function public.touch_school_record_index_updated_at();

create or replace function public.index_school_evidence_file()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_request public.evidence_capture_requests%rowtype;
begin
  select * into v_request
  from public.evidence_capture_requests r
  where r.id=new.request_id;
  if not found then
    raise exception 'Evidence request not found for uploaded file';
  end if;

  insert into public.school_record_index(
    evidence_file_id,request_id,record_type,record_title,
    source_context_type,source_record_id,original_file_name,created_by
  )
  values(
    new.id,new.request_id,coalesce(v_request.purpose,'General document'),
    coalesce(nullif(btrim(v_request.context_label),''),new.original_file_name),
    v_request.context_type,v_request.context_record_id,new.original_file_name,new.uploaded_by
  )
  on conflict(evidence_file_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists evidence_file_auto_record_index on public.evidence_capture_files;
create trigger evidence_file_auto_record_index
after insert on public.evidence_capture_files
for each row execute function public.index_school_evidence_file();
revoke all on function public.index_school_evidence_file() from public,anon,authenticated;
revoke all on function public.touch_school_record_index_updated_at() from public,anon,authenticated;

-- Backfill the index for evidence that was already captured before this upgrade.
insert into public.school_record_index(
  evidence_file_id,request_id,record_type,record_title,
  source_context_type,source_record_id,original_file_name,created_by,created_at
)
select f.id,f.request_id,coalesce(r.purpose,'General document'),
       coalesce(nullif(btrim(r.context_label),''),f.original_file_name),
       r.context_type,r.context_record_id,f.original_file_name,f.uploaded_by,f.created_at
from public.evidence_capture_files f
join public.evidence_capture_requests r on r.id=f.request_id
on conflict(evidence_file_id) do nothing;

-- OCR text is submitted by the staff member who uploaded the file, or by an administrator.
create or replace function public.save_school_record_ocr_text(
  p_evidence_file_id uuid,
  p_extracted_text text,
  p_extracted_fields jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_uploader uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required' using errcode='42501';
  end if;
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
revoke all on function public.save_school_record_ocr_text(uuid,text,jsonb) from public,anon;
grant execute on function public.save_school_record_ocr_text(uuid,text,jsonb) to authenticated;

-- Generate expiry warnings from the document register. Calling this is idempotent:
-- each document/expiry-date/stage produces no more than one notification.
create or replace function public.refresh_school_record_expiry_notifications()
returns integer language plpgsql security definer set search_path=''
as $function$
declare v_count integer := 0;
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only administrators can refresh document expiry alerts' using errcode='42501';
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
    x.id,
    'Admin',
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
revoke all on function public.refresh_school_record_expiry_notifications() from public,anon;
grant execute on function public.refresh_school_record_expiry_notifications() to authenticated;

-- Public parent enquiries must enter the school attention queue immediately.
create or replace function public.notify_school_admission_enquiry()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    audience_role,action_payload,is_actionable
  )
  values(
    'admission_enquiry','warning','New online admission enquiry',
    'A parent/guardian submitted an admission enquiry for '||new.learner_name||
      ' ('||new.class_applied||'). Verify the applicant and complete the school admission checks.',
    'reports','admission-enquiry:'||new.id::text,new.id,
    'Admin',
    jsonb_build_object('url','/school-services.html#admissions','workspace','reports','target_id','admissions'),
    true
  )
  on conflict(source_key) do nothing;
  return new;
end;
$function$;

create or replace function public.notify_school_admission_status_change()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.status is distinct from old.status then
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      audience_role,action_payload,is_actionable
    )
    values(
      'admission_status',
      case when new.status in ('Approved for admission','Registered') then 'info'
           when new.status in ('Not proceeding','Closed') then 'warning'
           else 'warning' end,
      'Admission enquiry status updated',
      'The admission enquiry for '||new.learner_name||' ('||new.class_applied||') is now '||new.status||'.',
      'reports','admission-status:'||new.id::text||':'||new.status,new.id,
      'Admin',
      jsonb_build_object('url','/school-services.html#admissions','workspace','reports','target_id','admissions'),
      true
    )
    on conflict(source_key) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists school_admission_enquiry_notification_insert on public.school_admission_enquiries;
create trigger school_admission_enquiry_notification_insert
after insert on public.school_admission_enquiries
for each row execute function public.notify_school_admission_enquiry();
drop trigger if exists school_admission_enquiry_notification_status on public.school_admission_enquiries;
create trigger school_admission_enquiry_notification_status
after update of status on public.school_admission_enquiries
for each row execute function public.notify_school_admission_status_change();
revoke all on function public.notify_school_admission_enquiry() from public,anon,authenticated;
revoke all on function public.notify_school_admission_status_change() from public,anon,authenticated;

-- A submitted photo or computer-upload request becomes an actionable admin notification.
create or replace function public.notify_school_evidence_submission()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.status='Submitted' and old.status is distinct from new.status then
    insert into public.school_notifications(
      category,severity,title,message,action_workspace,source_key,source_id,
      audience_role,action_payload,is_actionable
    )
    values(
      'evidence_submission','warning','Evidence document received',
      new.purpose||' has been submitted for '||new.context_label||'. Review the original file before approving it.',
      'reports','evidence-submitted:'||new.id::text,new.id,
      'Admin',
      jsonb_build_object('url','/evidence.html?requestId='||new.id::text,'workspace','reports','target_id','recordsVault'),
      true
    )
    on conflict(source_key) do nothing;
  end if;
  return new;
end;
$function$;
drop trigger if exists evidence_request_submission_notification on public.evidence_capture_requests;
create trigger evidence_request_submission_notification
after update of status on public.evidence_capture_requests
for each row execute function public.notify_school_evidence_submission();
revoke all on function public.notify_school_evidence_submission() from public,anon,authenticated;

-- Approval/verification workflows send a pending alert to administrators and a
-- decision alert back to the staff member who originated the request.
create or replace function public.notify_school_bank_transaction_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_severity text; v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    if new.status not in ('Awaiting approval','Awaiting evidence') then return new; end if;
    v_key:='bank-transaction:'||new.id::text||':'||new.status;
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='bank-transaction:'||new.id::text||':'||new.status;
  end if;
  v_title:=case new.status
    when 'Awaiting approval' then 'Bank withdrawal needs approval'
    when 'Awaiting evidence' then 'Bank transaction needs evidence'
    when 'Verified' then 'Bank transaction verified'
    when 'Evidence rejected' then 'Bank evidence requires attention'
    when 'Cancelled' then 'Bank withdrawal cancelled'
    else 'Bank transaction updated' end;
  v_message:=new.transaction_no||' · '||new.direction||' · UGX '||to_char(new.amount_ugx,'FM999,999,999,999,990')||' · '||new.description||'. Status: '||new.status||'.';
  v_severity:=case when new.status='Awaiting approval' then 'urgent'
                   when new.status in ('Awaiting evidence','Evidence rejected') then 'warning' else 'info' end;
  if new.status in ('Awaiting approval','Awaiting evidence') then
    v_audience:='Admin';
  else
    v_recipient:=new.entered_by;
  end if;
  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable
  )
  values('bank_transaction',v_severity,v_title,v_message,'finance',v_key,new.id,
    v_recipient,v_audience,
    jsonb_build_object('workspace','finance','target_id','bankTransactions','bank_transaction_id',new.id),
    new.status in ('Awaiting approval','Awaiting evidence','Evidence rejected'))
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_bank_transaction_notification_insert on public.school_bank_transactions;
create trigger school_bank_transaction_notification_insert
after insert on public.school_bank_transactions
for each row execute function public.notify_school_bank_transaction_event();
drop trigger if exists school_bank_transaction_notification_update on public.school_bank_transactions;
create trigger school_bank_transaction_notification_update
after update of status on public.school_bank_transactions
for each row execute function public.notify_school_bank_transaction_event();
revoke all on function public.notify_school_bank_transaction_event() from public,anon,authenticated;

create or replace function public.notify_school_expense_request_event()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_key text; v_title text; v_message text; v_severity text; v_recipient uuid; v_audience text;
begin
  if tg_op='INSERT' then
    if new.status<>'Awaiting approval' then return new; end if;
    v_key:='expense-request:'||new.id::text||':'||new.status;
  else
    if new.status is not distinct from old.status then return new; end if;
    v_key:='expense-request:'||new.id::text||':'||new.status;
  end if;
  v_title:=case new.status
    when 'Awaiting approval' then 'Expense request needs approval'
    when 'Awaiting evidence' then 'Expense request needs evidence'
    when 'Verified' then 'Expense request verified'
    when 'Evidence rejected' then 'Expense evidence requires attention'
    when 'Cancelled' then 'Expense request cancelled'
    else 'Expense request updated' end;
  v_message:=new.request_no||' · UGX '||to_char(new.amount_ugx,'FM999,999,999,999,990')||' · '||new.description||'. Status: '||new.status||'.';
  v_severity:=case when new.status='Awaiting approval' then 'urgent'
                   when new.status in ('Awaiting evidence','Evidence rejected') then 'warning' else 'info' end;
  if new.status='Awaiting approval' then v_audience:='Admin'; else v_recipient:=new.entered_by; end if;
  insert into public.school_notifications(
    category,severity,title,message,action_workspace,source_key,source_id,
    recipient_user_id,audience_role,action_payload,is_actionable
  )
  values('expense_request',v_severity,v_title,v_message,'finance',v_key,new.id,
    v_recipient,v_audience,
    jsonb_build_object('workspace','finance','target_id','expenseRequests','expense_request_id',new.id),
    new.status in ('Awaiting approval','Awaiting evidence','Evidence rejected'))
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
drop trigger if exists school_expense_request_notification_insert on public.school_expense_requests;
create trigger school_expense_request_notification_insert
after insert on public.school_expense_requests
for each row execute function public.notify_school_expense_request_event();
drop trigger if exists school_expense_request_notification_update on public.school_expense_requests;
create trigger school_expense_request_notification_update
after update of status on public.school_expense_requests
for each row execute function public.notify_school_expense_request_event();
revoke all on function public.notify_school_expense_request_event() from public,anon,authenticated;

-- Keep new functions private; only authenticated callers of the two client RPCs
-- receive execution permission. Trigger functions are not client RPCs.
