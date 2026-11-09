-- Require withdrawal states to retain the corresponding authorisation evidence.
do $$
begin
 if not exists(select 1 from pg_constraint where conname='school_bank_transactions_withdrawal_approval_state_check'
  and conrelid='public.school_bank_transactions'::regclass) then
  alter table public.school_bank_transactions
   add constraint school_bank_transactions_withdrawal_approval_state_check
   check(
    direction='Deposit'
    or (direction='Withdrawal' and status='Awaiting approval' and approved_by is null and approved_at is null)
    or (direction='Withdrawal' and status='Cancelled' and rejected_by is not null and rejected_at is not null)
    or (direction='Withdrawal' and status in('Awaiting evidence','Verified','Evidence rejected') and approved_by is not null and approved_at is not null)
   );
 end if;
end;
$$;
