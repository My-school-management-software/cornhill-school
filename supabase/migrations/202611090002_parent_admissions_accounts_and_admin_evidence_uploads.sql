-- CORNHILL: allow parent application accounts to track their own admission enquiries.
-- Keep the application queue as the single record; this does not create learner records.
alter table public.school_admission_enquiries
  add column if not exists applicant_user_id uuid references auth.users(id) on delete set null;

create index if not exists school_admission_enquiries_applicant_user_idx
  on public.school_admission_enquiries(applicant_user_id, created_at desc)
  where applicant_user_id is not null;

drop policy if exists "Public can submit pending admission enquiries" on public.school_admission_enquiries;
create policy "Public can submit pending admission enquiries"
on public.school_admission_enquiries
for insert
to anon, authenticated
with check (
  status = 'Pending'
  and reviewed_by is null
  and reviewed_at is null
  and review_note is null
  and (
    (auth.uid() is null and applicant_user_id is null)
    or
    (auth.uid() is not null and applicant_user_id = (select auth.uid()))
  )
);

drop policy if exists "Parents read own admission enquiries" on public.school_admission_enquiries;
create policy "Parents read own admission enquiries"
on public.school_admission_enquiries
for select
to authenticated
using (applicant_user_id = (select auth.uid()));

-- Admins may attach a file already stored on their computer to an active
-- evidence request they created. Phone capture continues to use its existing
-- assigned-device policy. Both paths use the same private evidence bucket/table.
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

-- A local-computer upload is a valid evidence source even when no phone is assigned.
alter table public.evidence_capture_requests
  alter column assigned_device_id drop not null,
  alter column assigned_user_id drop not null;
