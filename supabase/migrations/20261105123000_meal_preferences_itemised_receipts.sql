alter table public.fee_items drop constraint if exists fee_items_category_check;
alter table public.fee_items add constraint fee_items_category_check
 check (category = any (array['School fees','Tuition','Boarding','Meals','Examination','Other']::text[]));

alter table public.students add column if not exists takes_breakfast boolean not null default false;
alter table public.students add column if not exists takes_lunch boolean not null default false;

update public.fee_items
set name='School fees',category='School fees'
where id='9c0cb880-e319-4624-91f0-e83ab36b8bf8';

create or replace function public.admin_list_active_finance_students_v2()
returns table(
 id uuid,admission_number text,first_name text,middle_name text,last_name text,
 is_bursary boolean,bursary_fee_ugx bigint,class_name text,learner_type text,
 takes_breakfast boolean,takes_lunch boolean
)
language plpgsql stable security definer set search_path=''
as $function$
begin
 if auth.uid() is null or not public.is_school_admin() then
  raise exception 'Only school administrators may access finance learner records' using errcode='42501';
 end if;
 return query
 select s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,
        s.is_bursary,s.bursary_fee_ugx,coalesce(c.name,''),s.learner_type,
        s.takes_breakfast,s.takes_lunch
 from public.students s
 left join public.school_classes c on c.id=s.class_id
 where s.status='Active'
 order by s.first_name,s.last_name
 limit 2000;
end;
$function$;
revoke all on function public.admin_list_active_finance_students_v2() from public;
grant execute on function public.admin_list_active_finance_students_v2() to authenticated;

create or replace function public.admin_apply_learner_fee_schedule(p_student_id uuid,p_period_label text)
returns table(created_charges integer,already_charged integer,total_amount_ugx bigint)
language plpgsql security definer set search_path=''
as $function$
declare
 v_student public.students%rowtype;
 v_schedule record;
 v_created integer:=0;
 v_skipped integer:=0;
 v_total bigint:=0;
 v_description text;
begin
 if auth.uid() is null or not public.is_school_admin() then
  raise exception 'Only the school administrator may apply fee schedules' using errcode='42501';
 end if;
 if p_student_id is null or nullif(btrim(p_period_label),'') is null then
  raise exception 'Choose a learner and enter the billing period';
 end if;
 select * into v_student from public.students where id=p_student_id and status='Active';
 if not found then raise exception 'Active learner not found'; end if;
 if v_student.class_id is null then raise exception 'Assign the learner to a class before applying the fee schedule'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||lower(btrim(p_period_label)),0));
 for v_schedule in
  select fs.fee_item_id,fs.amount_ugx,fi.name
  from public.fee_schedules fs
  join public.fee_items fi on fi.id=fs.fee_item_id
  join public.school_classes sc on sc.id=v_student.class_id
  where fs.is_active and fs.class_group=sc.name
   and (fs.learner_type='Any' or fs.learner_type=v_student.learner_type)
   and (fi.name='School fees'
    or (fi.name='Boarding' and v_student.learner_type='Boarding')
    or (fi.name='Breakfast' and v_student.takes_breakfast)
    or (fi.name='Lunch' and v_student.takes_lunch))
  order by case fi.name when 'School fees' then 1 when 'Boarding' then 2
   when 'Breakfast' then 3 when 'Lunch' then 4 else 5 end
 loop
  v_description:=btrim(p_period_label)||' - '||v_schedule.name;
  if exists(select 1 from public.learner_charges c where c.student_id=p_student_id
   and c.fee_item_id=v_schedule.fee_item_id and c.description=v_description) then
   v_skipped:=v_skipped+1;
  else
   insert into public.learner_charges(invoice_no,student_id,fee_item_id,description,amount_ugx,created_by)
   values('SCH-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,
    v_schedule.fee_item_id,v_description,v_schedule.amount_ugx,auth.uid());
   v_created:=v_created+1;v_total:=v_total+v_schedule.amount_ugx;
  end if;
 end loop;
 return query select v_created,v_skipped,v_total;
end;
$function$;
revoke all on function public.admin_apply_learner_fee_schedule(uuid,text) from public;
grant execute on function public.admin_apply_learner_fee_schedule(uuid,text) to authenticated;
