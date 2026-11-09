create or replace function public.admin_apply_learner_fee_schedule(p_student_id uuid, p_period_label text)
returns table(created_charges integer, already_charged integer, total_amount_ugx bigint)
language plpgsql security definer set search_path to ''
as $function$
declare v_student public.students%rowtype; v_schedule record; v_created integer:=0; v_skipped integer:=0; v_total bigint:=0; v_description text; v_has_existing_award boolean:=false;
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Only the school administrator may apply fee schedules' using errcode='42501'; end if;
 if p_student_id is null or nullif(btrim(p_period_label),'') is null then raise exception 'Choose a learner and enter the billing period'; end if;
 select * into v_student from public.students where id=p_student_id and status='Active';
 if not found then raise exception 'Active learner not found'; end if;
 if v_student.class_id is null then raise exception 'Assign the learner to a class before applying the fee schedule'; end if;
 select exists(select 1 from public.learner_bursary_awards a where a.student_id=p_student_id and lower(btrim(a.billing_period_label))=lower(btrim(p_period_label)) and a.effective_from<=current_date and (a.effective_until is null or a.effective_until>=current_date)) into v_has_existing_award;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||lower(btrim(p_period_label)),0));
 for v_schedule in select fs.fee_item_id,fs.amount_ugx,fi.name from public.fee_schedules fs join public.fee_items fi on fi.id=fs.fee_item_id join public.school_classes sc on sc.id=v_student.class_id
 where fs.is_active and fs.class_group=sc.name and (fs.learner_type='Any' or fs.learner_type=v_student.learner_type)
 and ((fi.name='School fees' and not v_student.is_bursary and not v_has_existing_award) or (fi.name='Boarding' and v_student.learner_type='Boarding') or (fi.name='Breakfast' and v_student.takes_breakfast) or (fi.name='Lunch' and v_student.takes_lunch))
 order by case fi.name when 'School fees' then 1 when 'Boarding' then 2 when 'Breakfast' then 3 when 'Lunch' then 4 else 5 end
 loop
  v_description:=btrim(p_period_label)||' - '||v_schedule.name;
  if exists(select 1 from public.learner_charges c where c.student_id=p_student_id and c.fee_item_id=v_schedule.fee_item_id and c.description=v_description) then v_skipped:=v_skipped+1;
  else
   insert into public.learner_charges(invoice_no,student_id,fee_item_id,description,amount_ugx,created_by) values('SCH-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,v_schedule.fee_item_id,v_description,v_schedule.amount_ugx,auth.uid());
   v_created:=v_created+1; v_total:=v_total+v_schedule.amount_ugx;
  end if;
 end loop;
 return query select v_created,v_skipped,v_total;
end; $function$;