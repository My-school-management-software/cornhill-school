-- Daily pay reference, approved attendance deductions and advance recovery.
alter table public.staff_salary_agreements add column if not exists daily_rate_ugx bigint check(daily_rate_ugx is null or daily_rate_ugx>=0);
create or replace function public.apply_attendance_deductions_to_payroll()
returns trigger language plpgsql set search_path=''
as $$
declare v_deduction bigint;
begin
 if new.status='Pending' and tg_op='INSERT' then
  select coalesce(sum(i.approved_deduction_ugx),0)::bigint into v_deduction
  from public.staff_attendance_incidents i join public.payroll_periods p on p.id=new.payroll_period_id
  where i.staff_user_id=new.staff_user_id and i.status='approved'
    and i.attendance_date between p.period_start and p.period_end;
  new.deductions_ugx:=new.deductions_ugx+v_deduction;
  if new.deductions_ugx+new.advance_recovery_ugx>new.base_salary_ugx+new.allowances_ugx then
   raise exception 'Approved attendance deductions exceed this staff member salary. Review the incidents before preparing payroll.';
  end if;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_apply_attendance_deductions_to_payroll on public.payroll_items;
create trigger trg_apply_attendance_deductions_to_payroll before insert on public.payroll_items for each row execute function public.apply_attendance_deductions_to_payroll();
revoke all on function public.apply_attendance_deductions_to_payroll() from public,anon,authenticated;
create or replace function public.settle_staff_advance_recovery()
returns trigger language plpgsql set search_path=''
as $$
declare v_remaining bigint; v_advance record; v_take bigint;
begin
 if new.status='Paid' and old.status is distinct from 'Paid' then
  if new.advance_recovery_ugx>0 then
   select coalesce(sum(outstanding_ugx),0)::bigint into v_remaining from public.staff_salary_advances
    where staff_user_id=new.staff_user_id and status='Approved' and outstanding_ugx>0;
   if v_remaining<new.advance_recovery_ugx then
    raise exception 'Advance recovery exceeds the staff member outstanding approved advances.';
   end if;
   v_remaining:=new.advance_recovery_ugx;
   for v_advance in select id,outstanding_ugx from public.staff_salary_advances
     where staff_user_id=new.staff_user_id and status='Approved' and outstanding_ugx>0
     order by advance_date,id for update
   loop
    exit when v_remaining<=0;
    v_take:=least(v_remaining,v_advance.outstanding_ugx);
    update public.staff_salary_advances set outstanding_ugx=outstanding_ugx-v_take,
      status=case when outstanding_ugx-v_take=0 then 'Cleared' else 'Approved' end
      where id=v_advance.id;
    v_remaining:=v_remaining-v_take;
   end loop;
  end if;
  update public.staff_attendance_incidents i set status='deducted',payroll_item_id=new.id
   from public.payroll_periods p
   where p.id=new.payroll_period_id and i.staff_user_id=new.staff_user_id
    and i.status='approved' and i.attendance_date between p.period_start and p.period_end;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_settle_staff_advance_recovery on public.payroll_items;
create trigger trg_settle_staff_advance_recovery after update of status on public.payroll_items for each row execute function public.settle_staff_advance_recovery();
revoke all on function public.settle_staff_advance_recovery() from public,anon,authenticated;
