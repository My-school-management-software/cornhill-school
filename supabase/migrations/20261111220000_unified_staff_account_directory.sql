-- CORNHILL unified staff sign-in directory foundation.
-- This is a display/administration view only: it does not create accounts,
-- change existing identities, or grant permissions based on section labels.

create index if not exists user_profiles_active_account_directory_idx
  on public.user_profiles (employment_status, role, full_name);

-- Enforce one active full-access Admin identity (the Director).
-- Existing inactive historical profiles are preserved.
create unique index if not exists user_profiles_single_active_admin_idx
  on public.user_profiles ((role))
  where role = 'Admin' and coalesce(employment_status, 'Active') = 'Active';

create or replace view public.staff_account_directory
with (security_invoker = true)
as
select
  p.id as user_id,
  p.full_name as owner_name,
  case
    when p.role = 'Teacher' or p.staff_category = 'Teaching'
      then 'Teaching Staff'
    else 'School Administrators'
  end as account_section,
  case
    when p.role = 'Admin' then 'Director · Full Access'
    else coalesce(nullif(btrim(p.job_title), ''), 'School Staff')
  end as account_title,
  p.role as security_role,
  p.staff_category,
  p.department,
  p.employment_status
from public.user_profiles p
where p.role in ('Admin', 'Teacher', 'Staff')
  and coalesce(p.employment_status, 'Active') = 'Active';

comment on view public.staff_account_directory is
  'Admin-managed directory for the two sign-in sections. Section/title are display labels only; authorization always uses role-specific database policies and authenticated identity.';

revoke all on public.staff_account_directory from public, anon;
grant select on public.staff_account_directory to authenticated;
