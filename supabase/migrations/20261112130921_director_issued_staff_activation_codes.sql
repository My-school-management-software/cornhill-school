create table if not exists public.staff_activation_codes (
  staff_directory_id uuid primary key references public.school_staff_directory(id) on delete cascade,
  enrollment_id uuid unique references public.bursar_account_enrollments(id) on delete set null,
  role_key text not null check (role_key in ('Main Bursar','Deputy Bursar','Headteacher','Deputy Headteacher','DOS')),
  code_hash text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz not null,
  issued_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);

create index if not exists staff_activation_codes_active_expiry_idx
  on public.staff_activation_codes (expires_at)
  where is_active = true and redeemed_at is null and revoked_at is null;

create table if not exists public.staff_activation_code_audit (
  id bigint generated always as identity primary key,
  staff_directory_id uuid references public.school_staff_directory(id) on delete set null,
  enrollment_id uuid references public.bursar_account_enrollments(id) on delete set null,
  role_key text not null check (role_key in ('Main Bursar','Deputy Bursar','Headteacher','Deputy Headteacher','DOS')),
  action text not null check (action in ('issued','revoked','redeemed')),
  performed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.staff_activation_codes enable row level security;
alter table public.staff_activation_code_audit enable row level security;
revoke all on table public.staff_activation_codes from public, anon, authenticated;
revoke all on table public.staff_activation_code_audit from public, anon, authenticated;
grant all on table public.staff_activation_codes to service_role;
grant all on table public.staff_activation_code_audit to service_role;
grant usage, select on sequence public.staff_activation_code_audit_id_seq to service_role;
