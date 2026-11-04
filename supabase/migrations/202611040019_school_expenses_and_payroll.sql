create table if not exists public.expense_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
insert into public.expense_categories(name,description) values
 ('Salaries & wages','Staff salary and wage payments'),
 ('Examinations','Examination papers, printing and invigilation'),
 ('Tests','Class tests, assessment papers and marking'),
 ('Food & kitchen','Food, cooking supplies and kitchen costs'),
 ('Utilities','Electricity, water and internet'),
 ('Teaching materials','Books, stationery and classroom materials'),
 ('Transport','School transport and travel'),
 ('Repairs & maintenance','Buildings, furniture and equipment repairs'),
 ('Medical & welfare','First aid, medical and welfare costs'),
 ('Sports & activities','Sports, clubs and school activities'),
 ('Uniforms & clothing','Uniform and clothing purchases'),
 ('Administration','Office and general administration'),
 ('Other','Other approved school expenses')
on conflict(name) do nothing;

create table if not exists public.staff_salary_agreements (
 id uuid primary key default gen_random_uuid(),
 staff_user_id uuid not null references public.user_profiles(id) on delete restrict,
 salary_basis text not null check(salary_basis in ('Monthly','Termly','Yearly')),
 base_salary_ugx bigint not null check(base_salary_ugx>=0),
 effective_from date not null,
 effective_to date,
 notes text,
 is_active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(effective_to is null or effective_to>=effective_from)
);
create index if not exists staff_salary_agreements_staff_dates_idx on public.staff_salary_agreements(staff_user_id,effective_from,effective_to);

create table if not exists public.payroll_periods (
 id uuid primary key default gen_random_uuid(),
 period_name text not null,
 period_type text not null check(period_type in ('Monthly','Termly','Yearly')),
 period_start date not null,
 period_end date not null,
 payment_date date,
 status text not null default 'Draft' check(status in ('Draft','Approved','Part-paid','Paid','Cancelled')),
 notes text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(period_end>=period_start),
 unique(period_name,period_start,period_end)
);
create table if not exists public.payroll_items (
 id uuid primary key default gen_random_uuid(),
 payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
 staff_user_id uuid not null references public.user_profiles(id) on delete restrict,
 salary_agreement_id uuid references public.staff_salary_agreements(id) on delete restrict,
 staff_name_snapshot text not null,
 job_title_snapshot text,
 salary_basis text not null check(salary_basis in ('Monthly','Termly','Yearly')),
 base_salary_ugx bigint not null check(base_salary_ugx>=0),
 allowances_ugx bigint not null default 0 check(allowances_ugx>=0),
 deductions_ugx bigint not null default 0 check(deductions_ugx>=0),
 net_pay_ugx bigint generated always as (base_salary_ugx+allowances_ugx-deductions_ugx) stored,
 status text not null default 'Pending' check(status in ('Pending','Paid','On hold')),
 paid_at timestamptz,
 payment_reference text,
 payment_method text not null default 'Bank transfer' check(payment_method in ('Cash','Bank transfer','Mobile Money','Cheque','Other')),
 notes text,
 created_at timestamptz not null default now(),
 unique(payroll_period_id,staff_user_id),
 check(deductions_ugx<=base_salary_ugx+allowances_ugx)
);

create table if not exists public.school_expenses (
 id uuid primary key default gen_random_uuid(),
 expense_no text not null unique,
 expense_date date not null default (timezone('Africa/Kampala',now()))::date,
 category_id uuid not null references public.expense_categories(id) on delete restrict,
 description text not null,
 amount_ugx bigint not null check(amount_ugx>0),
 payee_name text,
 payment_method text not null check(payment_method in ('Cash','Bank transfer','Mobile Money','Cheque','Other')),
 payment_reference text,
 receipt_reference text,
 payroll_item_id uuid unique references public.payroll_items(id) on delete restrict,
 recorded_by uuid not null references auth.users(id),
 status text not null default 'Posted' check(status in ('Posted','Voided')),
 void_reason text,
 created_at timestamptz not null default now(),
 voided_at timestamptz
);
create index if not exists school_expenses_date_idx on public.school_expenses(expense_date desc);
create index if not exists school_expenses_category_idx on public.school_expenses(category_id,expense_date desc);
create index if not exists payroll_items_period_idx on public.payroll_items(payroll_period_id,status);

do $$
declare t text;
begin
 foreach t in array array['expense_categories','staff_salary_agreements','payroll_periods','payroll_items','school_expenses'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all privileges on table public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on table public.%I to authenticated',t);
  execute format('drop policy if exists "School administrators manage %I" on public.%I',t,t);
  execute format('create policy "School administrators manage %I" on public.%I for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin())',t,t);
 end loop;
end $$;

create or replace function public.create_payroll_expense_on_payment()
returns trigger language plpgsql set search_path=''
as $$
declare v_category uuid;
begin
 if new.status='Paid' and (tg_op='INSERT' or old.status is distinct from 'Paid') then
  select id into v_category from public.expense_categories where name='Salaries & wages' and is_active=true;
  if v_category is null then raise exception 'Salaries & wages expense category is missing'; end if;
  insert into public.school_expenses(expense_no,expense_date,category_id,description,amount_ugx,payee_name,payment_method,payment_reference,payroll_item_id,recorded_by)
  select 'SAL-'||left(replace(new.id::text,'-',''),12),(timezone('Africa/Kampala',coalesce(new.paid_at,now())))::date,v_category,
   'Salary payment · '||new.staff_name_snapshot||' · payroll period '||p.period_name,
   new.net_pay_ugx,new.staff_name_snapshot,
   new.payment_method,
   new.payment_reference,new.id,auth.uid()
  from public.payroll_periods p where p.id=new.payroll_period_id;
 end if;
 return new;
end;
$$;
drop trigger if exists trg_create_payroll_expense_on_payment on public.payroll_items;
create trigger trg_create_payroll_expense_on_payment after insert or update of status on public.payroll_items for each row execute function public.create_payroll_expense_on_payment();
revoke all on function public.create_payroll_expense_on_payment() from public,anon,authenticated;
