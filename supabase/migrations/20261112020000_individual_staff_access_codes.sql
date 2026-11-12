create table if not exists public.staff_access_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null check (role_key in ('Teacher','Headteacher','Deputy Headteacher','DOS')),
  code_hash text not null unique,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.staff_access_code_login_attempts (
  ip_hash text primary key,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

create table if not exists public.staff_access_code_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null,
  action text not null check (action in ('issued','revoked','used')),
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.staff_access_codes enable row level security;
alter table public.staff_access_code_login_attempts enable row level security;
alter table public.staff_access_code_audit enable row level security;

revoke all on table public.staff_access_codes from public, anon, authenticated;
revoke all on table public.staff_access_code_login_attempts from public, anon, authenticated;
revoke all on table public.staff_access_code_audit from public, anon, authenticated;
grant all on table public.staff_access_codes to service_role;
grant all on table public.staff_access_code_login_attempts to service_role;
grant all on table public.staff_access_code_audit to service_role;
grant usage, select on sequence public.staff_access_code_audit_id_seq to service_role;

create or replace function public.consume_staff_access_code_attempt(
  p_ip_hash text,
  p_reset boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_attempt_count integer;
  v_blocked_until timestamptz;
begin
  if p_ip_hash is null or length(p_ip_hash) <> 64 then
    return false;
  end if;

  if p_reset then
    delete from public.staff_access_code_login_attempts
    where ip_hash = p_ip_hash;
    return true;
  end if;

  insert into public.staff_access_code_login_attempts (
    ip_hash, attempt_count, window_started_at, blocked_until
  )
  values (p_ip_hash, 1, now(), null)
  on conflict (ip_hash) do update
  set
    attempt_count = case
      when public.staff_access_code_login_attempts.window_started_at < now() - interval '15 minutes'
        then 1
      else public.staff_access_code_login_attempts.attempt_count + 1
    end,
    window_started_at = case
      when public.staff_access_code_login_attempts.window_started_at < now() - interval '15 minutes'
        then now()
      else public.staff_access_code_login_attempts.window_started_at
    end,
    blocked_until = case
      when public.staff_access_code_login_attempts.window_started_at < now() - interval '15 minutes'
        then null
      when public.staff_access_code_login_attempts.attempt_count + 1 >= 6
        then now() + interval '15 minutes'
      else public.staff_access_code_login_attempts.blocked_until
    end
  returning attempt_count, blocked_until
  into v_attempt_count, v_blocked_until;

  return v_attempt_count < 6
    and (v_blocked_until is null or v_blocked_until <= now());
end;
$function$;

revoke all on function public.consume_staff_access_code_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.consume_staff_access_code_attempt(text, boolean) to service_role;
