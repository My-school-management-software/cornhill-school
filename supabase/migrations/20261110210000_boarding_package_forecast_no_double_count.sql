-- A boarding package is the complete term amount for a boarder.
-- Do not report or forecast school fees as a second charge for those learners.

CREATE OR REPLACE FUNCTION public.admin_dashboard_income_forecast()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not public.is_school_admin() then
  raise exception 'Only school administrators may view the school income forecast' using errcode='42501';
 end if;
 with active_term as (
  select t.id,t.academic_year_id,t.starts_on,t.ends_on,t.name
  from public.academic_terms t
  where t.is_current=true and not t.is_closed
  order by t.starts_on desc limit 1
 ), learner_costs as (
  select s.id,s.gender,s.learner_type,
   case when s.learner_type='Boarding' then false else coalesce(s.takes_breakfast,false) end takes_breakfast,
   case when s.learner_type='Boarding' then false else coalesce(s.takes_lunch,false) end takes_lunch,
   s.is_bursary,s.bursary_fee_ugx,s.admission_prorate,
   s.admission_prorate_term_id,s.admission_date,sc.name class_name,
   at.starts_on term_start,at.ends_on term_end,active_term.id active_term_id
  from public.students s
  left join public.school_classes sc on sc.id=s.class_id
  left join public.academic_terms at on at.id=s.admission_prorate_term_id
  left join active_term on true
  where s.status='Active'
 ), scheduled as (
  select l.*,
   coalesce(max(fs.amount_ugx) filter(where fi.name='School fees' and fs.learner_type in ('Any',l.learner_type)),0) scheduled_school_fee,
   coalesce(max(fs.amount_ugx) filter(where fi.name='Boarding' and fs.learner_type in ('Any',l.learner_type)),0) scheduled_boarding_fee,
   coalesce(max(fs.amount_ugx) filter(where fi.name='Breakfast' and fs.learner_type in ('Any',l.learner_type)),0) scheduled_breakfast_fee,
   coalesce(max(fs.amount_ugx) filter(where fi.name='Lunch' and fs.learner_type in ('Any',l.learner_type)),0) scheduled_lunch_fee
  from learner_costs l
  left join public.fee_schedules fs on fs.is_active and fs.class_group=l.class_name
   and (fs.learner_type='Any' or fs.learner_type=l.learner_type)
   and (fs.academic_year_id is null or fs.academic_year_id=(select academic_year_id from active_term))
   and (fs.term_id is null or fs.term_id=(select id from active_term))
  left join public.fee_items fi on fi.id=fs.fee_item_id
  group by l.id,l.gender,l.learner_type,l.takes_breakfast,l.takes_lunch,
   l.is_bursary,l.bursary_fee_ugx,l.admission_prorate,l.admission_prorate_term_id,
   l.admission_date,l.class_name,l.term_start,l.term_end,l.active_term_id
 ), calculated as (
  select *,
   case when admission_prorate and admission_prorate_term_id=active_term_id
      and term_start is not null and term_end is not null and term_end>=term_start
    then greatest(0,term_end-greatest(coalesce(admission_date,term_start),term_start)+1)::numeric
       /(term_end-term_start+1)
    else 1::numeric end charge_ratio
  from scheduled
 )
 select jsonb_build_object(
  'term_name',(select name from active_term),
  'active_learners',count(*),
  'female_learners',count(*) filter(where lower(coalesce(gender,''))='female'),
  'male_learners',count(*) filter(where lower(coalesce(gender,''))='male'),
  'boarders',count(*) filter(where learner_type='Boarding'),
  'female_boarders',count(*) filter(where learner_type='Boarding' and lower(coalesce(gender,''))='female'),
  'male_boarders',count(*) filter(where learner_type='Boarding' and lower(coalesce(gender,''))='male'),
  'day_learners',count(*) filter(where coalesce(learner_type,'Day')<>'Boarding'),
  'breakfast_learners',count(*) filter(where learner_type<>'Boarding' and takes_breakfast),
  'lunch_learners',count(*) filter(where learner_type<>'Boarding' and takes_lunch),
  'bursary_learners',count(*) filter(where is_bursary),
  'school_fees_income',coalesce(sum(case when learner_type<>'Boarding' then round((case when is_bursary then coalesce(bursary_fee_ugx,0) else scheduled_school_fee end)*charge_ratio)::bigint else 0 end),0),
  'boarding_income',coalesce(sum(case when learner_type='Boarding' then round((case when is_bursary then coalesce(bursary_fee_ugx,0) else scheduled_boarding_fee end)*charge_ratio)::bigint else 0 end),0),
  'breakfast_income',coalesce(sum(case when learner_type<>'Boarding' and takes_breakfast then round(scheduled_breakfast_fee*charge_ratio)::bigint else 0 end),0),
  'lunch_income',coalesce(sum(case when learner_type<>'Boarding' and takes_lunch then round(scheduled_lunch_fee*charge_ratio)::bigint else 0 end),0),
  'estimated_total_income',coalesce(sum(
   case when learner_type='Boarding' then
    round((case when is_bursary then coalesce(bursary_fee_ugx,0) else scheduled_boarding_fee end)*charge_ratio)::bigint
   else
    round((case when is_bursary then coalesce(bursary_fee_ugx,0) else scheduled_school_fee end)*charge_ratio)::bigint
    +case when takes_breakfast then round(scheduled_breakfast_fee*charge_ratio)::bigint else 0 end
    +case when takes_lunch then round(scheduled_lunch_fee*charge_ratio)::bigint else 0 end
   end
  ),0)
 ) into v_result from calculated;
 return coalesce(v_result,'{}'::jsonb);
end;
$function$
