alter table public.students
 add column if not exists admission_prorate boolean not null default false,
 add column if not exists admission_prorate_term_id uuid references public.academic_terms(id);

alter table public.learner_charges
 add column if not exists proration_total_days integer,
 add column if not exists proration_days integer,
 add column if not exists daily_rate_ugx numeric(14,4),
 add column if not exists is_prorated boolean not null default false;

create or replace function public.set_learner_admission_proration_term()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.admission_prorate then
  select t.id into new.admission_prorate_term_id
  from public.academic_terms t
  where t.is_current=true and not t.is_closed
    and coalesce(new.admission_date,(timezone('Africa/Kampala',now()))::date) between t.starts_on and t.ends_on
  order by t.starts_on desc limit 1;
  if new.admission_prorate_term_id is null then
   raise exception 'Mid-term proration requires an active term and an admission date within that term';
  end if;
 else
  new.admission_prorate_term_id:=null;
 end if;
 return new;
end;$$;

drop trigger if exists aaa_set_learner_admission_proration_term on public.students;
create trigger aaa_set_learner_admission_proration_term
before insert or update of admission_prorate,admission_date on public.students
for each row execute function public.set_learner_admission_proration_term();

create or replace function public.create_bursary_admission_charge()
returns trigger language plpgsql set search_path='public','auth' as $$
declare v_amount bigint:=coalesce(new.bursary_fee_ugx,0);v_total_days integer;v_days integer;v_start date;v_end date;
begin
 if new.is_bursary then
  if new.bursary_category is null or nullif(btrim(new.bursary_reason),'') is null then
   raise exception 'A bursary category and reason are compulsory';
  end if;
  if v_amount>0 then
   if new.admission_prorate then
    select starts_on,ends_on into v_start,v_end from public.academic_terms where id=new.admission_prorate_term_id and is_current=true and not is_closed;
    if v_start is null or v_end is null then raise exception 'The active term dates are required for mid-term bursary proration';end if;
    v_total_days:=v_end-v_start+1;
    v_days:=v_end-greatest(coalesce(new.admission_date,v_start),v_start)+1;
    if v_total_days<=0 or v_days<=0 then raise exception 'Invalid term or remaining calendar days for proration';end if;
    v_amount:=round(v_amount::numeric*v_days/v_total_days)::bigint;
    insert into public.learner_charges(student_id,description,amount_ugx,created_by,is_prorated,proration_total_days,proration_days,daily_rate_ugx)
    values(new.id,'Prorated bursary fee — '||new.bursary_category||' — '||btrim(new.bursary_reason),v_amount,auth.uid(),true,v_total_days,v_days,coalesce(new.bursary_fee_ugx,0)::numeric/v_total_days);
   else
    insert into public.learner_charges(student_id,description,amount_ugx,created_by)
    values(new.id,'Approved bursary fee — '||new.bursary_category||' — '||btrim(new.bursary_reason),v_amount,auth.uid());
   end if;
  end if;
 end if;
 return new;
end;$$;

create or replace function public.admin_apply_learner_fee_schedule(p_student_id uuid,p_period_label text)
returns table(created_charges integer,already_charged integer,total_amount_ugx bigint)
language plpgsql security definer set search_path='' as $$
declare
 v_student public.students%rowtype;v_period public.learner_enrolment_periods%rowtype;
 v_schedule record;v_created integer:=0;v_skipped integer:=0;v_total bigint:=0;
 v_description text;v_has_existing_award boolean:=false;v_total_days integer;v_days integer;
 v_start date;v_end date;v_amount bigint;v_daily numeric(14,4);v_prorate boolean:=false;
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Only the school administrator may apply fee schedules' using errcode='42501';end if;
 if p_student_id is null or nullif(btrim(p_period_label),'') is null then raise exception 'Choose a learner and enter the billing period';end if;
 select * into v_student from public.students where id=p_student_id and status='Active' for update;
 if not found then raise exception 'Active learner not found';end if;
 if v_student.class_id is null then raise exception 'Assign the learner to a class before applying the fee schedule';end if;
 select * into v_period from public.learner_enrolment_periods where student_id=p_student_id and status='Active' order by admission_date desc limit 1;
 v_prorate:=coalesce(v_student.admission_prorate,false) and v_student.admission_prorate_term_id is not null and v_period.term_id=v_student.admission_prorate_term_id;
 if v_prorate then
  select starts_on,ends_on into v_start,v_end from public.academic_terms where id=v_period.term_id and not is_closed;
  if v_start is null or v_end is null then raise exception 'Term dates are missing; cannot calculate prorated charges';end if;
  v_total_days:=v_end-v_start+1;v_days:=v_end-greatest(v_period.admission_date,v_start)+1;
  if v_total_days<=0 or v_days<=0 then raise exception 'Invalid term or remaining calendar days for proration';end if;
 end if;
 select exists(select 1 from public.learner_bursary_awards a where a.student_id=p_student_id and lower(btrim(a.billing_period_label))=lower(btrim(p_period_label)) and a.effective_from<=current_date and (a.effective_until is null or a.effective_until>=current_date)) into v_has_existing_award;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||lower(btrim(p_period_label)),0));
 for v_schedule in
  select fs.fee_item_id,fs.amount_ugx,fi.name
  from public.fee_schedules fs join public.fee_items fi on fi.id=fs.fee_item_id
  join public.school_classes sc on sc.id=v_student.class_id
  where fs.is_active and fs.class_group=sc.name and (fs.learner_type='Any' or fs.learner_type=v_student.learner_type)
   and ((fi.name='School fees' and not v_student.is_bursary and not v_has_existing_award)
     or (fi.name='Boarding' and v_student.learner_type='Boarding')
     or (fi.name='Breakfast' and v_student.takes_breakfast)
     or (fi.name='Lunch' and v_student.takes_lunch))
  order by case fi.name when 'School fees' then 1 when 'Boarding' then 2 when 'Breakfast' then 3 when 'Lunch' then 4 else 5 end
 loop
  v_description:=btrim(p_period_label)||' - '||v_schedule.name;
  if exists(select 1 from public.learner_charges c where c.student_id=p_student_id and c.fee_item_id=v_schedule.fee_item_id and c.description=v_description) then
   v_skipped:=v_skipped+1;
  else
   v_amount:=v_schedule.amount_ugx;v_daily:=null;
   if v_prorate then v_daily:=v_schedule.amount_ugx::numeric/v_total_days;v_amount:=round(v_schedule.amount_ugx::numeric*v_days/v_total_days)::bigint;end if;
   insert into public.learner_charges(invoice_no,student_id,fee_item_id,description,amount_ugx,created_by,is_prorated,proration_total_days,proration_days,daily_rate_ugx)
   values('SCH-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,v_schedule.fee_item_id,
    case when v_prorate then 'Prorated '||v_description else v_description end,v_amount,auth.uid(),v_prorate,
    case when v_prorate then v_total_days end,case when v_prorate then v_days end,v_daily);
   v_created:=v_created+1;v_total:=v_total+v_amount;
  end if;
 end loop;
 return query select v_created,v_skipped,v_total;
end;$$;

create or replace function public.admin_dashboard_income_forecast()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Only school administrators may view the school income forecast' using errcode='42501';end if;
 with active_term as (
  select id,starts_on,ends_on from public.academic_terms where is_current=true and not is_closed order by starts_on desc limit 1
 ), learner_costs as (
  select s.id,s.gender,s.learner_type,s.takes_breakfast,s.takes_lunch,s.is_bursary,s.bursary_fee_ugx,
   s.admission_prorate,s.admission_prorate_term_id,s.admission_date,sc.name class_name,
   coalesce(at.starts_on,active_term.starts_on) term_start,coalesce(at.ends_on,active_term.ends_on) term_end,active_term.id active_term_id
  from public.students s join public.school_classes sc on sc.id=s.class_id cross join active_term
  left join public.academic_terms at on at.id=s.admission_prorate_term_id
  where s.status='Active'
 ), scheduled as (
  select l.*,
   coalesce(max(fs.amount_ugx) filter(where fi.name='School fees' and fs.learner_type in ('Any',l.learner_type)),0) as scheduled_school_fee,
   coalesce(max(fs.amount_ugx) filter(where fi.name='Boarding' and fs.learner_type in ('Any',l.learner_type)),0) as scheduled_boarding_fee,
   coalesce(max(fs.amount_ugx) filter(where fi.name='Breakfast' and fs.learner_type in ('Any',l.learner_type)),0) as scheduled_breakfast_fee,
   coalesce(max(fs.amount_ugx) filter(where fi.name='Lunch' and fs.learner_type in ('Any',l.learner_type)),0) as scheduled_lunch_fee
  from learner_costs l left join public.fee_schedules fs on fs.is_active and fs.class_group=l.class_name and (fs.learner_type='Any' or fs.learner_type=l.learner_type)
  left join public.fee_items fi on fi.id=fs.fee_item_id
  group by l.id,l.gender,l.learner_type,l.takes_breakfast,l.takes_lunch,l.is_bursary,l.bursary_fee_ugx,l.admission_prorate,l.admission_prorate_term_id,l.admission_date,l.class_name,l.term_start,l.term_end,l.active_term_id
 ), calculated as (
  select *,case when admission_prorate and admission_prorate_term_id=active_term_id and term_start is not null and term_end is not null and term_end>=term_start
   then greatest(0,term_end-greatest(coalesce(admission_date,term_start),term_start)+1)::numeric/(term_end-term_start+1) else 1::numeric end as charge_ratio
  from scheduled
 )
 select jsonb_build_object(
  'term_name',(select name from public.academic_terms where is_current=true and not is_closed order by starts_on desc limit 1),
  'active_learners',count(*),'female_learners',count(*) filter(where lower(coalesce(gender,''))='female'),
  'male_learners',count(*) filter(where lower(coalesce(gender,''))='male'),'boarders',count(*) filter(where learner_type='Boarding'),
  'day_learners',count(*) filter(where coalesce(learner_type,'Day')<>'Boarding'),
  'breakfast_learners',count(*) filter(where takes_breakfast),'lunch_learners',count(*) filter(where takes_lunch),
  'bursary_learners',count(*) filter(where is_bursary),
  'school_fees_income',coalesce(sum(round((case when is_bursary then coalesce(bursary_fee_ugx,0) else scheduled_school_fee end)*charge_ratio)::bigint),0),
  'boarding_income',coalesce(sum(case when learner_type='Boarding' then round(scheduled_boarding_fee*charge_ratio)::bigint else 0 end),0),
  'breakfast_income',coalesce(sum(case when takes_breakfast then round(scheduled_breakfast_fee*charge_ratio)::bigint else 0 end),0),
  'lunch_income',coalesce(sum(case when takes_lunch then round(scheduled_lunch_fee*charge_ratio)::bigint else 0 end),0),
  'estimated_total_income',coalesce(sum(round((case when is_bursary then coalesce(bursary_fee_ugx,0) else scheduled_school_fee end)*charge_ratio)::bigint
    +case when learner_type='Boarding' then round(scheduled_boarding_fee*charge_ratio)::bigint else 0 end
    +case when takes_breakfast then round(scheduled_breakfast_fee*charge_ratio)::bigint else 0 end
    +case when takes_lunch then round(scheduled_lunch_fee*charge_ratio)::bigint else 0 end),0)
 ) into v_result from calculated;
 return coalesce(v_result,'{}'::jsonb);
end;$$;

revoke all on function public.admin_dashboard_income_forecast() from public,anon;
grant execute on function public.admin_dashboard_income_forecast() to authenticated;
