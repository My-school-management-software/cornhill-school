-- CORNHILL coordinated School Services foundation.
-- Additive only: no existing learner, academic, finance, attendance or staff records are replaced.

create table if not exists public.school_admission_enquiries (
  id uuid primary key default gen_random_uuid(),
  learner_name text not null check (length(btrim(learner_name)) between 2 and 140),
  class_applied text not null check (length(btrim(class_applied)) between 2 and 40),
  guardian_name text not null check (length(btrim(guardian_name)) between 2 and 140),
  guardian_phone text not null check (length(regexp_replace(guardian_phone, '[^0-9+]', '', 'g')) between 7 and 18),
  guardian_email text null check (guardian_email is null or length(guardian_email) <= 254),
  contact_preference text not null default 'Phone' check (contact_preference in ('Phone','SMS','Email')),
  message text not null default '' check (length(message) <= 1200),
  status text not null default 'Pending' check (status in ('Pending','Contacted','Visit scheduled','Approved for admission','Not proceeding','Closed')),
  review_note text null check (review_note is null or length(review_note) <= 1200),
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists school_admission_enquiries_created_idx on public.school_admission_enquiries(created_at desc);
alter table public.school_admission_enquiries enable row level security;
revoke all on public.school_admission_enquiries from public, anon;
grant insert on public.school_admission_enquiries to anon;
grant select, update on public.school_admission_enquiries to authenticated;
drop policy if exists "Public can submit pending admission enquiries" on public.school_admission_enquiries;
create policy "Public can submit pending admission enquiries"
on public.school_admission_enquiries for insert to anon, authenticated
with check (status = 'Pending' and reviewed_by is null and reviewed_at is null and review_note is null);
drop policy if exists "Administrators read admission enquiries" on public.school_admission_enquiries;
create policy "Administrators read admission enquiries"
on public.school_admission_enquiries for select to authenticated
using ((select public.is_school_admin()));
drop policy if exists "Administrators review admission enquiries" on public.school_admission_enquiries;
create policy "Administrators review admission enquiries"
on public.school_admission_enquiries for update to authenticated
using ((select public.is_school_admin()))
with check ((select public.is_school_admin()));

create table if not exists public.school_hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  leave_type text not null check (leave_type in ('Annual','Sick','Compassionate','Maternity/Paternity','Study','Unpaid','Other')),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(btrim(reason)) between 5 and 1200),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected','Cancelled')),
  decision_note text null check (decision_note is null or length(decision_note) <= 1000),
  decided_by uuid null references auth.users(id) on delete set null,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint school_hr_leave_dates_check check (end_date >= start_date)
);
create index if not exists school_hr_leave_owner_created_idx on public.school_hr_leave_requests(staff_user_id,created_at desc);
alter table public.school_hr_leave_requests enable row level security;
revoke all on public.school_hr_leave_requests from public, anon;
grant select, insert, update on public.school_hr_leave_requests to authenticated;
drop policy if exists "Staff read own leave and admins read all" on public.school_hr_leave_requests;
create policy "Staff read own leave and admins read all"
on public.school_hr_leave_requests for select to authenticated
using (staff_user_id = (select auth.uid()) or (select public.is_school_admin()));
drop policy if exists "Active staff submit own leave requests" on public.school_hr_leave_requests;
create policy "Active staff submit own leave requests"
on public.school_hr_leave_requests for insert to authenticated
with check (
  staff_user_id = (select auth.uid()) and status = 'Pending'
  and decided_by is null and decided_at is null and decision_note is null
  and exists (select 1 from public.user_profiles p where p.id = (select auth.uid()) and p.employment_status = 'Active')
);
drop policy if exists "Administrators decide leave requests" on public.school_hr_leave_requests;
create policy "Administrators decide leave requests"
on public.school_hr_leave_requests for update to authenticated
using ((select public.is_school_admin()))
with check ((select public.is_school_admin()));

create table if not exists public.school_payroll_records (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  base_pay_ugx bigint not null check (base_pay_ugx >= 0),
  allowances_ugx bigint not null default 0 check (allowances_ugx >= 0),
  deductions_ugx bigint not null default 0 check (deductions_ugx >= 0),
  net_pay_ugx bigint not null check (net_pay_ugx >= 0),
  currency text not null default 'UGX' check (currency = 'UGX'),
  status text not null default 'Draft' check (status in ('Draft','Approved','Paid','Voided')),
  pay_reference text null check (pay_reference is null or length(pay_reference) <= 100),
  notes text null check (notes is null or length(notes) <= 800),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (staff_user_id,period_start,period_end),
  constraint school_payroll_period_check check (period_end >= period_start)
);
create index if not exists school_payroll_staff_period_idx on public.school_payroll_records(staff_user_id,period_start desc);
alter table public.school_payroll_records enable row level security;
revoke all on public.school_payroll_records from public, anon;
grant select, insert, update on public.school_payroll_records to authenticated;
drop policy if exists "Staff read own payroll and finance admins read all" on public.school_payroll_records;
create policy "Staff read own payroll and finance admins read all"
on public.school_payroll_records for select to authenticated
using (
  staff_user_id = (select auth.uid()) or (select public.is_school_admin())
  or exists (select 1 from public.user_profiles p where p.id = (select auth.uid())
             and p.employment_status = 'Active'
             and lower(btrim(coalesce(p.job_title,''))) in ('bursar','school bursar','deputy bursar','deputy school bursar'))
);
drop policy if exists "Administrators create payroll records" on public.school_payroll_records;
create policy "Administrators create payroll records"
on public.school_payroll_records for insert to authenticated
with check ((select public.is_school_admin()) and created_by = (select auth.uid()));
drop policy if exists "Administrators update payroll records" on public.school_payroll_records;
create policy "Administrators update payroll records"
on public.school_payroll_records for update to authenticated
using ((select public.is_school_admin()))
with check ((select public.is_school_admin()));

create table if not exists public.school_learning_resources (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.school_classes(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 160),
  subject text not null check (length(btrim(subject)) between 2 and 100),
  resource_type text not null default 'Link' check (resource_type in ('Link','Lesson note','Homework','Revision','Reading')),
  resource_url text null check (resource_url is null or resource_url ~ '^https://[^[:space:]]+$'),
  instructions text not null default '' check (length(instructions) <= 2000),
  visible_to_guardians boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists school_learning_resources_class_date_idx on public.school_learning_resources(class_id,created_at desc);
alter table public.school_learning_resources enable row level security;
revoke all on public.school_learning_resources from public, anon;
grant select, insert, update, delete on public.school_learning_resources to authenticated;
drop policy if exists "Admins and assigned teachers read learning resources" on public.school_learning_resources;
create policy "Admins and assigned teachers read learning resources"
on public.school_learning_resources for select to authenticated
using ((select public.is_school_admin()) or public.is_class_teacher_for_class(class_id));
drop policy if exists "Admins and assigned teachers add learning resources" on public.school_learning_resources;
create policy "Admins and assigned teachers add learning resources"
on public.school_learning_resources for insert to authenticated
with check (created_by = (select auth.uid()) and ((select public.is_school_admin()) or public.is_class_teacher_for_class(class_id)));
drop policy if exists "Admins and resource owners update learning resources" on public.school_learning_resources;
create policy "Admins and resource owners update learning resources"
on public.school_learning_resources for update to authenticated
using ((select public.is_school_admin()) or (created_by = (select auth.uid()) and public.is_class_teacher_for_class(class_id)))
with check ((select public.is_school_admin()) or (created_by = (select auth.uid()) and public.is_class_teacher_for_class(class_id)));
drop policy if exists "Admins and resource owners delete learning resources" on public.school_learning_resources;
create policy "Admins and resource owners delete learning resources"
on public.school_learning_resources for delete to authenticated
using ((select public.is_school_admin()) or (created_by = (select auth.uid()) and public.is_class_teacher_for_class(class_id)));

create table if not exists public.school_library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 180),
  author text not null default '' check (length(author) <= 140),
  book_code text not null unique check (length(btrim(book_code)) between 2 and 50),
  category text not null default 'General' check (length(category) <= 80),
  total_copies integer not null default 1 check (total_copies >= 0),
  available_copies integer not null default 1 check (available_copies >= 0 and available_copies <= total_copies),
  shelf_location text not null default '' check (length(shelf_location) <= 80),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists school_library_books_title_idx on public.school_library_books(lower(title));
alter table public.school_library_books enable row level security;
revoke all on public.school_library_books from public, anon;
grant select, insert, update, delete on public.school_library_books to authenticated;
drop policy if exists "Active users read library catalogue" on public.school_library_books;
create policy "Active users read library catalogue"
on public.school_library_books for select to authenticated
using (exists (select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'));
drop policy if exists "Library operators add books" on public.school_library_books;
create policy "Library operators add books"
on public.school_library_books for insert to authenticated
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')));
drop policy if exists "Library operators update books" on public.school_library_books;
create policy "Library operators update books"
on public.school_library_books for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')));
drop policy if exists "Library operators delete books" on public.school_library_books;
create policy "Library operators delete books"
on public.school_library_books for delete to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')));

create table if not exists public.school_library_loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.school_library_books(id) on delete restrict,
  borrower_name text not null check (length(btrim(borrower_name)) between 2 and 140),
  borrower_code text not null check (length(btrim(borrower_code)) between 2 and 60),
  borrower_type text not null default 'Learner' check (borrower_type in ('Learner','Staff')),
  issue_date date not null default current_date,
  due_date date not null,
  return_date date null,
  status text not null default 'Issued' check (status in ('Issued','Returned','Lost')),
  issued_by uuid not null references auth.users(id) on delete restrict,
  returned_by uuid null references auth.users(id) on delete set null,
  notes text null check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint school_library_loan_dates_check check (due_date >= issue_date),
  constraint school_library_return_date_check check (status <> 'Returned' or return_date is not null)
);
create index if not exists school_library_loans_status_due_idx on public.school_library_loans(status,due_date);
alter table public.school_library_loans enable row level security;
revoke all on public.school_library_loans from public, anon;
grant select, insert, update on public.school_library_loans to authenticated;
drop policy if exists "Library operators read loans" on public.school_library_loans;
create policy "Library operators read loans"
on public.school_library_loans for select to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')));
drop policy if exists "Library operators issue loans" on public.school_library_loans;
create policy "Library operators issue loans"
on public.school_library_loans for insert to authenticated
with check (issued_by=(select auth.uid()) and status='Issued' and
 ((select public.is_school_admin()) or exists (
  select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
  and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer'))));
drop policy if exists "Library operators update loans" on public.school_library_loans;
create policy "Library operators update loans"
on public.school_library_loans for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('librarian','library manager','library officer')));

create or replace function public.school_library_loan_copies_trigger()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.status='Issued' then
      update public.school_library_books set available_copies=available_copies-1
      where id=new.book_id and is_active=true and available_copies>0;
      if not found then raise exception 'No available copies remain for this book.'; end if;
    end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    if new.book_id<>old.book_id then raise exception 'A loan cannot be moved to a different book.'; end if;
    if old.status='Issued' and new.status='Returned' then
      update public.school_library_books set available_copies=least(total_copies,available_copies+1) where id=old.book_id;
      new.return_date=coalesce(new.return_date,current_date);
      new.returned_by=coalesce(new.returned_by,auth.uid());
    elsif old.status<>'Issued' and new.status='Issued' then
      update public.school_library_books set available_copies=available_copies-1
      where id=new.book_id and is_active=true and available_copies>0;
      if not found then raise exception 'No available copies remain for this book.'; end if;
    end if;
    return new;
  end if;
  return new;
end;
$$;
drop trigger if exists school_library_loan_copies on public.school_library_loans;
create trigger school_library_loan_copies before insert or update on public.school_library_loans
for each row execute function public.school_library_loan_copies_trigger();

create table if not exists public.school_transport_routes (
  id uuid primary key default gen_random_uuid(),
  route_name text not null unique check (length(btrim(route_name)) between 2 and 100),
  vehicle_label text not null default '' check (length(vehicle_label) <= 80),
  driver_user_id uuid null references auth.users(id) on delete set null,
  pickup_areas text not null default '' check (length(pickup_areas) <= 1000),
  departure_time time null,
  return_time time null,
  is_active boolean not null default true,
  notes text not null default '' check (length(notes) <= 700),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.school_transport_routes enable row level security;
revoke all on public.school_transport_routes from public, anon;
grant select, insert, update on public.school_transport_routes to authenticated;
drop policy if exists "Transport operators read routes" on public.school_transport_routes;
create policy "Transport operators read routes"
on public.school_transport_routes for select to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer','driver','bus driver')));
drop policy if exists "Transport operators insert routes" on public.school_transport_routes;
create policy "Transport operators insert routes"
on public.school_transport_routes for insert to authenticated
with check (created_by=(select auth.uid()) and ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer'))));
drop policy if exists "Transport operators update routes" on public.school_transport_routes;
create policy "Transport operators update routes"
on public.school_transport_routes for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer')))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer')));

create table if not exists public.school_transport_assignments (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.school_transport_routes(id) on delete restrict,
  learner_name text not null check (length(btrim(learner_name)) between 2 and 140),
  learner_code text not null check (length(btrim(learner_code)) between 2 and 60),
  class_name text not null default '' check (length(class_name) <= 40),
  pickup_point text not null check (length(btrim(pickup_point)) between 2 and 140),
  guardian_phone text null check (guardian_phone is null or length(guardian_phone) <= 25),
  status text not null default 'Active' check (status in ('Active','Paused','Completed')),
  notes text not null default '' check (length(notes) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists school_transport_assignments_route_idx on public.school_transport_assignments(route_id,status);
alter table public.school_transport_assignments enable row level security;
revoke all on public.school_transport_assignments from public, anon;
grant select, insert, update on public.school_transport_assignments to authenticated;
drop policy if exists "Transport operators read assignments" on public.school_transport_assignments;
create policy "Transport operators read assignments"
on public.school_transport_assignments for select to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer','driver','bus driver')));
drop policy if exists "Transport operators add assignments" on public.school_transport_assignments;
create policy "Transport operators add assignments"
on public.school_transport_assignments for insert to authenticated
with check (created_by=(select auth.uid()) and ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer'))));
drop policy if exists "Transport operators update assignments" on public.school_transport_assignments;
create policy "Transport operators update assignments"
on public.school_transport_assignments for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer')))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('transport manager','transport officer')));

create table if not exists public.school_welfare_cases (
  id uuid primary key default gen_random_uuid(),
  learner_code text not null default '' check (length(learner_code) <= 60),
  learner_name text not null default '' check (length(learner_name) <= 140),
  case_category text not null check (case_category in ('General welfare','Attendance concern','Safeguarding concern','Family follow-up','Other')),
  factual_summary text not null check (length(btrim(factual_summary)) between 5 and 2000),
  action_taken text not null default '' check (length(action_taken) <= 2000),
  follow_up_date date null,
  status text not null default 'Open' check (status in ('Open','Follow-up','Resolved','Referred')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists school_welfare_cases_status_idx on public.school_welfare_cases(status,created_at desc);
alter table public.school_welfare_cases enable row level security;
revoke all on public.school_welfare_cases from public, anon;
grant select, insert, update on public.school_welfare_cases to authenticated;
drop policy if exists "Approved welfare officers read cases" on public.school_welfare_cases;
create policy "Approved welfare officers read cases"
on public.school_welfare_cases for select to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('matron','senior woman','senior man','school nurse')));
drop policy if exists "Approved welfare officers add cases" on public.school_welfare_cases;
create policy "Approved welfare officers add cases"
on public.school_welfare_cases for insert to authenticated
with check (created_by=(select auth.uid()) and ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('matron','senior woman','senior man','school nurse'))));
drop policy if exists "Administrators and welfare officers update cases" on public.school_welfare_cases;
create policy "Administrators and welfare officers update cases"
on public.school_welfare_cases for update to authenticated
using ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('matron','senior woman','senior man','school nurse')))
with check ((select public.is_school_admin()) or exists (
 select 1 from public.user_profiles p where p.id=(select auth.uid()) and p.employment_status='Active'
 and lower(btrim(coalesce(p.job_title,''))) in ('matron','senior woman','senior man','school nurse')));

create table if not exists public.school_provider_integrations (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique check (provider_key ~ '^[a-z0-9-]+$'),
  provider_name text not null check (length(btrim(provider_name)) between 2 and 100),
  service_type text not null check (service_type in ('Mobile Money','SMS','Email','Backup')),
  status text not null default 'Setup required' check (status in ('Setup required','Credentials pending','Testing','Active','Disabled')),
  account_reference text not null default '' check (length(account_reference) <= 120),
  sender_label text not null default '' check (length(sender_label) <= 60),
  secret_configured boolean not null default false,
  notes text not null default '' check (length(notes) <= 1000),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.school_provider_integrations enable row level security;
revoke all on public.school_provider_integrations from public, anon;
grant select, insert, update on public.school_provider_integrations to authenticated;
drop policy if exists "Administrators manage provider integration registry" on public.school_provider_integrations;
create policy "Administrators manage provider integration registry"
on public.school_provider_integrations for all to authenticated
using ((select public.is_school_admin()))
with check ((select public.is_school_admin()));

insert into public.school_provider_integrations(provider_key,provider_name,service_type,status,notes)
values
 ('mtn-mobile-money','MTN Mobile Money','Mobile Money','Setup required','Official merchant access and server-side credentials are required. No secret is stored in this registry.'),
 ('airtel-money','Airtel Money','Mobile Money','Setup required','Official merchant access and server-side credentials are required. No secret is stored in this registry.'),
 ('mtn-sms','MTN SMS','SMS','Setup required','Approved SMS provider account, sender setup and delivery testing are required.'),
 ('airtel-sms','Airtel SMS','SMS','Setup required','Approved SMS provider account, sender setup and delivery testing are required.'),
 ('google-drive-backup','Google Drive Backup','Backup','Setup required','Existing backup workflow must be validated with a real restore exercise.')
on conflict(provider_key) do nothing;

insert into public.school_apps
  (app_key,name,description,category,icon,app_url,app_kind,allowed_roles,allowed_job_titles,sort_order,is_active)
values
 ('public-school-website','Public School Website','Public CORNHILL information and admission enquiry entry point.','School','🌐','/school.html','Internal',array['Admin']::text[],'{}'::text[],50,true),
 ('admissions-enquiries','Admissions & Enquiries','Receive and review prospective learner enquiries before formal admission.','School','📝','/admissions.html','Internal',array['Admin']::text[],'{}'::text[],60,true),
 ('school-services-hub','School Services Portal','Shared secure workspace for HR, teaching resources, library, transport and welfare services.','School','🧩','/school-services.html','Internal',array['Admin','Teacher','Staff']::text[],'{}'::text[],70,true),
 ('hr-payroll-service','HR & Payroll Self-Service','Private staff leave requests and personal payslip access; administrators manage payroll records.','Finance','💼','/school-services.html#hr-payroll','Internal',array['Admin','Teacher','Staff']::text[],'{}'::text[],80,true),
 ('learning-resources-service','Learning Resources & Homework','Class-scoped learning links, lesson notes, homework and revision resources.','Learning','📚','/school-services.html#learning','Internal',array['Admin','Teacher']::text[],'{}'::text[],90,true),
 ('school-library-service','Library Management','Book catalogue, issue register, returns and copy tracking for authorised library operators.','Learning','📖','/school-services.html#library','Internal',array['Admin','Teacher','Staff']::text[],'{}'::text[],100,true),
 ('school-transport-service','School Transport','Routes, vehicle and driver assignments, learner transport register and pickup points.','School','🚌','/school-services.html#transport','Internal',array['Admin','Staff']::text[],array['transport manager','transport officer','driver','bus driver']::text[],110,true),
 ('school-welfare-service','Student Welfare Office','Restricted welfare case register for the administrator and approved welfare officers.','School','🤝','/school-services.html#welfare','Internal',array['Admin','Staff']::text[],array['matron','senior woman','senior man','school nurse']::text[],120,true),
 ('payment-integrations-service','Mobile Money & Messaging Setup','Provider configuration checklist for MTN, Airtel and school messaging. Live processing requires official credentials and server-side integration.','Finance','📲','/school-services.html#integrations','Internal',array['Admin']::text[],'{}'::text[],130,true),
 ('school-system-health','System Health & Recovery','Connectivity checks, backup status guidance and recovery-readiness register.','External Service','🛡️','/school-services.html#system-health','Internal',array['Admin']::text[],'{}'::text[],140,true),
 ('staff-attendance-kiosk','Staff Attendance Kiosk','Dedicated kiosk guidance for the existing attendance workflow; biometric connection awaits verified hardware model.','School','🕒','/school-services.html#attendance-kiosk','Internal',array['Admin','Staff']::text[],'{}'::text[],150,true)
on conflict(app_key) do update set
 name=excluded.name,description=excluded.description,category=excluded.category,icon=excluded.icon,
 app_url=excluded.app_url,app_kind=excluded.app_kind,allowed_roles=excluded.allowed_roles,
 allowed_job_titles=excluded.allowed_job_titles,sort_order=excluded.sort_order,is_active=true,
 updated_at=now();
