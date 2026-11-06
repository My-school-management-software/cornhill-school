create or replace function public.post_school_payment_complete(
 p_student_id uuid,
 p_amount_ugx bigint,
 p_payment_method text,
 p_payment_reference text default null,
 p_notes text default null,
 p_allocations jsonb default null,
 p_collection_item text default 'School fees',
 p_payer_name text default null
)
returns table(payment_id uuid, receipt_no text, unallocated_amount_ugx bigint)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
 v_uid uuid:=auth.uid();
 v_payment_id uuid:=gen_random_uuid();
 v_receipt text;
 v_remaining bigint:=p_amount_ugx;
 v_item jsonb;
 v_charge_id uuid;
 v_amount bigint;
 v_due bigint;
 v_paid bigint;
 v_sum bigint:=0;
 v_seen_charge_ids uuid[]:='{}'::uuid[];
 v_enrolment_period_id uuid;
 v_current_term_id uuid;
begin
 if v_uid is null or not coalesce(public.is_school_admin(),false) then
  raise exception 'Only an authenticated school administrator may post payments' using errcode='42501';
 end if;
 if p_student_id is null or p_amount_ugx is null or p_amount_ugx<=0 then
  raise exception 'Select a learner and enter a payment amount greater than zero';
 end if;
 if p_payment_method not in('Cash','Mobile Money','Bank Transfer','Card','Other') then
  raise exception 'Invalid payment method';
 end if;
 if nullif(btrim(p_collection_item),'') is null then
  raise exception 'Enter the payment reason before posting the payment';
 end if;
 if p_allocations is not null and jsonb_typeof(p_allocations)<>'array' then
  raise exception 'Payment allocations must be a list';
 end if;

 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text,0));
 select ep.id into v_enrolment_period_id
 from public.learner_enrolment_periods ep
 where ep.student_id=p_student_id and ep.status='Active'
 order by ep.admission_date desc,ep.created_at desc
 limit 1 for update;
 if v_enrolment_period_id is null then
  raise exception 'This learner has no active enrolment. Re-admit the learner before posting a new payment';
 end if;

 select t.id into v_current_term_id
 from public.academic_terms t
 where t.is_current=true and t.is_closed=false
 order by t.starts_on desc
 limit 1;

 if p_allocations is not null then
  for v_item in select value from jsonb_array_elements(p_allocations) loop
   if coalesce(v_item->>'charge_id','')='' or coalesce(v_item->>'amount_ugx','')='' then
    raise exception 'Each allocation needs a fee charge and amount';
   end if;
   v_charge_id:=(v_item->>'charge_id')::uuid;
   v_amount:=(v_item->>'amount_ugx')::bigint;
   if v_amount is null or v_amount<=0 then raise exception 'Each allocation must be greater than zero'; end if;
   if v_charge_id=any(v_seen_charge_ids) then raise exception 'A fee charge can only appear once in a payment allocation'; end if;
   v_seen_charge_ids:=array_append(v_seen_charge_ids,v_charge_id);
   select c.amount_ugx into v_due
   from public.learner_charges c
   where c.id=v_charge_id and c.student_id=p_student_id and c.enrolment_period_id=v_enrolment_period_id
   for update;
   if not found then raise exception 'A selected fee charge does not belong to this active enrolment'; end if;
   select coalesce(sum(a.amount_ugx),0) into v_paid
   from public.payment_allocations a join public.school_payments p on p.id=a.payment_id
   where a.charge_id=v_charge_id and p.status='Posted';
   if v_amount>v_due-v_paid then raise exception 'An allocation exceeds the remaining balance on a selected fee charge'; end if;
   v_sum:=v_sum+v_amount;
  end loop;
  if v_sum>p_amount_ugx then raise exception 'Allocated amounts cannot exceed the payment received'; end if;
 end if;

 v_receipt:='CHR-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||lpad(nextval('public.school_receipt_seq')::text,6,'0');
 insert into public.school_payments(id,receipt_no,student_id,enrolment_period_id,amount_ugx,unallocated_amount_ugx,payment_method,payment_reference,notes,received_by,collection_item,payer_name)
 values(v_payment_id,v_receipt,p_student_id,v_enrolment_period_id,p_amount_ugx,p_amount_ugx,p_payment_method,
        nullif(trim(p_payment_reference),''),nullif(trim(p_notes),''),v_uid,btrim(p_collection_item),nullif(btrim(p_payer_name),''));

 if p_allocations is not null then
  for v_item in select value from jsonb_array_elements(p_allocations) loop
   insert into public.payment_allocations(payment_id,charge_id,amount_ugx)
   values(v_payment_id,(v_item->>'charge_id')::uuid,(v_item->>'amount_ugx')::bigint);
  end loop;
  v_remaining:=p_amount_ugx-v_sum;
 end if;

 -- Automatic allocation is restricted to the current open term.
 -- Previous-term charges are paid only when the administrator selects them explicitly.
 for v_charge_id,v_due in
  select c.id,c.amount_ugx
  from public.learner_charges c
  left join public.fee_items fi on fi.id=c.fee_item_id
  where c.student_id=p_student_id
    and c.enrolment_period_id=v_enrolment_period_id
    and v_current_term_id is not null
    and c.term_id=v_current_term_id
  order by case when position(lower(btrim(p_collection_item)) in lower(coalesce(fi.name,'')||' '||c.description))>0 then 0 else 1 end,c.created_at,c.id
  for update of c
 loop
  exit when v_remaining<=0;
  select coalesce(sum(a.amount_ugx),0) into v_paid
  from public.payment_allocations a join public.school_payments p on p.id=a.payment_id
  where a.charge_id=v_charge_id and p.status='Posted';
  v_due:=v_due-v_paid;
  if v_due>0 then
   insert into public.payment_allocations(payment_id,charge_id,amount_ugx)
   values(v_payment_id,v_charge_id,least(v_due,v_remaining));
   v_remaining:=v_remaining-least(v_due,v_remaining);
  end if;
 end loop;

 update public.school_payments set unallocated_amount_ugx=v_remaining where id=v_payment_id;
 return query select v_payment_id,v_receipt,v_remaining;
end;
$function$;