-- Reassert the assigned active-device check after bank and expense workflow policies.
drop policy if exists "Evidence requests assigned user submit" on public.evidence_capture_requests;
create policy "Evidence requests assigned user submit" on public.evidence_capture_requests
for update to authenticated
using (
 assigned_user_id=(select auth.uid()) and status='Pending' and expires_at>now()
 and exists(select 1 from public.evidence_capture_devices d where d.id=assigned_device_id and d.assigned_user_id=(select auth.uid()) and d.status='Active')
)
with check (
 assigned_user_id=(select auth.uid()) and status='Submitted' and submitted_at is not null and expires_at>now()
 and exists(select 1 from public.evidence_capture_files f where f.request_id=evidence_capture_requests.id and f.uploaded_by=(select auth.uid()))
 and exists(select 1 from public.evidence_capture_devices d where d.id=assigned_device_id and d.assigned_user_id=(select auth.uid()) and d.status='Active')
);
