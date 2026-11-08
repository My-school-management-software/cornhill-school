-- CORNHILL controlled small-expense request workflow.
-- Additive migration. Existing expenses, payroll and receipts are not rewritten.
-- A request is not posted to the expenditure ledger until evidence is approved.

create table if not exists public.school_finance_operator_limits (
 user_id uuid primary key references public.user_profiles(id) on delete restrict,
 max_single_expense_ugx bigint not null default 0 check(max_single_expense_ugx>=0),
 daily_limit_ugx bigint not null default 0 check(daily_limit_ugx>=0),
 is_enabled boolean not null default false,
 set_by uuid not null references public.user_profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.school_finance_operator_limits enable row level security;
drop policy if exists "Finance limits read own or admin" on public.school_finance_operator_limits;
create policy "Finance limits read own or admin" on public.school_finance_operator_limits
 for select to authenticated using((select public.is_school_admin()) or user_id=(select auth.uid()));
drop policy if exists "Finance limits admin manage" on public.school_finance_operator_limits;
create policy "Finance limits admin manage" on public.school_finance_operator_limits
 for all to authenticated using((select public.is_school_admin())) with check((select public.is_school_admin()));
grant select,insert,update,delete on public.school_finance_operator_limits to authenticated;

create table if not exists public.school_expense_requests (
 id uuid primary key default gen_random_uuid(),
 request_no text not null unique,
 expense_date date not null default (timezone('Africa/Kampala',now()))::date,
 category_id uuid not null references public.expense_categories(id) on delete restrict,
 amount_ugx bigint not null check(amount_ugx>0),
 description text not null check(length(btrim(description)) between 3 and 500),
 payee_name text,
 payment_method text not null check(payment_method in('Cash','Bank transfer','Mobile Money','Cheque','Other')),
 payment_reference text,
 receipt_reference text,
 entered_by uuid not null references public.user_profiles(id),
 status text not null check(status in('Awaiting approval','Awaiting evidence','Verified','Evidence rejected','Cancelled')),
 assigned_device_id uuid references public.evidence_capture_devices(id) on delete restrict,
 approved_by uuid references public.user_profiles(id),
 approved_at timestamptz,
 rejected_by uuid references public.user_profiles(id),
 rejected_at timestamptz,
 verified_by uuid references public.user_profiles(id),
 verified_at timestamptz,
 decision_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status='Awaiting approval' and approved_by is null and approved_at is null)
   or status='Cancelled'
   or (status in('Awaiting evidence','Verified','Evidence rejected') and approved_by is not null and approved_at is not null))
);
create index if not exists school_expense_requests_entered_date_idx on public.school_expense_requests(entered_by,created_at desc);
create index if not exists school_expense_requests_status_idx on public.school_expense_requests(status,created_at desc);

create table if not exists public.school_expense_request_events (
 id uuid primary key default gen_random_uuid(),
 expense_request_id uuid not null references public.school_expense_requests(id) on delete restrict,
 actor_user_id uuid not null references public.user_profiles(id),
 action text not null check(action in('Expense requested','Expense approved','Expense rejected','Evidence verified','Evidence rejected','Evidence re-requested')),
 note text,
 created_at timestamptz not null default now()
);
create index if not exists school_expense_request_events_request_idx on public.school_expense_request_events(expense_request_id,created_at desc);

alter table public.school_expenses add column if not exists expense_request_id uuid references public.school_expense_requests(id) on delete restrict;
create unique index if not exists school_expenses_expense_request_id_uidx on public.school_expenses(expense_request_id) where expense_request_id is not null;
create sequence if not exists public.school_expense_request_seq;
create sequence if not exists public.school_expense_posting_seq;

alter table public.school_expense_requests enable row level security;
alter table public.school_expense_request_events enable row level security;
drop policy if exists "Finance expense categories read" on public.expense_categories;
create policy "Finance expense categories read" on public.expense_categories
 for select to authenticated using((select public.is_school_finance_operator()));
grant select on public.expense_categories to authenticated;
drop policy if exists "Expense requests finance operator read own or admin" on public.school_expense_requests;
create policy "Expense requests finance operator read own or admin" on public.school_expense_requests
 for select to authenticated using((select public.is_school_finance_operator())
   and ((select public.is_school_admin()) or entered_by=(select auth.uid())));
drop policy if exists "Expense request events finance read own or admin" on public.school_expense_request_events;
create policy "Expense request events finance read own or admin" on public.school_expense_request_events
 for select to authenticated using((select public.is_school_finance_operator()) and exists(
   select 1 from public.school_expense_requests r where r.id=expense_request_id
    and ((select public.is_school_admin()) or r.entered_by=(select auth.uid()))));
grant select on public.school_expense_requests,public.school_expense_request_events to authenticated;

create or replace function public.set_school_finance_operator_limit(
 p_user_id uuid,p_max_single_expense_ugx bigint,p_daily_limit_ugx bigint,p_is_enabled boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not public.is_school_admin() then raise exception 'Only an administrator may set bursary spending limits' using errcode='42501'; end if;
 if p_max_single_expense_ugx is null or p_max_single_expense_ugx<0 or p_daily_limit_ugx is null or p_daily_limit_ugx<0 then
  raise exception 'Expense limits must be zero or positive whole-shilling amounts';
 end if;
 if p_is_enabled and (p_max_single_expense_ugx<=0 or p_daily_limit_ugx<=0 or p_max_single_expense_ugx>p_daily_limit_ugx) then
  raise exception 'An enabled limit needs a positive single-expense limit no greater than the daily limit';
 end if;
 if not exists(select 1 from public.user_profiles p where p.id=p_user_id and p.role='Staff'
  and p.employment_status='Active' and lower(btrim(coalesce(p.job_title,''))) in
  ('bursar','school bursar','deputy bursar','deputy school bursar')) then
  raise exception 'Choose an active Bursar or Deputy Bursar staff account';
 end if;
 insert into public.school_finance_operator_limits(user_id,max_single_expense_ugx,daily_limit_ugx,is_enabled,set_by,updated_at)
 values(p_user_id,p_max_single_expense_ugx,p_daily_limit_ugx,p_is_enabled,v_uid,now())
 on conflict(user_id) do update set max_single_expense_ugx=excluded.max_single_expense_ugx,
  daily_limit_ugx=excluded.daily_limit_ugx,is_enabled=excluded.is_enabled,set_by=excluded.set_by,updated_at=now();
end; $$;
revoke all on function public.set_school_finance_operator_limit(uuid,bigint,bigint,boolean) from public,anon;
grant execute on function public.set_school_finance_operator_limit(uuid,bigint,bigint,boolean) to authenticated;

create or replace function public.create_school_expense_request(
 p_expense_date date,p_category_id uuid,p_amount_ugx bigint,p_description text,
 p_payee_name text default null,p_payment_method text default 'Cash',
 p_payment_reference text default null,p_receipt_reference text default null
)
returns table(request_id uuid,request_no text,request_status text)
language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_request_id uuid:=gen_random_uuid(); v_request_no text;
 v_limit public.school_finance_operator_limits%rowtype; v_today_total bigint:=0;
begin
 if v_uid is null or not public.is_school_finance_operator() then raise exception 'Only active administrators and authorised bursary staff can submit an expense request' using errcode='42501'; end if;
 if p_expense_date is null or p_category_id is null or p_amount_ugx is null or p_amount_ugx<=0 then
  raise exception 'Enter the expense date, category and a positive whole-shilling amount';
 end if;
 if length(btrim(coalesce(p_description,'')))<3 then raise exception 'Enter a clear expense purpose'; end if;
 if p_payment_method not in('Cash','Bank transfer','Mobile Money','Cheque','Other') then raise exception 'Choose a valid payment method'; end if;
 if not exists(select 1 from public.expense_categories c where c.id=p_category_id and c.is_active) then raise exception 'Choose an active expense category'; end if;
 if not public.is_school_admin() then
  select * into v_limit from public.school_finance_operator_limits l where l.user_id=v_uid and l.is_enabled;
  if not found or v_limit.max_single_expense_ugx<=0 or v_limit.daily_limit_ugx<=0 then raise exception 'The administrator has not enabled an expense limit for this account'; end if;
  if p_amount_ugx>v_limit.max_single_expense_ugx then raise exception 'This request exceeds your administrator-set single-expense limit'; end if;
  select coalesce(sum(r.amount_ugx),0) into v_today_total from public.school_expense_requests r
   where r.entered_by=v_uid and (r.created_at at time zone 'Africa/Kampala')::date=timezone('Africa/Kampala',now())::date
    and r.status<>'Cancelled';
  if v_today_total+p_amount_ugx>v_limit.daily_limit_ugx then raise exception 'This request would exceed your administrator-set daily expense limit'; end if;
 end if;
 v_request_no:='EXR-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||lpad(nextval('public.school_expense_request_seq')::text,7,'0');
 insert into public.school_expense_requests(id,request_no,expense_date,category_id,amount_ugx,description,payee_name,payment_method,payment_reference,receipt_reference,entered_by,status)
 values(v_request_id,v_request_no,p_expense_date,p_category_id,p_amount_ugx,btrim(p_description),nullif(btrim(coalesce(p_payee_name,'')),''),p_payment_method,nullif(btrim(coalesce(p_payment_reference,'')),''),nullif(btrim(coalesce(p_receipt_reference,'')),''),v_uid,'Awaiting approval');
 insert into public.school_expense_request_events(expense_request_id,actor_user_id,action,note)
 values(v_request_id,v_uid,'Expense requested','Awaiting administrator approval before payment and receipt evidence capture.');
 return query select v_request_id,v_request_no,'Awaiting approval'::text;
end; $$;
revoke all on function public.create_school_expense_request(date,uuid,bigint,text,text,text,text,text) from public,anon;
grant execute on function public.create_school_expense_request(date,uuid,bigint,text,text,text,text,text) to authenticated;

create or replace function public.approve_school_expense_request(p_request_id uuid,p_device_id uuid,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_req public.school_expense_requests%rowtype; v_device record; v_capture_id uuid;
begin
 if v_uid is null or not public.is_school_admin() then raise exception 'Only an administrator may approve a school expense' using errcode='42501'; end if;
 select * into v_req from public.school_expense_requests where id=p_request_id for update;
 if not found or v_req.status<>'Awaiting approval' then raise exception 'This expense is no longer awaiting approval'; end if;
 select d.id,d.assigned_user_id into v_device from public.evidence_capture_devices d where d.id=p_device_id and d.status='Active';
 if not found then raise exception 'Choose an active authorised phone to receive the receipt-photo request'; end if;
 insert into public.evidence_capture_requests(assigned_device_id,assigned_user_id,requested_by,purpose,context_label,context_type,context_record_id,amount_ugx,description)
 values(v_device.id,v_device.assigned_user_id,v_uid,'Expense receipt','Approved expense '||v_req.request_no,'school_expense_request',v_req.id::text,v_req.amount_ugx,
  'After the expense is paid, photograph the original receipt or invoice. Attach every page needed to show the amount, date, supplier and items.')
 returning id into v_capture_id;
 update public.school_expense_requests set status='Awaiting evidence',assigned_device_id=v_device.id,approved_by=v_uid,approved_at=now(),
  decision_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now() where id=v_req.id;
 insert into public.school_expense_request_events(expense_request_id,actor_user_id,action,note)
 values(v_req.id,v_uid,'Expense approved',coalesce(nullif(btrim(coalesce(p_note,'')),''),'Approved; receipt evidence is required before posting to school expenses.'));
 return v_capture_id;
end; $$;
revoke all on function public.approve_school_expense_request(uuid,uuid,text) from public,anon;
grant execute on function public.approve_school_expense_request(uuid,uuid,text) to authenticated;

create or replace function public.reject_school_expense_request(p_request_id uuid,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_req public.school_expense_requests%rowtype;
begin
 if v_uid is null or not public.is_school_admin() then raise exception 'Only an administrator may reject an expense request' using errcode='42501'; end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Enter a rejection reason of at least five characters'; end if;
 select * into v_req from public.school_expense_requests where id=p_request_id for update;
 if not found or v_req.status<>'Awaiting approval' then raise exception 'This expense is no longer awaiting approval'; end if;
 update public.school_expense_requests set status='Cancelled',rejected_by=v_uid,rejected_at=now(),decision_note=btrim(p_note),updated_at=now() where id=v_req.id;
 insert into public.school_expense_request_events(expense_request_id,actor_user_id,action,note)
 values(v_req.id,v_uid,'Expense rejected',btrim(p_note));
end; $$;
revoke all on function public.reject_school_expense_request(uuid,text) from public,anon;
grant execute on function public.reject_school_expense_request(uuid,text) to authenticated;

create or replace function public.reissue_school_expense_evidence(p_request_id uuid,p_device_id uuid,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_req public.school_expense_requests%rowtype; v_device record; v_capture_id uuid;
begin
 if v_uid is null or not public.is_school_admin() then raise exception 'Only an administrator may request replacement expense evidence' using errcode='42501'; end if;
 select * into v_req from public.school_expense_requests where id=p_request_id for update;
 if not found or v_req.status<>'Evidence rejected' then raise exception 'This expense is not awaiting replacement evidence'; end if;
 select d.id,d.assigned_user_id into v_device from public.evidence_capture_devices d where d.id=p_device_id and d.status='Active';
 if not found then raise exception 'Choose an active authorised phone'; end if;
 insert into public.evidence_capture_requests(assigned_device_id,assigned_user_id,requested_by,purpose,context_label,context_type,context_record_id,amount_ugx,description)
 values(v_device.id,v_device.assigned_user_id,v_uid,'Expense receipt','Replacement evidence '||v_req.request_no,'school_expense_request',v_req.id::text,v_req.amount_ugx,
  'Please provide a clearer or replacement receipt image. '||coalesce(nullif(btrim(p_note),''),''))
 returning id into v_capture_id;
 update public.school_expense_requests set status='Awaiting evidence',assigned_device_id=v_device.id,
  decision_note=nullif(btrim(coalesce(p_note,'')),''),verified_by=null,verified_at=null,updated_at=now() where id=v_req.id;
 insert into public.school_expense_request_events(expense_request_id,actor_user_id,action,note)
 values(v_req.id,v_uid,'Evidence re-requested',nullif(btrim(coalesce(p_note,'')),''));
 return v_capture_id;
end; $$;
revoke all on function public.reissue_school_expense_evidence(uuid,uuid,text) from public,anon;
grant execute on function public.reissue_school_expense_evidence(uuid,uuid,text) to authenticated;

create or replace function public.apply_school_expense_evidence_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_capture public.evidence_capture_requests%rowtype; v_request_id uuid; v_req public.school_expense_requests%rowtype; v_expense_no text;
begin
 select * into v_capture from public.evidence_capture_requests where id=new.request_id;
 if not found or v_capture.context_type<>'school_expense_request' or v_capture.context_record_id is null then return new; end if;
 begin v_request_id:=v_capture.context_record_id::uuid; exception when others then return new; end;
 select * into v_req from public.school_expense_requests where id=v_request_id for update;
 if not found or v_req.status<>'Awaiting evidence' then return new; end if;
 if new.action='Approved' then
  update public.school_expense_requests set status='Verified',verified_by=new.reviewed_by,verified_at=now(),
   decision_note=nullif(btrim(coalesce(new.review_note,'')),''),updated_at=now() where id=v_req.id;
  v_expense_no:='EXP-'||to_char(v_req.expense_date,'YYYYMMDD')||'-'||lpad(nextval('public.school_expense_posting_seq')::text,7,'0');
  insert into public.school_expenses(expense_no,expense_date,category_id,description,amount_ugx,payee_name,payment_method,payment_reference,receipt_reference,recorded_by,status,expense_request_id)
  values(v_expense_no,v_req.expense_date,v_req.category_id,v_req.description,v_req.amount_ugx,v_req.payee_name,v_req.payment_method,
   v_req.payment_reference,v_req.receipt_reference,v_req.entered_by,'Posted',v_req.id)
  on conflict(expense_request_id) where expense_request_id is not null do nothing;
  insert into public.school_expense_request_events(expense_request_id,actor_user_id,action,note)
  values(v_req.id,new.reviewed_by,'Evidence verified','Receipt evidence approved; the expense is now posted to the existing school expenditure ledger.');
 else
  update public.school_expense_requests set status='Evidence rejected',decision_note=coalesce(nullif(btrim(coalesce(new.review_note,'')),''),new.action),updated_at=now()
  where id=v_req.id;
  insert into public.school_expense_request_events(expense_request_id,actor_user_id,action,note)
  values(v_req.id,new.reviewed_by,'Evidence rejected',coalesce(nullif(btrim(coalesce(new.review_note,'')),''),new.action));
 end if;
 return new;
end; $$;
revoke all on function public.apply_school_expense_evidence_review() from public,anon,authenticated;
drop trigger if exists evidence_review_posts_school_expense on public.evidence_capture_reviews;
create trigger evidence_review_posts_school_expense after insert on public.evidence_capture_reviews
for each row execute function public.apply_school_expense_evidence_review();
