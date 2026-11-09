create or replace function public.is_school_finance_operator()
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists(select 1 from public.user_profiles p
  where p.id=(select auth.uid()) and coalesce(p.employment_status,'Active')='Active'
   and (p.role='Admin' or (p.role='Staff' and lower(btrim(coalesce(p.job_title,''))) in
    ('bursar','school bursar','deputy bursar','deputy school bursar'))));
$$;
revoke all on function public.is_school_finance_operator() from public,anon;
grant execute on function public.is_school_finance_operator() to authenticated;

alter function public.create_school_bank_transaction(uuid,text,date,bigint,text,text,text,uuid) security definer;
alter function public.approve_school_bank_withdrawal(uuid,uuid,text) security definer;
alter function public.reject_school_bank_withdrawal(uuid,text) security definer;
alter function public.reissue_school_bank_evidence(uuid,uuid,text) security definer;

create or replace view public.school_bank_account_balances with(security_invoker=true) as
select a.id bank_account_id,a.account_label,a.bank_name,a.account_name,a.account_number_last4,a.opening_balance_ugx,
 (a.opening_balance_ugx+coalesce(sum(case when t.status='Verified' and t.direction='Deposit' then t.amount_ugx else 0 end),0)
 -coalesce(sum(case when t.status='Verified' and t.direction='Withdrawal' then t.amount_ugx else 0 end),0))::bigint verified_balance_ugx,
 count(t.id) filter(where t.status in('Awaiting approval','Awaiting evidence','Evidence rejected'))::integer pending_count,
 a.is_active
from public.school_bank_accounts a left join public.school_bank_transactions t on t.bank_account_id=a.id
group by a.id,a.account_label,a.bank_name,a.account_name,a.account_number_last4,a.opening_balance_ugx,a.is_active;
