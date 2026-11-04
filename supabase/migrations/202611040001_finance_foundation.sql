-- Cornhill School finance foundation (UGX whole-shilling ledger).
-- Safe for an already-provisioned project: tables/indexes are IF NOT EXISTS,
-- policies are replaced by name, and functions/views are replaced in place.
create table if not exists public.fee_items(
 id uuid primary key default gen_random_uuid(),name text not null unique,
 category text not null check(category in('Tuition','Boarding','Meals','Examination','Other')),
 is_active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.fee_schedules(
 id uuid primary key default gen_random_uuid(),fee_item_id uuid not null references public.fee_items(id),
 class_id uuid references public.school_classes(id),class_group text,
 learner_type text not null check(learner_type in('Day','Boarding','Any')),
 academic_year_id uuid references public.academic_years(id),term_id uuid references public.academic_terms(id),
 amount_ugx bigint not null check(amount_ugx>0),is_active boolean not null default true,
 created_at timestamptz not null default now());
create index if not exists fee_schedules_lookup_idx on public.fee_schedules(fee_item_id,class_id,learner_type,academic_year_id,term_id) where is_active;
create index if not exists fee_schedules_class_fk_idx on public.fee_schedules(class_id);
create index if not exists fee_schedules_year_fk_idx on public.fee_schedules(academic_year_id);
create index if not exists fee_schedules_term_fk_idx on public.fee_schedules(term_id);
create table if not exists public.learner_charges(
 id uuid primary key default gen_random_uuid(),invoice_no text not null unique,
 student_id uuid not null references public.students(id),fee_item_id uuid references public.fee_items(id),
 academic_year_id uuid references public.academic_years(id),term_id uuid references public.academic_terms(id),
 description text not null,amount_ugx bigint not null check(amount_ugx>0),due_date date,
 created_by uuid not null references public.user_profiles(id),created_at timestamptz not null default now());
create index if not exists learner_charges_student_date_idx on public.learner_charges(student_id,created_at desc);
create index if not exists learner_charges_item_fk_idx on public.learner_charges(fee_item_id);
create index if not exists learner_charges_year_fk_idx on public.learner_charges(academic_year_id);
create index if not exists learner_charges_term_fk_idx on public.learner_charges(term_id);
create index if not exists learner_charges_creator_fk_idx on public.learner_charges(created_by);
create sequence if not exists public.school_invoice_seq;
create sequence if not exists public.school_receipt_seq;
create or replace function public.assign_school_invoice_no() returns trigger language plpgsql set search_path=public as $$
begin
 if new.invoice_no is null or btrim(new.invoice_no)='' then
  new.invoice_no:='INV-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||lpad(nextval('public.school_invoice_seq')::text,6,'0');
 end if; return new;
end; $$;
drop trigger if exists learner_charges_invoice_no on public.learner_charges;
create trigger learner_charges_invoice_no before insert on public.learner_charges for each row execute function public.assign_school_invoice_no();
create table if not exists public.school_payments(
 id uuid primary key default gen_random_uuid(),receipt_no text not null unique,
 student_id uuid not null references public.students(id),amount_ugx bigint not null check(amount_ugx>0),
 unallocated_amount_ugx bigint not null default 0 check(unallocated_amount_ugx>=0 and unallocated_amount_ugx<=amount_ugx),
 payment_method text not null check(payment_method in('Cash','Mobile Money','Bank Transfer','Card','Other')),
 payment_reference text,notes text,status text not null default 'Posted' check(status in('Posted','Reversed')),
 received_by uuid not null references public.user_profiles(id),received_at timestamptz not null default now(),
 created_at timestamptz not null default now());
create index if not exists school_payments_student_date_idx on public.school_payments(student_id,received_at desc);
create index if not exists school_payments_receiver_fk_idx on public.school_payments(received_by);
create table if not exists public.payment_allocations(
 id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.school_payments(id),
 charge_id uuid not null references public.learner_charges(id),amount_ugx bigint not null check(amount_ugx>0),
 created_at timestamptz not null default now(),unique(payment_id,charge_id));
create index if not exists payment_allocations_charge_idx on public.payment_allocations(charge_id);
create index if not exists payment_allocations_payment_fk_idx on public.payment_allocations(payment_id);
alter table public.fee_items enable row level security;
alter table public.fee_schedules enable row level security;
alter table public.learner_charges enable row level security;
alter table public.school_payments enable row level security;
alter table public.payment_allocations enable row level security;
drop policy if exists "Admins manage fee items" on public.fee_items;
create policy "Admins manage fee items" on public.fee_items for all to authenticated using(public.is_school_admin()) with check(public.is_school_admin());
drop policy if exists "Admins manage fee schedules" on public.fee_schedules;
create policy "Admins manage fee schedules" on public.fee_schedules for all to authenticated using(public.is_school_admin()) with check(public.is_school_admin());
drop policy if exists "Admins read learner charges" on public.learner_charges;
create policy "Admins read learner charges" on public.learner_charges for select to authenticated using(public.is_school_admin());
drop policy if exists "Admins create learner charges" on public.learner_charges;
create policy "Admins create learner charges" on public.learner_charges for insert to authenticated with check(public.is_school_admin() and created_by=(select auth.uid()));
drop policy if exists "Admins read school payments" on public.school_payments;
create policy "Admins read school payments" on public.school_payments for select to authenticated using(public.is_school_admin());
drop policy if exists "Admins create school payments" on public.school_payments;
create policy "Admins create school payments" on public.school_payments for insert to authenticated with check(public.is_school_admin() and received_by=(select auth.uid()));
drop policy if exists "Admins update school payments" on public.school_payments;
create policy "Admins update school payments" on public.school_payments for update to authenticated using(public.is_school_admin()) with check(public.is_school_admin());
drop policy if exists "Admins read payment allocations" on public.payment_allocations;
create policy "Admins read payment allocations" on public.payment_allocations for select to authenticated using(public.is_school_admin());
drop policy if exists "Admins create payment allocations" on public.payment_allocations;
create policy "Admins create payment allocations" on public.payment_allocations for insert to authenticated with check(public.is_school_admin());
grant select,insert,update,delete on public.fee_items,public.fee_schedules to authenticated;
grant select,insert on public.learner_charges to authenticated;
grant select,insert,update on public.school_payments to authenticated;
grant select,insert on public.payment_allocations to authenticated;
grant usage,select on sequence public.school_invoice_seq,public.school_receipt_seq to authenticated;
create or replace function public.post_school_payment(
 p_student_id uuid,p_amount_ugx bigint,p_payment_method text,
 p_payment_reference text default null,p_notes text default null)
returns table(payment_id uuid,receipt_no text,unallocated_amount_ugx bigint)
language plpgsql security invoker set search_path=public,auth as $$
declare v_uid uuid:=auth.uid(); v_payment_id uuid:=gen_random_uuid(); v_receipt text;
 v_remaining bigint:=p_amount_ugx; v_charge record; v_due bigint; v_paid bigint;
begin
 if v_uid is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may post payments' using errcode='42501'; end if;
 if p_student_id is null or p_amount_ugx is null or p_amount_ugx<=0 then raise exception 'Select a learner and enter a payment amount greater than zero'; end if;
 if p_payment_method not in('Cash','Mobile Money','Bank Transfer','Card','Other') then raise exception 'Invalid payment method'; end if;
 if not exists(select 1 from public.students where id=p_student_id) then raise exception 'Learner was not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text,0));
 v_receipt:='CHR-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||lpad(nextval('public.school_receipt_seq')::text,6,'0');
 insert into public.school_payments(id,receipt_no,student_id,amount_ugx,unallocated_amount_ugx,payment_method,payment_reference,notes,received_by)
 values(v_payment_id,v_receipt,p_student_id,p_amount_ugx,p_amount_ugx,p_payment_method,nullif(trim(p_payment_reference),''),nullif(trim(p_notes),''),v_uid);
 for v_charge in select c.id,c.amount_ugx from public.learner_charges c where c.student_id=p_student_id order by c.created_at,c.id loop
  exit when v_remaining<=0;
  select coalesce(sum(a.amount_ugx),0) into v_paid from public.payment_allocations a join public.school_payments p on p.id=a.payment_id where a.charge_id=v_charge.id and p.status='Posted';
  v_due:=v_charge.amount_ugx-v_paid;
  if v_due>0 then
   insert into public.payment_allocations(payment_id,charge_id,amount_ugx) values(v_payment_id,v_charge.id,least(v_due,v_remaining));
   v_remaining:=v_remaining-least(v_due,v_remaining);
  end if;
 end loop;
 update public.school_payments set unallocated_amount_ugx=v_remaining where id=v_payment_id;
 return query select v_payment_id,v_receipt,v_remaining;
end; $$;
revoke all on function public.post_school_payment(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.post_school_payment(uuid,bigint,text,text,text) to authenticated;
create or replace view public.learner_account_balances with(security_invoker=true) as
select s.id student_id,s.admission_number,concat_ws(' ',s.first_name,s.middle_name,s.last_name) learner_name,
 coalesce(ch.total_charged,0)::bigint total_charged_ugx,coalesce(pa.total_allocated,0)::bigint total_paid_ugx,
 coalesce(cr.total_credit,0)::bigint credit_ugx,
 (coalesce(ch.total_charged,0)-coalesce(pa.total_allocated,0)-coalesce(cr.total_credit,0))::bigint balance_ugx
from public.students s
left join(select student_id,sum(amount_ugx) total_charged from public.learner_charges group by student_id) ch on ch.student_id=s.id
left join(select p.student_id,sum(a.amount_ugx) total_allocated from public.payment_allocations a join public.school_payments p on p.id=a.payment_id where p.status='Posted' group by p.student_id) pa on pa.student_id=s.id
left join(select student_id,sum(unallocated_amount_ugx) total_credit from public.school_payments where status='Posted' group by student_id) cr on cr.student_id=s.id;
grant select on public.learner_account_balances to authenticated;
insert into public.fee_items(name,category) values
 ('Tuition','Tuition'),('Boarding','Boarding'),('Breakfast','Meals'),('Lunch','Meals'),
 ('P7 Mock','Examination'),('PLE Facilitation','Examination'),('Pre-PLE','Examination'),
 ('West Ankole Diocese','Other'),('Top Graduation','Other'),('Uniform','Other'),('Sweater','Other'),('Sportswear','Other')
on conflict(name) do nothing;
