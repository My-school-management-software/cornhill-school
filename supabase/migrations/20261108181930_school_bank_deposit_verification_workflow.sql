-- CORNHILL bank accounts, daily deposit register and evidence-linked withdrawal workflow.
-- Reconstructed from the connected project's applied schema and function definitions.
-- Additive only: does not seed accounts or financial transactions.
create sequence if not exists public.school_bank_transaction_seq;

create table if not exists public.school_bank_accounts(
 id uuid primary key default gen_random_uuid(),
 account_label text not null check(length(btrim(account_label)) between 2 and 100),
 bank_name text not null check(length(btrim(bank_name)) between 2 and 100),
 account_name text not null check(length(btrim(account_name)) between 2 and 120),
 account_number_last4 text check(account_number_last4 is null or account_number_last4 ~ '^[0-9]{4}$'),
 opening_balance_ugx bigint not null default 0 check(opening_balance_ugx>=0),
 is_active boolean not null default true,
 created_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists school_bank_accounts_active_idx on public.school_bank_accounts(is_active,account_label);

create table if not exists public.school_bank_transactions(
 id uuid primary key default gen_random_uuid(),
 transaction_no text not null unique,
 bank_account_id uuid not null references public.school_bank_accounts(id) on delete restrict,
 direction text not null check(direction in('Deposit','Withdrawal')),
 transaction_date date not null default (timezone('Africa/Kampala',now()))::date,
 amount_ugx bigint not null check(amount_ugx>0),
 description text not null check(length(btrim(description)) between 3 and 500),
 bank_reference text,
 payee_name text,
 status text not null check(status in('Awaiting approval','Awaiting evidence','Verified','Evidence rejected','Cancelled')),
 entered_by uuid not null references public.user_profiles(id),
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
 constraint school_bank_transactions_check
  check((direction='Deposit' and status<>'Awaiting approval') or direction='Withdrawal')
);
create index if not exists school_bank_transactions_account_date_idx
 on public.school_bank_transactions(bank_account_id,transaction_date desc,created_at desc);
create index if not exists school_bank_transactions_status_idx
 on public.school_bank_transactions(status,direction,created_at desc);

create table if not exists public.school_bank_transaction_events(
 id uuid primary key default gen_random_uuid(),
 bank_transaction_id uuid not null references public.school_bank_transactions(id) on delete restrict,
 actor_user_id uuid not null references public.user_profiles(id),
 action text not null check(action in(
  'Deposit entered','Withdrawal requested','Withdrawal approved','Withdrawal rejected',
  'Evidence verified','Evidence rejected','Evidence re-requested'
 )),
 note text,
 created_at timestamptz not null default now()
);
create index if not exists school_bank_transaction_events_txn_idx
 on public.school_bank_transaction_events(bank_transaction_id,created_at desc);

alter table public.school_bank_accounts enable row level security;
alter table public.school_bank_transactions enable row level security;
alter table public.school_bank_transaction_events enable row level security;

drop policy if exists "Bank accounts admin manage" on public.school_bank_accounts;
create policy "Bank accounts admin manage" on public.school_bank_accounts
 for all to authenticated using((select public.is_school_admin()))
 with check((select public.is_school_admin()));
drop policy if exists "Bank accounts finance operator read" on public.school_bank_accounts;
create policy "Bank accounts finance operator read" on public.school_bank_accounts
 for select to authenticated using((select public.is_school_finance_operator()));

drop policy if exists "Bank transactions admin update" on public.school_bank_transactions;
create policy "Bank transactions admin update" on public.school_bank_transactions
 for update to authenticated using((select public.is_school_admin()))
 with check((select public.is_school_admin()));
drop policy if exists "Bank transactions finance operator insert own" on public.school_bank_transactions;
create policy "Bank transactions finance operator insert own" on public.school_bank_transactions
 for insert to authenticated with check(
  (select public.is_school_finance_operator()) and entered_by=(select auth.uid())
 );
drop policy if exists "Bank transactions finance operator read" on public.school_bank_transactions;
create policy "Bank transactions finance operator read" on public.school_bank_transactions
 for select to authenticated using((select public.is_school_finance_operator()));

drop policy if exists "Bank events finance operator read" on public.school_bank_transaction_events;
create policy "Bank events finance operator read" on public.school_bank_transaction_events
 for select to authenticated using((select public.is_school_finance_operator()));

grant select,insert,update on public.school_bank_accounts to authenticated;
grant select,insert,update on public.school_bank_transactions to authenticated;
grant select on public.school_bank_transaction_events to authenticated;

create or replace function public.is_school_finance_operator()
returns boolean
language sql
stable
set search_path=''
as $$
 select exists(
  select 1 from public.user_profiles p
  where p.id=(select auth.uid())
   and coalesce(p.employment_status,'Active')='Active'
   and (
    p.role='Admin'
    or (p.role='Staff' and lower(btrim(coalesce(p.job_title,''))) in
      ('bursar','school bursar','deputy bursar','deputy school bursar'))
   )
 );
$$;
revoke all on function public.is_school_finance_operator() from public,anon;
grant execute on function public.is_school_finance_operator() to authenticated;

create or replace function public.create_school_bank_transaction(
 p_bank_account_id uuid,p_direction text,p_transaction_date date,p_amount_ugx bigint,
 p_description text,p_bank_reference text default null,p_payee_name text default null,p_device_id uuid default null
)
returns table(transaction_id uuid,transaction_no text,transaction_status text,evidence_request_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
 v_uid uuid:=auth.uid();
 v_txn_id uuid:=gen_random_uuid();
 v_txn_no text;
 v_status text;
 v_device_id uuid;
 v_assigned_user_id uuid;
 v_request_id uuid:=null;
begin
 if v_uid is null or not public.is_school_finance_operator() then
  raise exception 'Only active administrators and authorised bursary staff can record bank transactions' using errcode='42501';
 end if;
 if p_direction not in('Deposit','Withdrawal') then raise exception 'Choose Deposit or Withdrawal'; end if;
 if p_bank_account_id is null or not exists(select 1 from public.school_bank_accounts a where a.id=p_bank_account_id and a.is_active) then
  raise exception 'Choose an active school bank account';
 end if;
 if p_transaction_date is null or p_amount_ugx is null or p_amount_ugx<=0 then
  raise exception 'Enter a valid transaction date and a positive whole-shilling amount';
 end if;
 if length(btrim(coalesce(p_description,'')))<3 then raise exception 'Enter a clear transaction description'; end if;
 if p_direction='Deposit' then
  if p_device_id is null then raise exception 'Choose an authorised phone for the deposit slip photo'; end if;
  select d.id,d.assigned_user_id into v_device_id,v_assigned_user_id
   from public.evidence_capture_devices d where d.id=p_device_id and d.status='Active';
  if not found then raise exception 'The selected phone is not active or authorised'; end if;
  if not public.is_school_admin() and v_assigned_user_id<>v_uid then
   raise exception 'Bursary staff can only send deposit-photo requests to their own authorised phone' using errcode='42501';
  end if;
  v_status:='Awaiting evidence';
 else
  v_device_id:=null;
  v_assigned_user_id:=null;
  v_status:='Awaiting approval';
 end if;
 v_txn_no:='BNK-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||lpad(nextval('public.school_bank_transaction_seq')::text,7,'0');
 insert into public.school_bank_transactions(
  id,transaction_no,bank_account_id,direction,transaction_date,amount_ugx,description,
  bank_reference,payee_name,status,entered_by,assigned_device_id
 ) values(
  v_txn_id,v_txn_no,p_bank_account_id,p_direction,p_transaction_date,p_amount_ugx,btrim(p_description),
  nullif(btrim(coalesce(p_bank_reference,'')),''),nullif(btrim(coalesce(p_payee_name,'')),''),v_status,v_uid,v_device_id
 );
 if p_direction='Deposit' then
  insert into public.evidence_capture_requests(
   assigned_device_id,assigned_user_id,requested_by,purpose,context_label,
   context_type,context_record_id,amount_ugx,description
  ) values(
   v_device_id,v_assigned_user_id,v_uid,'Bank deposit slip',
   'Bank deposit '||v_txn_no,'bank_transaction',v_txn_id::text,p_amount_ugx,
   'Photograph the bank-issued deposit slip. Make sure the bank, date, amount and transaction reference can be read. You may attach more than one page.'
  ) returning id into v_request_id;
  insert into public.school_bank_transaction_events(bank_transaction_id,actor_user_id,action,note)
  values(v_txn_id,v_uid,'Deposit entered','Deposit recorded; waiting for bank slip evidence and administrator verification.');
 else
  insert into public.school_bank_transaction_events(bank_transaction_id,actor_user_id,action,note)
  values(v_txn_id,v_uid,'Withdrawal requested','Withdrawal is not included in the verified bank balance until authorised and evidence is approved.');
 end if;
 return query select v_txn_id,v_txn_no,v_status,v_request_id;
end;
$$;
revoke all on function public.create_school_bank_transaction(uuid,text,date,bigint,text,text,text,uuid) from public,anon;
grant execute on function public.create_school_bank_transaction(uuid,text,date,bigint,text,text,text,uuid) to authenticated;

create or replace function public.approve_school_bank_withdrawal(
 p_transaction_id uuid,p_device_id uuid,p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 v_uid uuid:=auth.uid();
 v_txn public.school_bank_transactions%rowtype;
 v_device record;
 v_request_id uuid;
begin
 if v_uid is null or not public.is_school_admin() then raise exception 'Only an administrator may approve a bank withdrawal' using errcode='42501'; end if;
 select * into v_txn from public.school_bank_transactions where id=p_transaction_id for update;
 if not found or v_txn.direction<>'Withdrawal' or v_txn.status<>'Awaiting approval' then
  raise exception 'This withdrawal is no longer awaiting approval';
 end if;
 select d.id,d.assigned_user_id into v_device from public.evidence_capture_devices d
  where d.id=p_device_id and d.status='Active';
 if not found then raise exception 'Choose an active authorised phone for the withdrawal evidence'; end if;
 insert into public.evidence_capture_requests(
  assigned_device_id,assigned_user_id,requested_by,purpose,context_label,
  context_type,context_record_id,amount_ugx,description
 ) values(
  v_device.id,v_device.assigned_user_id,v_uid,'Withdrawal evidence',
  'Approved withdrawal '||v_txn.transaction_no,'bank_transaction',v_txn.id::text,v_txn.amount_ugx,
  'Photograph the withdrawal slip and all supporting receipts or documents. Attach multiple pages if needed.'
 ) returning id into v_request_id;
 update public.school_bank_transactions set
  status='Awaiting evidence',assigned_device_id=v_device.id,
  approved_by=v_uid,approved_at=now(),decision_note=nullif(btrim(coalesce(p_note,'')),''),
  updated_at=now()
 where id=v_txn.id;
 insert into public.school_bank_transaction_events(bank_transaction_id,actor_user_id,action,note)
 values(v_txn.id,v_uid,'Withdrawal approved',nullif(btrim(coalesce(p_note,'')),''));
 return v_request_id;
end;
$$;
revoke all on function public.approve_school_bank_withdrawal(uuid,uuid,text) from public,anon;
grant execute on function public.approve_school_bank_withdrawal(uuid,uuid,text) to authenticated;

create or replace function public.reissue_school_bank_evidence(
 p_transaction_id uuid,p_device_id uuid,p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_txn public.school_bank_transactions%rowtype; v_device record; v_request_id uuid;
begin
 if v_uid is null or not public.is_school_admin() then raise exception 'Only an administrator may request replacement evidence' using errcode='42501'; end if;
 select * into v_txn from public.school_bank_transactions where id=p_transaction_id for update;
 if not found or v_txn.status<>'Evidence rejected' then raise exception 'This transaction is not awaiting replacement evidence'; end if;
 select d.id,d.assigned_user_id into v_device from public.evidence_capture_devices d where d.id=p_device_id and d.status='Active';
 if not found then raise exception 'Choose an active authorised phone'; end if;
 insert into public.evidence_capture_requests(
  assigned_device_id,assigned_user_id,requested_by,purpose,context_label,
  context_type,context_record_id,amount_ugx,description
 ) values(
  v_device.id,v_device.assigned_user_id,v_uid,
  case when v_txn.direction='Deposit' then 'Bank deposit slip' else 'Withdrawal evidence' end,
  'Replacement evidence '||v_txn.transaction_no,'bank_transaction',v_txn.id::text,v_txn.amount_ugx,
  'Please provide replacement or clearer evidence. '||coalesce(nullif(btrim(p_note),''),'')
 ) returning id into v_request_id;
 update public.school_bank_transactions set
  status='Awaiting evidence',assigned_device_id=v_device.id,decision_note=nullif(btrim(coalesce(p_note,'')),''),
  verified_by=null,verified_at=null,updated_at=now()
 where id=v_txn.id;
 insert into public.school_bank_transaction_events(bank_transaction_id,actor_user_id,action,note)
 values(v_txn.id,v_uid,'Evidence re-requested',nullif(btrim(coalesce(p_note,'')),''));
 return v_request_id;
end;
$$;
revoke all on function public.reissue_school_bank_evidence(uuid,uuid,text) from public,anon;
grant execute on function public.reissue_school_bank_evidence(uuid,uuid,text) to authenticated;

create or replace function public.apply_bank_evidence_review_to_transaction()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_request public.evidence_capture_requests%rowtype; v_txn_id uuid; v_action text;
begin
 select * into v_request from public.evidence_capture_requests where id=new.request_id;
 if not found or v_request.context_type<>'bank_transaction' or v_request.context_record_id is null then return new; end if;
 begin v_txn_id:=v_request.context_record_id::uuid; exception when others then return new; end;
 if new.action='Approved' then
  update public.school_bank_transactions set status='Verified',verified_by=new.reviewed_by,verified_at=now(),
   decision_note=nullif(btrim(coalesce(new.review_note,'')),''),updated_at=now()
  where id=v_txn_id and status='Awaiting evidence';
  v_action:='Evidence verified';
 else
  update public.school_bank_transactions set status='Evidence rejected',
   decision_note=coalesce(nullif(btrim(coalesce(new.review_note,'')),''),new.action),updated_at=now()
  where id=v_txn_id and status='Awaiting evidence';
  v_action:='Evidence rejected';
 end if;
 if found then
  insert into public.school_bank_transaction_events(bank_transaction_id,actor_user_id,action,note)
  values(v_txn_id,new.reviewed_by,v_action,coalesce(nullif(btrim(coalesce(new.review_note,'')),''),new.action));
 end if;
 return new;
end;
$$;
revoke all on function public.apply_bank_evidence_review_to_transaction() from public,anon,authenticated;
drop trigger if exists evidence_review_updates_bank_transaction on public.evidence_capture_reviews;
create trigger evidence_review_updates_bank_transaction
 after insert on public.evidence_capture_reviews
 for each row execute function public.apply_bank_evidence_review_to_transaction();

create or replace view public.school_bank_account_balances with(security_invoker=true) as
select a.id as bank_account_id,a.account_label,a.bank_name,a.account_name,a.account_number_last4,a.opening_balance_ugx,
 (a.opening_balance_ugx::numeric+coalesce(sum(case when t.status='Verified' and t.direction='Deposit' then t.amount_ugx else 0 end),0::numeric)
  -coalesce(sum(case when t.status='Verified' and t.direction='Withdrawal' then t.amount_ugx else 0 end),0::numeric))::bigint as verified_balance_ugx,
 count(t.id) filter(where t.status in('Awaiting approval','Awaiting evidence','Evidence rejected'))::integer as pending_count,
 a.is_active
from public.school_bank_accounts a
left join public.school_bank_transactions t on t.bank_account_id=a.id
group by a.id,a.account_label,a.bank_name,a.account_name,a.account_number_last4,a.opening_balance_ugx,a.is_active;
grant select on public.school_bank_account_balances to authenticated;
