create or replace function public.create_bursary_admission_charge()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_period public.learner_enrolment_periods%rowtype;
  v_award_id uuid;
  v_charge_id uuid;
  v_amount bigint := coalesce(new.bursary_fee_ugx,0);
  v_label text;
  v_total_days integer;
  v_days integer;
  v_start date;
  v_end date;
begin
  if not new.is_bursary then return new; end if;
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'An authenticated school administrator is required to approve a bursary' using errcode='42501';
  end if;
  if new.bursary_category not in ('Full bursary','Half bursary','Partial bursary','Fully sponsored')
     or nullif(btrim(new.bursary_reason),'') is null then
    raise exception 'A valid bursary category and reason are compulsory';
  end if;
  if new.bursary_category in ('Full bursary','Fully sponsored') and v_amount<>0 then
    raise exception 'Full bursary and fully sponsored learners must have UGX 0 payable';
  end if;
  if new.bursary_category in ('Half bursary','Partial bursary') and v_amount<=0 then
    raise exception 'Enter the approved amount payable for a half or partial bursary';
  end if;

  select * into v_period
  from public.learner_enrolment_periods
  where student_id=new.id and status='Active'
  order by created_at desc limit 1;
  if not found then raise exception 'The initial enrolment period could not be found for this bursary admission'; end if;

  select nullif(concat_ws(' · ',nullif(y.name,''),nullif(t.name,'')),'')
  into v_label
  from public.learner_enrolment_periods p
  left join public.academic_years y on y.id=p.academic_year_id
  left join public.academic_terms t on t.id=p.term_id
  where p.id=v_period.id;
  v_label:=coalesce(v_label,'Admission '||coalesce(new.admission_date,(timezone('Africa/Kampala',now()))::date)::text);

  insert into public.learner_bursary_awards(
    student_id,bursary_category,amount_payable_ugx,reason,billing_period_label,
    effective_from,approved_by,original_fee_amount_ugx,adjusted_fee_amount_ugx
  ) values (
    new.id,new.bursary_category,v_amount,btrim(new.bursary_reason),v_label,
    (timezone('Africa/Kampala',now()))::date,auth.uid(),v_amount,v_amount
  ) returning id into v_award_id;

  if v_amount>0 then
    if coalesce(new.admission_prorate,false)
       and new.admission_prorate_term_id is not null
       and v_period.term_id=new.admission_prorate_term_id then
      select starts_on,ends_on into v_start,v_end
      from public.academic_terms
      where id=v_period.term_id and is_current=true and not is_closed;
      if v_start is null or v_end is null then
        raise exception 'The active term dates are required for mid-term bursary proration';
      end if;
      v_total_days:=v_end-v_start+1;
      v_days:=v_end-greatest(coalesce(new.admission_date,v_start),v_start)+1;
      if v_total_days<=0 or v_days<=0 then raise exception 'Invalid term or remaining calendar days for bursary proration'; end if;
      v_amount:=round(v_amount::numeric*v_days/v_total_days)::bigint;
      insert into public.learner_charges(
        invoice_no,student_id,academic_year_id,term_id,description,amount_ugx,created_by,
        enrolment_period_id,is_prorated,proration_total_days,proration_days,daily_rate_ugx
      ) values (
        'BUR-'||upper(replace(gen_random_uuid()::text,'-','')),new.id,v_period.academic_year_id,
        v_period.term_id,'Prorated bursary fee — '||new.bursary_category||' — '||btrim(new.bursary_reason),
        v_amount,auth.uid(),v_period.id,true,v_total_days,v_days,
        coalesce(new.bursary_fee_ugx,0)::numeric/v_total_days
      ) returning id into v_charge_id;
    else
      insert into public.learner_charges(
        invoice_no,student_id,academic_year_id,term_id,description,amount_ugx,created_by,enrolment_period_id
      ) values (
        'BUR-'||upper(replace(gen_random_uuid()::text,'-','')),new.id,v_period.academic_year_id,
        v_period.term_id,'Approved bursary fee — '||new.bursary_category||' — '||btrim(new.bursary_reason),
        v_amount,auth.uid(),v_period.id
      ) returning id into v_charge_id;
    end if;
  end if;

  update public.learner_bursary_awards
  set adjusted_charge_id=v_charge_id,adjusted_fee_amount_ugx=v_amount
  where id=v_award_id;
  return new;
end;
$function$;
