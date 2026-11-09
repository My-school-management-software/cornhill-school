create table if not exists public.learner_enrolment_periods (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id) on delete restrict,
 admission_date date not null,
 exit_date date,
 class_id uuid references public.school_classes(id) on delete set null,
 academic_year_id uuid references public.academic_years(id) on delete set null,
 term_id uuid references public.academic_terms(id) on delete set null,
 status text not null default 'Active' check(status in('Active','Withdrawn','Transferred','Completed')),
 exit_reason text,
 re_admission_reason text,
 previous_period_id uuid references public.learner_enrolment_periods(id) on delete set null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint learner_enrolment_periods_dates_check check(exit_date is null or exit_date>=admission_date)
);
create unique index if not exists learner_enrolment_periods_one_active_per_student on public.learner_enrolment_periods(student_id) where status='Active';
create index if not exists learner_enrolment_periods_student_history_idx on public.learner_enrolment_periods(student_id,admission_date desc);
alter table public.learner_charges add column if not exists enrolment_period_id uuid references public.learner_enrolment_periods(id) on delete restrict;
alter table public.school_payments add column if not exists enrolment_period_id uuid references public.learner_enrolment_periods(id) on delete restrict;

insert into public.learner_enrolment_periods(student_id,admission_date,exit_date,class_id,status,created_at)
select s.id,coalesce(s.admission_date,(s.created_at at time zone 'Africa/Kampala')::date),
 case when s.status='Active' then null else coalesce(sh.effective_date,s.admission_date) end,s.class_id,
 case s.status when 'Active' then 'Active' when 'Transferred' then 'Transferred' when 'Graduated' then 'Completed' else 'Withdrawn' end,
 coalesce(s.created_at,now())
from public.students s
left join lateral(select h.effective_date from public.student_status_history h where h.student_id=s.id order by h.effective_date desc,h.changed_at desc limit 1) sh on true
where not exists(select 1 from public.learner_enrolment_periods ep where ep.student_id=s.id);

update public.learner_charges c set enrolment_period_id=ep.id from public.learner_enrolment_periods ep
where ep.student_id=c.student_id and c.enrolment_period_id is null
and ep.id=(select ep2.id from public.learner_enrolment_periods ep2 where ep2.student_id=c.student_id order by ep2.admission_date desc,ep2.created_at desc limit 1);
update public.school_payments p set enrolment_period_id=ep.id from public.learner_enrolment_periods ep
where ep.student_id=p.student_id and p.enrolment_period_id is null
and ep.id=(select ep2.id from public.learner_enrolment_periods ep2 where ep2.student_id=p.student_id order by ep2.admission_date desc,ep2.created_at desc limit 1);

create or replace function public.create_initial_learner_enrolment_period() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.learner_enrolment_periods(student_id,admission_date,class_id,status,created_by)
 values(new.id,coalesce(new.admission_date,(timezone('Africa/Kampala',now()))::date),new.class_id,
 case when new.status='Active' then 'Active' when new.status='Transferred' then 'Transferred' when new.status='Graduated' then 'Completed' else 'Withdrawn' end,auth.uid());
 return new;
end;$$;
drop trigger if exists aaa_create_initial_learner_enrolment_period on public.students;
create trigger aaa_create_initial_learner_enrolment_period after insert on public.students for each row execute function public.create_initial_learner_enrolment_period();

create or replace function public.sync_learner_enrolment_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status<>'Active' then
  update public.learner_enrolment_periods set status=case new.status when 'Transferred' then 'Transferred' when 'Graduated' then 'Completed' else 'Withdrawn' end,
   exit_date=greatest((timezone('Africa/Kampala',now()))::date,admission_date)
  where student_id=new.id and status='Active';
 end if;
 return new;
end;$$;
drop trigger if exists students_sync_learner_enrolment_status on public.students;
create trigger students_sync_learner_enrolment_status after update of status on public.students for each row execute function public.sync_learner_enrolment_status();

create or replace function public.assign_current_enrolment_to_new_charge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.enrolment_period_id is null then
  select ep.id into new.enrolment_period_id from public.learner_enrolment_periods ep
  where ep.student_id=new.student_id and ep.status='Active' order by ep.admission_date desc,ep.created_at desc limit 1;
 end if;
 if new.enrolment_period_id is null then raise exception 'A current learner enrolment is required before adding a new charge'; end if;
 return new;
end;$$;
drop trigger if exists learner_charges_assign_current_enrolment on public.learner_charges;
create trigger learner_charges_assign_current_enrolment before insert on public.learner_charges for each row execute function public.assign_current_enrolment_to_new_charge();

create or replace function public.assign_current_enrolment_to_new_payment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.enrolment_period_id is null then
  select ep.id into new.enrolment_period_id from public.learner_enrolment_periods ep
  where ep.student_id=new.student_id and ep.status='Active' order by ep.admission_date desc,ep.created_at desc limit 1;
 end if;
 if new.enrolment_period_id is null then raise exception 'A current learner enrolment is required before posting a payment'; end if;
 return new;
end;$$;
drop trigger if exists school_payments_assign_current_enrolment on public.school_payments;
create trigger school_payments_assign_current_enrolment before insert on public.school_payments for each row execute function public.assign_current_enrolment_to_new_payment();

create or replace function public.apply_existing_learner_credit_to_new_charge() returns trigger language plpgsql security definer set search_path='public' as $$
declare v_payment record;v_due bigint:=new.amount_ugx;v_apply bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.student_id::text,0));
 select greatest(0,new.amount_ugx-coalesce(sum(a.amount_ugx),0)) into v_due from public.payment_allocations a join public.school_payments p on p.id=a.payment_id where a.charge_id=new.id and p.status='Posted';
 for v_payment in select p.id,p.unallocated_amount_ugx from public.school_payments p
  where p.student_id=new.student_id and p.enrolment_period_id=new.enrolment_period_id and p.status='Posted' and p.unallocated_amount_ugx>0
  order by p.received_at,p.id for update of p
 loop
  exit when v_due<=0;v_apply:=least(v_due,v_payment.unallocated_amount_ugx);
  if v_apply>0 then insert into public.payment_allocations(payment_id,charge_id,amount_ugx) values(v_payment.id,new.id,v_apply);
   update public.school_payments set unallocated_amount_ugx=unallocated_amount_ugx-v_apply where id=v_payment.id;v_due:=v_due-v_apply;end if;
 end loop;return new;
end;$$;

create or replace function public.post_school_payment_complete(p_student_id uuid,p_amount_ugx bigint,p_payment_method text,p_payment_reference text default null,p_notes text default null,p_allocations jsonb default null,p_collection_item text default 'School fees',p_payer_name text default null)
returns table(payment_id uuid,receipt_no text,unallocated_amount_ugx bigint) language plpgsql security definer set search_path='public','auth' as $$
declare v_uid uuid:=auth.uid();v_payment_id uuid:=gen_random_uuid();v_receipt text;v_remaining bigint:=p_amount_ugx;v_item jsonb;v_charge_id uuid;v_amount bigint;v_due bigint;v_paid bigint;v_sum bigint:=0;v_seen_charge_ids uuid[]:='{}'::uuid[];v_enrolment_period_id uuid;
begin
 if v_uid is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may post payments' using errcode='42501';end if;
 if p_student_id is null or p_amount_ugx is null or p_amount_ugx<=0 then raise exception 'Select a learner and enter a payment amount greater than zero';end if;
 if p_payment_method not in('Cash','Mobile Money','Bank Transfer','Card','Other') then raise exception 'Invalid payment method';end if;
 if nullif(btrim(p_collection_item),'') is null then raise exception 'Enter the payment reason before posting the payment';end if;
 if p_allocations is not null and jsonb_typeof(p_allocations)<>'array' then raise exception 'Payment allocations must be a list';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text,0));
 select ep.id into v_enrolment_period_id from public.learner_enrolment_periods ep where ep.student_id=p_student_id and ep.status='Active' order by ep.admission_date desc,ep.created_at desc limit 1 for update;
 if v_enrolment_period_id is null then raise exception 'This learner has no active enrolment. Re-admit the learner before posting a new payment';end if;
 if p_allocations is not null then
  for v_item in select value from jsonb_array_elements(p_allocations) loop
   if coalesce(v_item->>'charge_id','')='' or coalesce(v_item->>'amount_ugx','')='' then raise exception 'Each allocation needs a fee charge and amount';end if;
   v_charge_id:=(v_item->>'charge_id')::uuid;v_amount:=(v_item->>'amount_ugx')::bigint;
   if v_amount is null or v_amount<=0 then raise exception 'Each allocation must be greater than zero';end if;
   if v_charge_id=any(v_seen_charge_ids) then raise exception 'A fee charge can only appear once in a payment allocation';end if;
   v_seen_charge_ids:=array_append(v_seen_charge_ids,v_charge_id);
   select c.amount_ugx into v_due from public.learner_charges c where c.id=v_charge_id and c.student_id=p_student_id and c.enrolment_period_id=v_enrolment_period_id for update;
   if not found then raise exception 'A selected fee charge does not belong to this active enrolment';end if;
   select coalesce(sum(a.amount_ugx),0) into v_paid from public.payment_allocations a join public.school_payments p on p.id=a.payment_id where a.charge_id=v_charge_id and p.status='Posted';
   if v_amount>v_due-v_paid then raise exception 'An allocation exceeds the remaining balance on a selected fee charge';end if;v_sum:=v_sum+v_amount;
  end loop;
  if v_sum>p_amount_ugx then raise exception 'Allocated amounts cannot exceed the payment received';end if;
 end if;
 v_receipt:='CHR-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||lpad(nextval('public.school_receipt_seq')::text,6,'0');
 insert into public.school_payments(id,receipt_no,student_id,enrolment_period_id,amount_ugx,unallocated_amount_ugx,payment_method,payment_reference,notes,received_by,collection_item,payer_name)
 values(v_payment_id,v_receipt,p_student_id,v_enrolment_period_id,p_amount_ugx,p_amount_ugx,p_payment_method,nullif(trim(p_payment_reference),''),nullif(trim(p_notes),''),v_uid,btrim(p_collection_item),nullif(btrim(p_payer_name),''));
 if p_allocations is not null then
  for v_item in select value from jsonb_array_elements(p_allocations) loop insert into public.payment_allocations(payment_id,charge_id,amount_ugx) values(v_payment_id,(v_item->>'charge_id')::uuid,(v_item->>'amount_ugx')::bigint);end loop;
  v_remaining:=p_amount_ugx-v_sum;
 end if;
 for v_charge_id,v_due in select c.id,c.amount_ugx from public.learner_charges c left join public.fee_items fi on fi.id=c.fee_item_id
  where c.student_id=p_student_id and c.enrolment_period_id=v_enrolment_period_id
  order by case when position(lower(btrim(p_collection_item)) in lower(coalesce(fi.name,'')||' '||c.description))>0 then 0 else 1 end,c.created_at,c.id for update of c
 loop
  exit when v_remaining<=0;
  select coalesce(sum(a.amount_ugx),0) into v_paid from public.payment_allocations a join public.school_payments p on p.id=a.payment_id where a.charge_id=v_charge_id and p.status='Posted';
  v_due:=v_due-v_paid;
  if v_due>0 then insert into public.payment_allocations(payment_id,charge_id,amount_ugx) values(v_payment_id,v_charge_id,least(v_due,v_remaining));v_remaining:=v_remaining-least(v_due,v_remaining);end if;
 end loop;
 update public.school_payments set unallocated_amount_ugx=v_remaining where id=v_payment_id;
 return query select v_payment_id,v_receipt,v_remaining;
end;$$;

create or replace view public.learner_account_balances as
select s.id as student_id,s.admission_number,concat_ws(' ',s.first_name,s.middle_name,s.last_name) as learner_name,
 coalesce(ch.total_charged,0)::bigint as total_charged_ugx,coalesce(pa.total_allocated,0)::bigint as total_paid_ugx,
 coalesce(cr.total_credit,0)::bigint as credit_ugx,
 (coalesce(ch.total_charged,0)-coalesce(pa.total_allocated,0)-coalesce(cr.total_credit,0))::bigint as balance_ugx
from public.students s left join public.learner_enrolment_periods current_ep on current_ep.student_id=s.id and current_ep.status='Active'
left join (select c.enrolment_period_id,sum(c.amount_ugx) total_charged from public.learner_charges c join public.learner_enrolment_periods ep on ep.id=c.enrolment_period_id and ep.status='Active' group by c.enrolment_period_id) ch on ch.enrolment_period_id=current_ep.id
left join (select c.enrolment_period_id,sum(a.amount_ugx) total_allocated from public.payment_allocations a join public.learner_charges c on c.id=a.charge_id join public.school_payments p on p.id=a.payment_id and p.status='Posted' join public.learner_enrolment_periods ep on ep.id=c.enrolment_period_id and ep.status='Active' group by c.enrolment_period_id) pa on pa.enrolment_period_id=current_ep.id
left join (select p.enrolment_period_id,sum(p.unallocated_amount_ugx) total_credit from public.school_payments p join public.learner_enrolment_periods ep on ep.id=p.enrolment_period_id and ep.status='Active' where p.status='Posted' group by p.enrolment_period_id) cr on cr.enrolment_period_id=current_ep.id;

create or replace view public.learner_enrolment_period_balances with (security_invoker=true) as
select ep.id enrolment_period_id,ep.student_id,ep.admission_date,ep.exit_date,ep.status,ep.class_id,ep.re_admission_reason,
 coalesce(ch.total_charged,0)::bigint total_charged_ugx,coalesce(pa.total_allocated,0)::bigint total_paid_ugx,coalesce(cr.total_credit,0)::bigint credit_ugx,
 (coalesce(ch.total_charged,0)-coalesce(pa.total_allocated,0)-coalesce(cr.total_credit,0))::bigint balance_ugx
from public.learner_enrolment_periods ep
left join (select enrolment_period_id,sum(amount_ugx) total_charged from public.learner_charges group by enrolment_period_id) ch on ch.enrolment_period_id=ep.id
left join (select c.enrolment_period_id,sum(a.amount_ugx) total_allocated from public.payment_allocations a join public.learner_charges c on c.id=a.charge_id join public.school_payments p on p.id=a.payment_id and p.status='Posted' group by c.enrolment_period_id) pa on pa.enrolment_period_id=ep.id
left join (select enrolment_period_id,sum(unallocated_amount_ugx) total_credit from public.school_payments where status='Posted' group by enrolment_period_id) cr on cr.enrolment_period_id=ep.id;

alter table public.learner_enrolment_periods enable row level security;
revoke all on public.learner_enrolment_periods from anon;
grant select on public.learner_enrolment_periods to authenticated;
drop policy if exists learner_enrolment_periods_admin_select on public.learner_enrolment_periods;
create policy learner_enrolment_periods_admin_select on public.learner_enrolment_periods for select to authenticated using(public.is_school_admin());

create or replace function public.admin_find_learner_matches(p_first_name text,p_last_name text,p_middle_name text default null,p_date_of_birth date default null,p_birth_year integer default null,p_lin text default null,p_guardian_phone text default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Only school administrators may search previous learner records' using errcode='42501';end if;
 return query select to_jsonb(x) from (
  select s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,s.date_of_birth,s.birth_year,s.lin,s.status,s.admission_date,c.name class_name,
   case when nullif(btrim(p_lin),'') is not null and lower(coalesce(s.lin,''))=lower(btrim(p_lin)) then 100
    when nullif(regexp_replace(coalesce(p_guardian_phone,''),'[^0-9]','','g'),'') is not null and regexp_replace(coalesce(s.guardian_phone,''),'[^0-9]','','g')=regexp_replace(p_guardian_phone,'[^0-9]','','g') then 90
    when p_date_of_birth is not null and s.date_of_birth=p_date_of_birth and lower(s.first_name)=lower(btrim(p_first_name)) and lower(s.last_name)=lower(btrim(p_last_name)) then 95
    when p_birth_year is not null and s.birth_year=p_birth_year and lower(s.first_name)=lower(btrim(p_first_name)) and lower(s.last_name)=lower(btrim(p_last_name)) then 75 else 50 end match_score
  from public.students s left join public.school_classes c on c.id=s.class_id
  where (nullif(btrim(p_lin),'') is not null and lower(coalesce(s.lin,''))=lower(btrim(p_lin)))
   or (nullif(regexp_replace(coalesce(p_guardian_phone,''),'[^0-9]','','g'),'') is not null and regexp_replace(coalesce(s.guardian_phone,''),'[^0-9]','','g')=regexp_replace(p_guardian_phone,'[^0-9]','','g'))
   or (lower(s.first_name)=lower(btrim(coalesce(p_first_name,''))) and lower(s.last_name)=lower(btrim(coalesce(p_last_name,'')))
    and (p_date_of_birth is null or s.date_of_birth=p_date_of_birth or (p_birth_year is not null and s.birth_year=p_birth_year) or (p_date_of_birth is null and p_birth_year is null)))
  order by match_score desc,s.admission_date desc limit 10
 ) x;
end;$$;

create or replace function public.admin_readmit_learner(p_student_id uuid,p_class_id uuid,p_admission_date date,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_student public.students%rowtype;v_previous_period_id uuid;v_new_period_id uuid;
begin
 if v_uid is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may re-admit a learner' using errcode='42501';end if;
 if p_student_id is null or p_admission_date is null then raise exception 'Select a previous learner and enter a new admission date';end if;
 if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5 or length(btrim(p_reason))>500 then raise exception 'Enter a re-admission reason between 5 and 500 characters';end if;
 select * into v_student from public.students where id=p_student_id for update;
 if not found then raise exception 'Previous learner record was not found';end if;
 if v_student.status='Active' or exists(select 1 from public.learner_enrolment_periods where student_id=p_student_id and status='Active') then raise exception 'This learner is already actively enrolled. Use the existing learner record instead of re-admitting';end if;
 if p_class_id is not null and not exists(select 1 from public.school_classes where id=p_class_id) then raise exception 'The selected class does not exist';end if;
 select id into v_previous_period_id from public.learner_enrolment_periods where student_id=p_student_id order by admission_date desc,created_at desc limit 1;
 insert into public.learner_enrolment_periods(student_id,admission_date,class_id,status,re_admission_reason,previous_period_id,created_by)
 values(p_student_id,p_admission_date,coalesce(p_class_id,v_student.class_id),'Active',btrim(p_reason),v_previous_period_id,v_uid) returning id into v_new_period_id;
 update public.students set status='Active',admission_date=p_admission_date,class_id=coalesce(p_class_id,class_id) where id=p_student_id;
 return v_new_period_id;
end;$$;
revoke all on function public.admin_find_learner_matches(text,text,text,date,integer,text,text) from public,anon;
grant execute on function public.admin_find_learner_matches(text,text,text,date,integer,text,text) to authenticated;
revoke all on function public.admin_readmit_learner(uuid,uuid,date,text) from public,anon;
grant execute on function public.admin_readmit_learner(uuid,uuid,date,text) to authenticated;
