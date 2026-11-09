create index if not exists payroll_items_staff_user_id_idx on public.payroll_items(staff_user_id);
create index if not exists payroll_items_salary_agreement_id_idx on public.payroll_items(salary_agreement_id);
create index if not exists payroll_periods_created_by_idx on public.payroll_periods(created_by);
