create or replace function public.admin_readmit_learner(p_student_id uuid,p_class_id uuid,p_admission_date date,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_student public.students%rowtype;v_previous_period_id uuid;v_new_period_id uuid;v_year_id uuid;v_term_id uuid;
begin
 if v_uid is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only an authenticated school administrator may re-admit a learner' using errcode='42501';end if;
 if p_student_id is null or p_admission_date is null then raise exception 'Select a previous learner and enter a new admission date';end if;
 if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5 or length(btrim(p_reason))>500 then raise exception 'Enter a re-admission reason between 5 and 500 characters';end if;
 select * into v_student from public.students where id=p_student_id for update;
 if not found then raise exception 'Previous learner record was not found';end if;
 if v_student.status='Active' or exists(select 1 from public.learner_enrolment_periods where student_id=p_student_id and status='Active') then raise exception 'This learner is already actively enrolled. Use the existing learner record instead of re-admitting';end if;
 if p_class_id is not null and not exists(select 1 from public.school_classes where id=p_class_id) then raise exception 'The selected class does not exist';end if;
 select id into v_year_id from public.academic_years where is_current=true order by starts_on desc limit 1;
 select id,academic_year_id into v_term_id,v_year_id from public.academic_terms where is_current=true and not is_closed order by starts_on desc limit 1;
 select id into v_previous_period_id from public.learner_enrolment_periods where student_id=p_student_id order by admission_date desc,created_at desc limit 1;
 insert into public.learner_enrolment_periods(student_id,admission_date,class_id,academic_year_id,term_id,status,re_admission_reason,previous_period_id,created_by)
 values(p_student_id,p_admission_date,coalesce(p_class_id,v_student.class_id),v_year_id,v_term_id,'Active',btrim(p_reason),v_previous_period_id,v_uid)
 returning id into v_new_period_id;
 update public.students set status='Active',admission_date=p_admission_date,class_id=coalesce(p_class_id,class_id),
  is_bursary=false,bursary_fee_ugx=0,bursary_category=null,bursary_reason=null,bursary_notes=null,bursary_approved_by=null,bursary_approved_at=null,
  admission_prorate=false,admission_prorate_term_id=null
 where id=p_student_id;
 return v_new_period_id;
end;$$;