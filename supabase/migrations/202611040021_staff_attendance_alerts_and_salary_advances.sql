-- Staff attendance alerts, optional attendance deductions and salary advances.
create table if not exists public.staff_attendance_alerts (
 id uuid primary key default gen_random_uuid(),
 staff_user_id uuid not null references public.user_profiles(id) on delete restrict,
 attendance_date date not null,
 alert_type text not null check(alert_type in ('missed_clock_in','missed_clock_out')),
 message text not null,
 status text not null default 'unread' check(status in ('unread','read','reviewed')),
 created_at timestamptz not null default now(),
 unique(staff_user_id,attendance_date,alert_type)
);
create index if not exists staff_attendance_alerts_staff_date_idx on public.staff_attendance_alerts(staff_user_id,attendance_date desc);
create table if not exists public.staff_attendance_deduction_settings (
 id boolean primary key default true check(id=true),
 enabled boolean not null default false,
 daily_deduction_ugx bigint not null default 0 check(daily_deduction_ugx>=0),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
insert into public.staff_attendance_deduction_settings(id,enabled,daily_deduction_ugx) values(true,false,0) on conflict(id) do nothing;
create table if not exists public.staff_attendance_incidents (
 id uuid primary key default gen_random_uuid(),
 staff_user_id uuid not null references public.user_profiles(id) on delete restrict,
 attendance_date date not null,
 incident_type text not null check(incident_type in ('missed_clock_in','missed_clock_out')),
 status text not null default 'pending' check(status in ('pending','approved','rejected','deducted')),
 proposed_deduction_ugx bigint not null default 0 check(proposed_deduction_ugx>=0),
 approved_deduction_ugx bigint not null default 0 check(approved_deduction_ugx>=0),
 review_note text,
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 payroll_item_id uuid references public.payroll_items(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(staff_user_id,attendance_date,incident_type)
);
create table if not exists public.staff_salary_advances (
 id uuid primary key default gen_random_uuid(),
 staff_user_id uuid not null references public.user_profiles(id) on delete restrict,
 advance_date date not null default (timezone('Africa/Kampala',now()))::date,
 amount_ugx bigint not null check(amount_ugx>0),
 outstanding_ugx bigint not null check(outstanding_ugx>=0 and outstanding_ugx<=amount_ugx),
 reason text,
 status text not null default 'Approved' check(status in ('Pending','Approved','Cancelled','Cleared')),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists staff_salary_advances_staff_status_idx on public.staff_salary_advances(staff_user_id,status,advance_date);
alter table public.payroll_items add column if not exists advance_recovery_ugx bigint not null default 0 check(advance_recovery_ugx>=0);
alter table public.payroll_items drop constraint if exists payroll_items_deductions_ugx_check;
alter table public.payroll_items add constraint payroll_items_deductions_ugx_check check(deductions_ugx+advance_recovery_ugx<=base_salary_ugx+allowances_ugx);
alter table public.payroll_items drop column if exists net_pay_ugx;
alter table public.payroll_items add column net_pay_ugx bigint generated always as (base_salary_ugx+allowances_ugx-deductions_ugx-advance_recovery_ugx) stored;
do $$
declare t text;
begin
 foreach t in array array['staff_attendance_alerts','staff_attendance_deduction_settings','staff_attendance_incidents','staff_salary_advances'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all privileges on table public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on table public.%I to authenticated',t);
  execute format('create policy "Administrators manage %I" on public.%I for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin())',t,t);
 end loop;
end $$;
-- Staff can read and mark only their own attendance alerts.
create policy "Staff read own attendance alerts" on public.staff_attendance_alerts for select to authenticated using(staff_user_id=(select auth.uid()));
create policy "Staff mark own attendance alerts read" on public.staff_attendance_alerts for update to authenticated using(staff_user_id=(select auth.uid())) with check(staff_user_id=(select auth.uid()));
-- Staff may read their own advances; only administrators can create or alter them.
create policy "Staff read own salary advances" on public.staff_salary_advances for select to authenticated using(staff_user_id=(select auth.uid()));
-- Staff may read only the global deduction switch; cannot change it.
create policy "Authenticated read attendance deduction setting" on public.staff_attendance_deduction_settings for select to authenticated using(true);
