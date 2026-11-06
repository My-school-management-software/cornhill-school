-- Ensure a returning learner receives charges in the new active enrolment period.
-- Duplicate detection is period-scoped; the charge is explicitly attached to that period.
CREATE OR REPLACE FUNCTION public.admin_apply_learner_fee_schedule(p_student_id uuid, p_period_label text)
 RETURNS TABLE(created_charges integer, already_charged integer, total_amount_ugx bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_student public.students%rowtype; v_period public.learner_enrolment_periods%rowtype;
 v_schedule record; v_created integer:=0; v_skipped integer:=0; v_total bigint:=0;
 v_description text; v_has_existing_award boolean:=false; v_total_days integer;
 v_days integer; v_start date; v_end date; v_amount bigint; v_daily numeric(14,4);
 v_prorate boolean:=false;
begin
 if auth.uid() is null or not public.is_school_admin() then
  raise exception 'Only the school administrator may apply fee schedules' using errcode='42501';
 end if;
 if p_student_id is null or nullif(btrim(p_period_label),'') is null then
  raise exception 'Choose a learner and enter the billing period';
 end if;
 select * into v_student from public.students where id=p_student_id and status='Active' for update;
 if not found then raise exception 'Active learner not found'; end if;
 if v_student.class_id is null then raise exception 'Assign the learner to a class before applying the fee schedule'; end if;
 select * into v_period from public.learner_enrolment_periods
 where student_id=p_student_id and status='Active' order by admission_date desc limit 1;
 if not found then raise exception 'The learner has no active enrolment period'; end if;
 v_prorate:=coalesce(v_student.admission_prorate,false)
   and v_student.admission_prorate_term_id is not null
   and v_period.term_id=v_student.admission_prorate_term_id;
 if v_prorate then
  select starts_on,ends_on into v_start,v_end from public.academic_terms
  where id=v_period.term_id and not is_closed;
  if v_start is null or v_end is null then raise exception 'Term dates are missing; cannot calculate prorated charges'; end if;
  v_total_days:=v_end-v_start+1;
  v_days:=v_end-greatest(v_period.admission_date,v_start)+1;
  if v_total_days<=0 or v_days<=0 then raise exception 'Invalid term or remaining calendar days for proration'; end if;
 end if;
 select exists(
  select 1 from public.learner_bursary_awards a
  where a.student_id=p_student_id
    and lower(btrim(a.billing_period_label))=lower(btrim(p_period_label))
    and a.effective_from<=current_date
    and (a.effective_until is null or a.effective_until>=current_date)
 ) into v_has_existing_award;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||lower(btrim(p_period_label)),0));
 for v_schedule in
  select fs.fee_item_id,fs.amount_ugx,fi.name
  from public.fee_schedules fs
  join public.fee_items fi on fi.id=fs.fee_item_id
  join public.school_classes sc on sc.id=v_student.class_id
  where fs.is_active and fs.class_group=sc.name
   and (fs.learner_type='Any' or fs.learner_type=v_student.learner_type)
   and (fs.academic_year_id is null or fs.academic_year_id=v_period.academic_year_id)
   and (fs.term_id is null or fs.term_id=v_period.term_id)
   and (
     (fi.name='School fees' and not v_student.is_bursary and not v_has_existing_award)
     or (fi.name='Boarding' and v_student.learner_type='Boarding')
     or (fi.name='Breakfast' and v_student.learner_type<>'Boarding' and v_student.takes_breakfast)
     or (fi.name='Lunch' and v_student.learner_type<>'Boarding' and v_student.takes_lunch)
   )
  order by case fi.name when 'School fees' then 1 when 'Boarding' then 2 when 'Breakfast' then 3 when 'Lunch' then 4 else 5 end
 loop
  v_description:=btrim(p_period_label)||' - '||v_schedule.name;
  if exists(select 1 from public.learner_charges c
    where c.student_id=p_student_id and c.enrolment_period_id=v_period.id
      and c.fee_item_id=v_schedule.fee_item_id
      and c.description in (v_description,'Prorated '||v_description)) then
   v_skipped:=v_skipped+1;
  else
   v_amount:=v_schedule.amount_ugx; v_daily:=null;
   if v_prorate then
    v_daily:=v_schedule.amount_ugx::numeric/v_total_days;
    v_amount:=round(v_schedule.amount_ugx::numeric*v_days/v_total_days)::bigint;
   end if;
   insert into public.learner_charges(
    invoice_no,student_id,fee_item_id,description,amount_ugx,created_by,enrolment_period_id,
    is_prorated,proration_total_days,proration_days,daily_rate_ugx
   ) values(
    'SCH-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,
    v_schedule.fee_item_id,
    case when v_prorate then 'Prorated '||v_description else v_description end,
    v_amount,auth.uid(),v_period.id,v_prorate,
    case when v_prorate then v_total_days end,
    case when v_prorate then v_days end,v_daily
   );
   v_created:=v_created+1; v_total:=v_total+v_amount;
  end if;
 end loop;
 return query select v_created,v_skipped,v_total;
end;
$function$

