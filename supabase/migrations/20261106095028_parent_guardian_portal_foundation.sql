-- Migration already applied to Supabase project yemhortbudwbcrzsoozk.
-- Parent/guardian portal foundation and admin-only contact directory.
create table if not exists public.parent_guardian_contacts (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete cascade,
 guardian_name text not null, relationship text, phone_e164 text, whatsapp_e164 text,
 sms_opt_in boolean not null default false, whatsapp_opt_in boolean not null default false,
 is_primary boolean not null default false, is_active boolean not null default true, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint parent_guardian_contacts_phone_format check (phone_e164 is null or phone_e164 ~ '^\\+256[0-9]{9}$'),
 constraint parent_guardian_contacts_whatsapp_format check (whatsapp_e164 is null or whatsapp_e164 ~ '^\\+256[0-9]{9}$')
);
create unique index if not exists parent_guardian_contacts_student_phone_uidx on public.parent_guardian_contacts(student_id,phone_e164) where phone_e164 is not null;
create index if not exists parent_guardian_contacts_phone_active_idx on public.parent_guardian_contacts(phone_e164) where is_active and phone_e164 is not null;
create index if not exists parent_guardian_contacts_student_idx on public.parent_guardian_contacts(student_id);
create table if not exists public.parent_contact_change_log (
 id bigint generated always as identity primary key, contact_id uuid not null, student_id uuid not null,
 changed_by uuid, changed_at timestamptz not null default now(), old_phone_e164 text, new_phone_e164 text,
 old_whatsapp_e164 text, new_whatsapp_e164 text, change_reason text not null
);
create index if not exists parent_contact_change_log_student_idx on public.parent_contact_change_log(student_id,changed_at desc);
create table if not exists public.learner_conduct_reports (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
 report_type text not null check(report_type in ('Positive','Concern','General')), title text not null, details text not null,
 visible_to_guardian boolean not null default false, published_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists learner_conduct_reports_student_published_idx on public.learner_conduct_reports(student_id,published_at desc) where visible_to_guardian=true;
alter table public.parent_guardian_contacts enable row level security;
alter table public.parent_contact_change_log enable row level security;
alter table public.learner_conduct_reports enable row level security;
drop policy if exists "Admins manage parent guardian contacts" on public.parent_guardian_contacts;
create policy "Admins manage parent guardian contacts" on public.parent_guardian_contacts for all to authenticated using(public.is_school_admin()) with check(public.is_school_admin());
drop policy if exists "Admins read parent contact change log" on public.parent_contact_change_log;
create policy "Admins read parent contact change log" on public.parent_contact_change_log for select to authenticated using(public.is_school_admin());
drop policy if exists "Admins manage learner conduct reports" on public.learner_conduct_reports;
create policy "Admins manage learner conduct reports" on public.learner_conduct_reports for all to authenticated using(public.is_school_admin()) with check(public.is_school_admin());
drop policy if exists "Assigned teachers read learner conduct reports" on public.learner_conduct_reports;
create policy "Assigned teachers read learner conduct reports" on public.learner_conduct_reports for select to authenticated using(exists(select 1 from public.students s where s.id=learner_conduct_reports.student_id and public.is_class_teacher_for_class(s.class_id)));
drop policy if exists "Assigned teachers create learner conduct reports" on public.learner_conduct_reports;
create policy "Assigned teachers create learner conduct reports" on public.learner_conduct_reports for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.students s where s.id=learner_conduct_reports.student_id and public.is_class_teacher_for_class(s.class_id)));
create or replace function public.log_parent_contact_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (old.phone_e164 is distinct from new.phone_e164 or old.whatsapp_e164 is distinct from new.whatsapp_e164 or old.is_active is distinct from new.is_active) then
  insert into public.parent_contact_change_log(contact_id,student_id,changed_by,old_phone_e164,new_phone_e164,old_whatsapp_e164,new_whatsapp_e164,change_reason)
  values(new.id,new.student_id,auth.uid(),old.phone_e164,new.phone_e164,old.whatsapp_e164,new.whatsapp_e164,coalesce(nullif(current_setting('app.parent_contact_change_reason',true),''),'Contact details/status updated'));
 end if;
 new.updated_at:=now(); return new;
end $$;
revoke all on function public.log_parent_contact_change() from public,anon,authenticated;
drop trigger if exists parent_contact_change_audit on public.parent_guardian_contacts;
create trigger parent_contact_change_audit before update on public.parent_guardian_contacts for each row execute function public.log_parent_contact_change();
insert into public.parent_guardian_contacts(student_id,guardian_name,relationship,phone_e164,whatsapp_e164,sms_opt_in,whatsapp_opt_in,is_primary)
select s.id,coalesce(nullif(s.guardian_name,''),'Parent/Guardian'),s.guardian_relationship,
 case when regexp_replace(coalesce(s.guardian_phone,''),'[^0-9+]','','g') ~ '^\\+256[0-9]{9}$' then regexp_replace(s.guardian_phone,'[^0-9+]','','g')
 when regexp_replace(coalesce(s.guardian_phone,''),'[^0-9]','','g') ~ '^0[0-9]{9}$' then '+256'||substr(regexp_replace(s.guardian_phone,'[^0-9]','','g'),2)
 when regexp_replace(coalesce(s.guardian_phone,''),'[^0-9]','','g') ~ '^256[0-9]{9}$' then '+'||regexp_replace(s.guardian_phone,'[^0-9]','','g') else null end,
 case when regexp_replace(coalesce(s.guardian_whatsapp_phone,''),'[^0-9+]','','g') ~ '^\\+256[0-9]{9}$' then regexp_replace(s.guardian_whatsapp_phone,'[^0-9+]','','g')
 when regexp_replace(coalesce(s.guardian_whatsapp_phone,''),'[^0-9]','','g') ~ '^0[0-9]{9}$' then '+256'||substr(regexp_replace(s.guardian_whatsapp_phone,'[^0-9]','','g'),2)
 when regexp_replace(coalesce(s.guardian_whatsapp_phone,''),'[^0-9]','','g') ~ '^256[0-9]{9}$' then '+'||regexp_replace(s.guardian_whatsapp_phone,'[^0-9]','','g') else null end,
 coalesce(s.guardian_sms_opt_in,false),coalesce(s.guardian_whatsapp_opt_in,false),true
from public.students s where nullif(s.guardian_name,'') is not null or nullif(s.guardian_phone,'') is not null on conflict do nothing;
insert into public.parent_guardian_contacts(student_id,guardian_name,relationship,phone_e164,is_primary)
select s.id,coalesce(nullif(s.alternate_guardian_name,''),'Alternate Guardian'),'Alternate Guardian',
 case when regexp_replace(coalesce(s.alternate_guardian_phone,''),'[^0-9+]','','g') ~ '^\\+256[0-9]{9}$' then regexp_replace(s.alternate_guardian_phone,'[^0-9+]','','g')
 when regexp_replace(coalesce(s.alternate_guardian_phone,''),'[^0-9]','','g') ~ '^0[0-9]{9}$' then '+256'||substr(regexp_replace(s.alternate_guardian_phone,'[^0-9]','','g'),2)
 when regexp_replace(coalesce(s.alternate_guardian_phone,''),'[^0-9]','','g') ~ '^256[0-9]{9}$' then '+'||regexp_replace(s.alternate_guardian_phone,'[^0-9]','','g') else null end,false
from public.students s where nullif(s.alternate_guardian_name,'') is not null or nullif(s.alternate_guardian_phone,'') is not null on conflict do nothing;
create or replace function public.parent_portal_get_learner(p_pupil_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_phone text; v_student_id uuid; v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in with the registered guardian phone first'; end if;
 v_phone:=nullif(auth.jwt()->>'phone','');
 if v_phone is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.phone=v_phone and u.phone_confirmed_at is not null) then raise exception 'A verified guardian phone is required'; end if;
 select s.id into v_student_id from public.students s where upper(s.admission_number)=upper(trim(p_pupil_code))
 and exists(select 1 from public.parent_guardian_contacts c where c.student_id=s.id and c.phone_e164=v_phone and c.is_active=true) limit 1;
 if v_student_id is null then raise exception 'No learner is linked to this verified guardian number and code'; end if;
 select jsonb_build_object(
 'learner',(select jsonb_build_object('pupil_code',s.admission_number,'first_name',s.first_name,'middle_name',s.middle_name,'last_name',s.last_name,'gender',s.gender,'date_of_birth',s.date_of_birth,'age_years',case when s.date_of_birth is null then null else extract(year from age(current_date,s.date_of_birth))::int end,'lin',s.lin,'class_name',sc.name,'stream',sc.stream,'learner_type',s.learner_type,'status',s.status,'admission_date',s.admission_date) from public.students s left join public.school_classes sc on sc.id=s.class_id where s.id=v_student_id),
 'assessments',coalesce((select jsonb_agg(jsonb_build_object('assessment',a.title,'assessment_type',a.assessment_type,'assessment_date',a.assessment_date,'subject',sub.name,'term',t.name,'academic_year',ay.name,'score',scr.score,'maximum_score',a.max_score,'teacher_comment',scr.teacher_comment) order by a.assessment_date nulls last,a.created_at) from public.assessment_scores scr join public.assessments a on a.id=scr.assessment_id join public.subjects sub on sub.id=a.subject_id join public.academic_terms t on t.id=a.term_id left join public.academic_years ay on ay.id=t.academic_year_id where scr.student_id=v_student_id),'[]'::jsonb),
 'published_reports',coalesce((select jsonb_agg(jsonb_build_object('term_id',t.id,'term',t.name,'academic_year',ay.name,'published_at',rp.approved_at) order by rp.approved_at desc) from public.report_card_publications rp join public.academic_terms t on t.id=rp.term_id left join public.academic_years ay on ay.id=t.academic_year_id where rp.student_id=v_student_id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('receipt_no',p.receipt_no,'amount_ugx',p.amount_ugx,'payment_method',p.payment_method,'collection_item',p.collection_item,'payer_name',p.payer_name,'received_at',p.received_at,'term',t.name,'academic_year',ay.name) order by p.received_at desc) from public.school_payments p left join lateral(select lc.term_id from public.payment_allocations pa join public.learner_charges lc on lc.id=pa.charge_id where pa.payment_id=p.id order by pa.created_at limit 1) alloc on true left join public.academic_terms t on t.id=alloc.term_id left join public.academic_years ay on ay.id=t.academic_year_id where p.student_id=v_student_id and p.status='Posted'),'[]'::jsonb),
 'balances',jsonb_build_object('total_charged_ugx',coalesce((select sum(lc.amount_ugx) from public.learner_charges lc where lc.student_id=v_student_id),0),'total_allocated_ugx',coalesce((select sum(pa.amount_ugx) from public.payment_allocations pa join public.school_payments p on p.id=pa.payment_id and p.status='Posted' join public.learner_charges lc on lc.id=pa.charge_id and lc.student_id=v_student_id),0),'outstanding_ugx',greatest(0,coalesce((select sum(lc.amount_ugx) from public.learner_charges lc where lc.student_id=v_student_id),0)-coalesce((select sum(pa.amount_ugx) from public.payment_allocations pa join public.school_payments p on p.id=pa.payment_id and p.status='Posted' join public.learner_charges lc on lc.id=pa.charge_id and lc.student_id=v_student_id),0))),
 'conduct_reports',coalesce((select jsonb_agg(jsonb_build_object('report_type',cr.report_type,'title',cr.title,'details',cr.details,'published_at',cr.published_at) order by cr.published_at desc) from public.learner_conduct_reports cr where cr.student_id=v_student_id and cr.visible_to_guardian=true and cr.published_at is not null and cr.published_at<=now()),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;
revoke all on function public.parent_portal_get_learner(text) from public,anon;
grant execute on function public.parent_portal_get_learner(text) to authenticated;
revoke all on public.parent_guardian_contacts from anon,authenticated;
grant select,insert,update,delete on public.parent_guardian_contacts to authenticated;
revoke all on public.parent_contact_change_log from anon,authenticated;
grant select on public.parent_contact_change_log to authenticated;
revoke all on public.learner_conduct_reports from anon,authenticated;
grant select,insert,update,delete on public.learner_conduct_reports to authenticated;
