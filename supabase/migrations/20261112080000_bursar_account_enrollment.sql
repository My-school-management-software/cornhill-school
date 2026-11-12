-- Two-stage bursar identity verification, Director approval, and password activation.
-- No profile or employee login link is created until the bursar has set a password
-- after email verification and explicit Director approval.

create table if not exists public.bursar_account_enrollments (
  id uuid primary key default gen_random_uuid(),
  staff_directory_id uuid not null references public.school_staff_directory(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null check (length(email) between 5 and 254),
  role_key text not null check (role_key in ('Main Bursar', 'Deputy Bursar')),
  status text not null default 'inviting'
    check (status in ('inviting','invited','email_verified','approved','active','rejected','delivery_failed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  invitation_sent_at timestamptz,
  email_verified_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  delivery_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bursar_enrollments_active_email_uidx
  on public.bursar_account_enrollments (lower(email))
  where status not in ('rejected','delivery_failed');

create unique index if not exists bursar_enrollments_active_employee_uidx
  on public.bursar_account_enrollments (staff_directory_id)
  where status not in ('rejected','delivery_failed');

create index if not exists bursar_enrollments_status_created_idx
  on public.bursar_account_enrollments (status, created_at desc);

create table if not exists public.bursar_account_enrollment_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.bursar_account_enrollments(id) on delete restrict,
  event_key text not null check (event_key in (
    'invitation_requested','invitation_accepted_for_delivery','delivery_failed',
    'email_verified','director_approved','director_rejected','account_activated'
  )),
  performed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bursar_enrollment_events_timeline_idx
  on public.bursar_account_enrollment_events (enrollment_id, created_at);

alter table public.bursar_account_enrollments enable row level security;
alter table public.bursar_account_enrollment_events enable row level security;

revoke all on table public.bursar_account_enrollments from public, anon, authenticated;
revoke all on table public.bursar_account_enrollment_events from public, anon, authenticated;
grant all on table public.bursar_account_enrollments to service_role;
grant all on table public.bursar_account_enrollment_events to service_role;

create or replace function public.activate_bursar_account_enrollment(
  p_enrollment_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.bursar_account_enrollments%rowtype;
  v_employee public.school_staff_directory%rowtype;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_job_title text;
begin
  select * into v_enrollment
  from public.bursar_account_enrollments
  where id = p_enrollment_id
    and auth_user_id = p_auth_user_id
  for update;

  if not found or v_enrollment.status <> 'approved' then
    raise exception 'Bursar account is not approved for activation';
  end if;

  select lower(u.email), coalesce(u.email_confirmed_at, u.confirmed_at)
    into v_auth_email, v_email_confirmed_at
  from auth.users u
  where u.id = p_auth_user_id;

  if v_auth_email is null
     or v_auth_email <> lower(v_enrollment.email)
     or v_email_confirmed_at is null then
    raise exception 'The bursar email address has not been verified';
  end if;

  select * into v_employee
  from public.school_staff_directory
  where id = v_enrollment.staff_directory_id
  for update;

  if not found
     or v_employee.linked_user_id is not null
     or v_employee.employment_status <> 'Active'
     or v_employee.staff_category <> 'Non-teaching' then
    raise exception 'The employee record is not eligible for account activation';
  end if;

  v_job_title := lower(regexp_replace(trim(coalesce(v_employee.job_title, '')), '\s+', ' ', 'g'));
  if v_enrollment.role_key = 'Main Bursar'
     and v_job_title not in ('main bursar','bursar','school bursar','bursar (main)','bursar main') then
    raise exception 'The employee job title does not match the Main Bursar role';
  end if;
  if v_enrollment.role_key = 'Deputy Bursar'
     and v_job_title not in ('deputy bursar','deputy school bursar','deputy bursar (school)') then
    raise exception 'The employee job title does not match the Deputy Bursar role';
  end if;

  if exists (select 1 from public.user_profiles where id = p_auth_user_id) then
    raise exception 'A staff profile already exists for this account';
  end if;

  insert into public.user_profiles (
    id, full_name, role, phone, gender, staff_category, job_title, department,
    responsibilities, employment_start_date, reporting_date, employment_end_date,
    employment_status
  ) values (
    p_auth_user_id, v_employee.full_name, 'Staff', v_employee.phone, v_employee.gender,
    v_employee.staff_category, v_employee.job_title, v_employee.department,
    v_employee.responsibilities, v_employee.employment_start_date, v_employee.reporting_date,
    v_employee.employment_end_date, v_employee.employment_status
  );

  update public.school_staff_directory
  set linked_user_id = p_auth_user_id, updated_at = now()
  where id = v_employee.id and linked_user_id is null;

  if not found then
    raise exception 'The employee account link could not be completed';
  end if;

  update public.bursar_account_enrollments
  set status = 'active', activated_at = now(), updated_at = now()
  where id = v_enrollment.id;

  insert into public.bursar_account_enrollment_events (
    enrollment_id, event_key, performed_by, metadata
  ) values (
    v_enrollment.id, 'account_activated', p_auth_user_id,
    jsonb_build_object('role_key', v_enrollment.role_key)
  );

  return jsonb_build_object('success', true, 'status', 'active');
end;
$function$;

-- This is a server-only activation primitive. Browser roles cannot invoke it.
revoke all on function public.activate_bursar_account_enrollment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_bursar_account_enrollment(uuid, uuid) to service_role;
