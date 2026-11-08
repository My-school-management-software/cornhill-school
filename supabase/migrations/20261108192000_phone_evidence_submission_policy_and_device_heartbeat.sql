-- CORNHILL phone evidence hardening and authorised-device heartbeat.
-- This migration follows the already-applied phone_evidence_capture_foundation.
-- Fixes request/file relationship validation and records activity without exposing device writes.
drop policy if exists "Evidence requests assigned user submit" on public.evidence_capture_requests;
create policy "Evidence requests assigned user submit"
on public.evidence_capture_requests
for update to authenticated
using (
  assigned_user_id = (select auth.uid())
  and status = 'Pending'
  and expires_at > now()
  and exists (
    select 1 from public.evidence_capture_devices d
    where d.id = assigned_device_id
      and d.assigned_user_id = (select auth.uid())
      and d.status = 'Active'
  )
)
with check (
  assigned_user_id = (select auth.uid())
  and status = 'Submitted'
  and submitted_at is not null
  and expires_at > now()
  and exists (
    select 1 from public.evidence_capture_files f
    where f.request_id = evidence_capture_requests.id
      and f.uploaded_by = (select auth.uid())
  )
  and exists (
    select 1 from public.evidence_capture_devices d
    where d.id = assigned_device_id
      and d.assigned_user_id = (select auth.uid())
      and d.status = 'Active'
  )
);

create or replace function public.touch_evidence_capture_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in with your own CORNHILL staff account first' using errcode = '42501';
  end if;
  update public.evidence_capture_devices d
  set last_seen_at = now()
  where d.id = p_device_id
    and d.assigned_user_id = v_uid
    and d.status = 'Active'
    and exists (
      select 1 from public.user_profiles u
      where u.id = v_uid
        and coalesce(u.employment_status, 'Active') = 'Active'
    );
  return found;
end;
$$;
revoke all on function public.touch_evidence_capture_device(uuid) from public, anon;
grant execute on function public.touch_evidence_capture_device(uuid) to authenticated;
