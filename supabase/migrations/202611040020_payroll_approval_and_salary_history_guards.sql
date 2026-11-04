create or replace function public.prevent_overlapping_staff_salary_agreements()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.is_active and exists(
  select 1 from public.staff_salary_agreements a
  where a.staff_user_id=new.staff_user_id and a.salary_basis=new.salary_basis and a.is_active
   and a.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
   and a.effective_from<=coalesce(new.effective_to,'infinity'::date)
   and coalesce(a.effective_to,'infinity'::date)>=new.effective_from
 ) then
  raise exception 'This staff member already has an active salary agreement covering some of these dates. Close or deactivate the previous agreement first.';
 end if;
 return new;
end;
$$;
drop trigger if exists trg_prevent_overlapping_staff_salary_agreements on public.staff_salary_agreements;
create trigger trg_prevent_overlapping_staff_salary_agreements before insert or update of staff_user_id,salary_basis,effective_from,effective_to,is_active on public.staff_salary_agreements for each row execute function public.prevent_overlapping_staff_salary_agreements();
revoke all on function public.prevent_overlapping_staff_salary_agreements() from public,anon,authenticated;

create or replace function public.create_payroll_expense_on_payment()
returns trigger language plpgsql set search_path=''
as $$
declare v_category uuid; v_period_status text;
begin
 if new.status='Paid' and (tg_op='INSERT' or old.status is distinct from 'Paid') then
  select status into v_period_status from public.payroll_periods where id=new.payroll_period_id;
  if v_period_status not in ('Approved','Part-paid') then
   raise exception 'Approve this payroll period before recording salary payments.';
  end if;
  select id into v_category from public.expense_categories where name='Salaries & wages' and is_active=true;
  if v_category is null then raise exception 'Salaries & wages expense category is missing'; end if;
  insert into public.school_expenses(expense_no,expense_date,category_id,description,amount_ugx,payee_name,payment_method,payment_reference,payroll_item_id,recorded_by)
  values('SAL-'||left(replace(new.id::text,'-',''),12),(timezone('Africa/Kampala',coalesce(new.paid_at,now())))::date,v_category,
   'Salary payment · '||new.staff_name_snapshot||' · payroll period '||(select period_name from public.payroll_periods where id=new.payroll_period_id),
   new.net_pay_ugx,new.staff_name_snapshot,new.payment_method,new.payment_reference,new.id,auth.uid());
  update public.payroll_periods p set status=case when not exists(select 1 from public.payroll_items pi where pi.payroll_period_id=p.id and pi.status<>'Paid') then 'Paid' else 'Part-paid' end where p.id=new.payroll_period_id;
 end if;
 return new;
end;
$$;
