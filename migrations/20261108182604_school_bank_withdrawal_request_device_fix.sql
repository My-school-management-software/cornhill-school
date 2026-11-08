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
