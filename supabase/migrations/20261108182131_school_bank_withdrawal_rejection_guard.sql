-- Record a reason for every rejected bank withdrawal and retain the decision event.
create or replace function public.reject_school_bank_withdrawal(p_transaction_id uuid,p_note text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_txn public.school_bank_transactions%rowtype;
begin
 if v_uid is null or not public.is_school_admin() then
  raise exception 'Only an administrator may reject a bank withdrawal' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_note,'')))<5 then
  raise exception 'Enter a reason of at least five characters';
 end if;
 select * into v_txn from public.school_bank_transactions where id=p_transaction_id for update;
 if not found or v_txn.direction<>'Withdrawal' or v_txn.status<>'Awaiting approval' then
  raise exception 'This withdrawal is no longer awaiting approval';
 end if;
 update public.school_bank_transactions
 set status='Cancelled',rejected_by=v_uid,rejected_at=now(),decision_note=btrim(p_note),updated_at=now()
 where id=v_txn.id;
 insert into public.school_bank_transaction_events(bank_transaction_id,actor_user_id,action,note)
 values(v_txn.id,v_uid,'Withdrawal rejected',btrim(p_note));
end;
$$;
revoke all on function public.reject_school_bank_withdrawal(uuid,text) from public,anon;
grant execute on function public.reject_school_bank_withdrawal(uuid,text) to authenticated;
