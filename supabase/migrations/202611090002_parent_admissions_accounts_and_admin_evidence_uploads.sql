-- CORNHILL: reuse school_admission_enquiries.submitted_by for parent-owned applications.
-- The public and authenticated applicant RLS policies are defined by
-- 202611090001_admission_enquiry_linkage.sql; do not add a duplicate owner column.
--
-- A local-computer upload is a valid evidence source even when no phone is assigned.
drop policy if exists "Evidence files admin upload" on public.evidence_capture_files;
create policy "Evidence files admin upload"
on public.evidence_capture_files
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (select public.is_school_admin())
  and storage_path like request_id::text || '/%'
  and exists (
    select 1
    from public.evidence_capture_requests r
    where r.id = evidence_capture_files.request_id
      and r.requested_by = (select auth.uid())
      and r.status = 'Pending'
      and r.expires_at > now()
  )
);

drop policy if exists "Evidence storage admin upload" on storage.objects;
create policy "Evidence storage admin upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cornhill-private-evidence'
  and (select public.is_school_admin())
  and exists (
    select 1
    from public.evidence_capture_requests r
    where r.id::text = (storage.foldername(name))[1]
      and r.requested_by = (select auth.uid())
      and r.status = 'Pending'
      and r.expires_at > now()
  )
);

alter table public.evidence_capture_requests
  alter column assigned_device_id drop not null,
  alter column assigned_user_id drop not null;
