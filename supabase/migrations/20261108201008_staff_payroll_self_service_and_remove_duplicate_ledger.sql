-- Allow each staff member to view their own payslips in the private School Services portal.
-- Payroll creation, approval, amendment and payment remain administrator-only in the existing Finance workflow.
drop policy if exists "School administrators manage payroll_items" on public.payroll_items;
drop policy if exists "Payroll staff read own payroll items" on public.payroll_items;
create policy "Payroll staff read own payroll items"
on public.payroll_items for select to authenticated
using (staff_user_id = (select auth.uid()) or (select public.is_school_admin()));
drop policy if exists "School administrators insert payroll_items" on public.payroll_items;
create policy "School administrators insert payroll_items"
on public.payroll_items for insert to authenticated
with check ((select public.is_school_admin()));
drop policy if exists "School administrators update payroll_items" on public.payroll_items;
create policy "School administrators update payroll_items"
on public.payroll_items for update to authenticated
using ((select public.is_school_admin()))
with check ((select public.is_school_admin()));
drop policy if exists "School administrators delete payroll_items" on public.payroll_items;
create policy "School administrators delete payroll_items"
on public.payroll_items for delete to authenticated
using ((select public.is_school_admin()));

drop policy if exists "School administrators manage payroll_periods" on public.payroll_periods;
drop policy if exists "Payroll staff read own periods" on public.payroll_periods;
create policy "Payroll staff read own periods"
on public.payroll_periods for select to authenticated
using (
 (select public.is_school_admin())
 or exists (
   select 1 from public.payroll_items pi
   where pi.payroll_period_id = payroll_periods.id
     and pi.staff_user_id = (select auth.uid())
 )
);
drop policy if exists "School administrators insert payroll_periods" on public.payroll_periods;
create policy "School administrators insert payroll_periods"
on public.payroll_periods for insert to authenticated
with check ((select public.is_school_admin()));
drop policy if exists "School administrators update payroll_periods" on public.payroll_periods;
create policy "School administrators update payroll_periods"
on public.payroll_periods for update to authenticated
using ((select public.is_school_admin()))
with check ((select public.is_school_admin()));
drop policy if exists "School administrators delete payroll_periods" on public.payroll_periods;
create policy "School administrators delete payroll_periods"
on public.payroll_periods for delete to authenticated
using ((select public.is_school_admin()));

-- Drop only the empty duplicate ledger added by the first services pass.
-- Stop safely if records appeared after the pre-check.
do $$
begin
  if to_regclass('public.school_payroll_records') is not null then
    if exists (select 1 from public.school_payroll_records limit 1) then
      raise exception 'school_payroll_records contains data; refusing to drop duplicate payroll table.';
    end if;
    drop table public.school_payroll_records;
  end if;
end $$;
