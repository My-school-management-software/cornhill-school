-- CORNHILL shared phone evidence capture foundation.
-- Additive only: no existing school records or financial transactions are modified.
create table if not exists public.evidence_capture_devices (
 id uuid primary key default gen_random_uuid(),
 assigned_user_id uuid not null references public.user_profiles(id) on delete restrict,
 device_name text not null check(length(btrim(device_name)) between 2 and 80),
 platform text not null default 'Android' check(platform in('Android','iOS','Windows','Other')),
 status text not null default 'Pending' check(status in('Pending','Active','Revoked')),
 pairing_code_hash text,
 pairing_expires_at timestamptz,
 paired_at timestamptz,
 last_seen_at timestamptz,
 created_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 check((status='Pending' and pairing_code_hash is not null and pairing_expires_at is not null)
    or status<>'Pending')
);
create index if not exists evidence_capture_devices_user_idx on public.evidence_capture_devices(assigned_user_id,status);
create table if not exists public.evidence_capture_requests (
 id uuid primary key default gen_random_uuid(),
 assigned_device_id uuid not null references public.evidence_capture_devices(id) on delete restrict,
 assigned_user_id uuid not null references public.user_profiles(id) on delete restrict,
 requested_by uuid not null references public.user_profiles(id) on delete restrict,
 purpose text not null check(purpose in('Bank deposit slip','Expense receipt','Withdrawal evidence','Staff ID','Learner document','General document','Other')),
 context_label text not null check(length(btrim(context_label)) between 2 and 180),
 context_type text,
 context_record_id text,
 amount_ugx bigint check(amount_ugx is null or amount_ugx>0),
 description text,
 status text not null default 'Pending' check(status in('Pending','Submitted','Cancelled')),
 expires_at timestamptz not null default (now()+interval '10 minutes'),
 submitted_at timestamptz,
 created_at timestamptz not null default now(),
 check((status='Submitted' and submitted_at is not null) or status<>'Submitted')
);
create index if not exists evidence_capture_requests_device_status_idx on public.evidence_capture_requests(assigned_device_id,status,created_at desc);
create index if not exists evidence_capture_requests_user_expiry_idx on public.evidence_capture_requests(assigned_user_id,expires_at,status);
create table if not exists public.evidence_capture_files (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.evidence_capture_requests(id) on delete restrict,
 storage_path text not null unique,
 original_file_name text not null,
 content_type text not null check(content_type in('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=15728640),
 uploaded_by uuid not null references public.user_profiles(id),
 captured_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists evidence_capture_files_request_idx on public.evidence_capture_files(request_id,created_at);
create table if not exists public.evidence_capture_reviews (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.evidence_capture_requests(id) on delete restrict,
 reviewed_by uuid not null references public.user_profiles(id),
 action text not null check(action in('Approved','Rejected','Needs clearer photo')),
 review_note text,
 created_at timestamptz not null default now()
);
create index if not exists evidence_capture_reviews_request_idx on public.evidence_capture_reviews(request_id,created_at desc);

alter table public.evidence_capture_devices enable row level security;
alter table public.evidence_capture_requests enable row level security;
alter table public.evidence_capture_files enable row level security;
alter table public.evidence_capture_reviews enable row level security;

drop policy if exists "Evidence devices admin manage" on public.evidence_capture_devices;
create policy "Evidence devices admin manage" on public.evidence_capture_devices
 for all to authenticated using((select public.is_school_admin())) with check((select public.is_school_admin()));
drop policy if exists "Evidence devices owner read" on public.evidence_capture_devices;
create policy "Evidence devices owner read" on public.evidence_capture_devices
 for select to authenticated using(assigned_user_id=(select auth.uid()) and status='Active');

drop policy if exists "Evidence requests admin manage" on public.evidence_capture_requests;
create policy "Evidence requests admin manage" on public.evidence_capture_requests
 for all to authenticated using((select public.is_school_admin())) with check((select public.is_school_admin()));
drop policy if exists "Evidence requests assigned user read" on public.evidence_capture_requests;
create policy "Evidence requests assigned user read" on public.evidence_capture_requests
 for select to authenticated using(assigned_user_id=(select auth.uid()));
drop policy if exists "Evidence requests assigned user submit" on public.evidence_capture_requests;
create policy "Evidence requests assigned user submit" on public.evidence_capture_requests
 for update to authenticated using(
  assigned_user_id=(select auth.uid()) and status='Pending' and expires_at>now()
 ) with check(
  assigned_user_id=(select auth.uid()) and status='Submitted' and submitted_at is not null
  and expires_at>now()
 );

drop policy if exists "Evidence files admin read" on public.evidence_capture_files;
create policy "Evidence files admin read" on public.evidence_capture_files
 for select to authenticated using((select public.is_school_admin()));
drop policy if exists "Evidence files assigned user read" on public.evidence_capture_files;
create policy "Evidence files assigned user read" on public.evidence_capture_files
 for select to authenticated using(uploaded_by=(select auth.uid()));
drop policy if exists "Evidence files assigned user add" on public.evidence_capture_files;
create policy "Evidence files assigned user add" on public.evidence_capture_files
 for insert to authenticated with check(
  uploaded_by=(select auth.uid()) and exists(
   select 1 from public.evidence_capture_requests r
   join public.evidence_capture_devices d on d.id=r.assigned_device_id
   where r.id=request_id and r.assigned_user_id=(select auth.uid())
    and r.status='Pending' and r.expires_at>now()
    and d.status='Active' and d.assigned_user_id=(select auth.uid())
  )
 );

drop policy if exists "Evidence reviews admin read" on public.evidence_capture_reviews;
create policy "Evidence reviews admin read" on public.evidence_capture_reviews
 for select to authenticated using((select public.is_school_admin()));
drop policy if exists "Evidence reviews admin add" on public.evidence_capture_reviews;
create policy "Evidence reviews admin add" on public.evidence_capture_reviews
 for insert to authenticated with check((select public.is_school_admin()) and reviewed_by=(select auth.uid()));

grant select,insert,update,delete on public.evidence_capture_devices to authenticated;
grant select,insert,update on public.evidence_capture_requests to authenticated;
grant select,insert on public.evidence_capture_files to authenticated;
grant select,insert on public.evidence_capture_reviews to authenticated;

-- Pairing codes are generated on the administrator's computer, stored only as SHA-256 hashes,
-- expire after ten minutes, and can be claimed only by the pre-assigned authenticated staff account.
create or replace function public.claim_evidence_capture_device(p_pairing_code text,p_device_name text,p_platform text default 'Android')
returns uuid language plpgsql security definer
set search_path=public,auth,extensions as $$
declare v_uid uuid:=auth.uid(); v_device_id uuid;
begin
 if v_uid is null then raise exception 'Sign in with your own CORNHILL staff account first' using errcode='42501'; end if;
 if length(coalesce(p_pairing_code,''))<24 or length(coalesce(p_pairing_code,''))>100 then
  raise exception 'Invalid or expired pairing code';
 end if;
 if length(btrim(coalesce(p_device_name,'')))<2 or length(btrim(p_device_name))>80 then
  raise exception 'Enter a device name';
 end if;
 if p_platform not in('Android','iOS','Windows','Other') then raise exception 'Unsupported device type'; end if;
 if not exists(select 1 from public.user_profiles u where u.id=v_uid and u.employment_status='Active') then
  raise exception 'Only active staff accounts can register a capture device' using errcode='42501';
 end if;
 select d.id into v_device_id from public.evidence_capture_devices d
 where d.assigned_user_id=v_uid and d.status='Pending'
  and d.pairing_expires_at>now()
  and d.pairing_code_hash=encode(extensions.digest(convert_to(p_pairing_code,'UTF8'),'sha256'),'hex')
 for update;
 if v_device_id is null then raise exception 'Pairing code is invalid, expired, or assigned to another staff account'; end if;
 update public.evidence_capture_devices set status='Active',device_name=btrim(p_device_name),
  platform=p_platform,pairing_code_hash=null,pairing_expires_at=null,paired_at=now(),last_seen_at=now()
 where id=v_device_id;
 return v_device_id;
end; $$;
revoke all on function public.claim_evidence_capture_device(text,text,text) from public,anon;
grant execute on function public.claim_evidence_capture_device(text,text,text) to authenticated;

-- Private evidence bucket; objects are scoped to a request UUID in the first folder segment.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cornhill-private-evidence','cornhill-private-evidence',false,15728640,
 array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=15728640,
 allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Evidence storage admin read" on storage.objects;
create policy "Evidence storage admin read" on storage.objects
 for select to authenticated using(bucket_id='cornhill-private-evidence' and (select public.is_school_admin()));
drop policy if exists "Evidence storage assigned read" on storage.objects;
create policy "Evidence storage assigned read" on storage.objects
 for select to authenticated using(
  bucket_id='cornhill-private-evidence' and exists(
   select 1 from public.evidence_capture_requests r
   where r.id::text=(storage.foldername(name))[1] and r.assigned_user_id=(select auth.uid())
  )
 );
drop policy if exists "Evidence storage assigned upload" on storage.objects;
create policy "Evidence storage assigned upload" on storage.objects
 for insert to authenticated with check(
  bucket_id='cornhill-private-evidence' and exists(
   select 1 from public.evidence_capture_requests r
   join public.evidence_capture_devices d on d.id=r.assigned_device_id
   where r.id::text=(storage.foldername(name))[1] and r.assigned_user_id=(select auth.uid())
    and r.status='Pending' and r.expires_at>now()
    and d.status='Active' and d.assigned_user_id=(select auth.uid())
  )
 );

-- Enable realtime notifications for a phone that is already signed in and online.
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' and tablename='evidence_capture_requests') then
  alter publication supabase_realtime add table public.evidence_capture_requests;
 end if;
end $$;

-- Restrict phone-side request updates to the two submission fields only.
revoke update on public.evidence_capture_requests from authenticated;
grant update(status,submitted_at) on public.evidence_capture_requests to authenticated;
drop policy if exists "Evidence requests assigned user submit" on public.evidence_capture_requests;
create policy "Evidence requests assigned user submit" on public.evidence_capture_requests
 for update to authenticated using(
  assigned_user_id=(select auth.uid()) and status='Pending' and expires_at>now()
 ) with check(
  assigned_user_id=(select auth.uid()) and status='Submitted' and submitted_at is not null
  and expires_at>now()
  and exists(select 1 from public.evidence_capture_files f
   where f.request_id=id and f.uploaded_by=(select auth.uid()))
 );
drop policy if exists "Evidence files assigned user add" on public.evidence_capture_files;
create policy "Evidence files assigned user add" on public.evidence_capture_files
 for insert to authenticated with check(
  uploaded_by=(select auth.uid()) and storage_path like request_id::text||'/%'
  and exists(
   select 1 from public.evidence_capture_requests r
   join public.evidence_capture_devices d on d.id=r.assigned_device_id
   where r.id=request_id and r.assigned_user_id=(select auth.uid())
    and r.status='Pending' and r.expires_at>now()
    and d.status='Active' and d.assigned_user_id=(select auth.uid())
  )
 );
