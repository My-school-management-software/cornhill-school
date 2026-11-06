-- Accountable bursary awards for learners admitted on regular fees.
begin;
create table if not exists public.learner_bursary_awards (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete restrict,
 bursary_category text not null check (bursary_category in ('Full bursary','Half bursary','Partial bursary','Fully sponsored')),
 amount_payable_ugx bigint not null check (amount_payable_ugx >= 0),
 reason text not null check (length(btrim(reason)) between 5 and 1000),
 sponsor_source text,
 billing_period_label text not null check (length(btrim(billing_period_label)) between 1 and 80),
 effective_from date not null,
 effective_until date,
 support_document_path text,
 approved_by uuid not null references auth.users(id) on delete restrict,
 approved_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 constraint learner_bursary_award_dates_check check (effective_until is null or effective_until >= effective_from),
 constraint learner_bursary_award_amount_check check ((bursary_category in ('Full bursary','Fully sponsored') and amount_payable_ugx=0) or (bursary_category in ('Half bursary','Partial bursary') and amount_payable_ugx>0)),
 constraint learner_bursary_award_period_unique unique(student_id,billing_period_label)
);
create index if not exists learner_bursary_awards_student_dates_idx on public.learner_bursary_awards(student_id,effective_from,effective_until);
alter table public.learner_bursary_awards enable row level security;
drop policy if exists "School admins read learner bursary awards" on public.learner_bursary_awards;
create policy "School admins read learner bursary awards" on public.learner_bursary_awards for select to authenticated using ((select public.is_school_admin()));
revoke all on public.learner_bursary_awards from anon, authenticated;
grant select on public.learner_bursary_awards to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bursary-evidence','bursary-evidence',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "School admins upload bursary evidence" on storage.objects;
create policy "School admins upload bursary evidence" on storage.objects for insert to authenticated with check (bucket_id='bursary-evidence' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select public.is_school_admin()));
drop policy if exists "School admins read bursary evidence" on storage.objects;
create policy "School admins read bursary evidence" on storage.objects for select to authenticated using (bucket_id='bursary-evidence' and (select public.is_school_admin()));
drop policy if exists "School admins delete bursary evidence" on storage.objects;
create policy "School admins delete bursary evidence" on storage.objects for delete to authenticated using (bucket_id='bursary-evidence' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select public.is_school_admin()));
create or replace function public.admin_award_bursary_to_existing_learner(
 p_student_id uuid,p_bursary_category text,p_amount_payable_ugx bigint,p_reason text,p_sponsor_source text,
 p_billing_period_label text,p_effective_from date,p_effective_until date,p_support_document_path text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may approve a bursary' using errcode='42501'; end if;
 if p_student_id is null or not exists(select 1 from public.students where id=p_student_id and status='Active') then raise exception 'Choose an active learner'; end if;
 if p_bursary_category not in ('Full bursary','Half bursary','Partial bursary','Fully sponsored') then raise exception 'Choose a valid bursary category'; end if;
 if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5 then raise exception 'Enter a reason of at least five characters'; end if;
 if nullif(btrim(p_billing_period_label),'') is null then raise exception 'Enter the billing period this award covers'; end if;
 if p_effective_from is null or p_effective_from>current_date or (p_effective_until is not null and p_effective_until<p_effective_from) then raise exception 'Effective date must be today or earlier, and the end date cannot be before it'; end if;
 if p_bursary_category in ('Full bursary','Fully sponsored') and coalesce(p_amount_payable_ugx,-1)<>0 then raise exception 'Full bursary and fully sponsored awards must have UGX 0 payable'; end if;
 if p_bursary_category in ('Half bursary','Partial bursary') and coalesce(p_amount_payable_ugx,0)<=0 then raise exception 'Enter a positive amount payable'; end if;
 if p_support_document_path is not null and (left(p_support_document_path,length(auth.uid()::text)+1)<>auth.uid()::text||'/' or position('..' in p_support_document_path)>0) then raise exception 'Invalid bursary evidence file path'; end if;
 insert into public.learner_bursary_awards(student_id,bursary_category,amount_payable_ugx,reason,sponsor_source,billing_period_label,effective_from,effective_until,support_document_path,approved_by)
 values(p_student_id,p_bursary_category,p_amount_payable_ugx,btrim(p_reason),nullif(btrim(p_sponsor_source),''),btrim(p_billing_period_label),p_effective_from,p_effective_until,p_support_document_path,auth.uid()) returning id into v_id;
 if p_amount_payable_ugx>0 then
  insert into public.learner_charges(invoice_no,student_id,description,amount_ugx,created_by)
  values('BUR-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,btrim(p_billing_period_label)||' - Approved bursary payable ('||p_bursary_category||') - '||btrim(p_reason),p_amount_payable_ugx,auth.uid());
 end if;
 return v_id;
end; $$;
revoke all on function public.admin_award_bursary_to_existing_learner(uuid,text,bigint,text,text,text,date,date,text) from public,anon;
grant execute on function public.admin_award_bursary_to_existing_learner(uuid,text,bigint,text,text,text,date,date,text) to authenticated;
commit;