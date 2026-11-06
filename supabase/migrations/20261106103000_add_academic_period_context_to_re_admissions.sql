create or replace function public.create_initial_learner_enrolment_period()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_year_id uuid;v_term_id uuid;
begin
 select id into v_year_id from public.academic_years where is_current=true order by starts_on desc limit 1;
 select id,academic_year_id into v_term_id,v_year_id from public.academic_terms where is_current=true and not is_closed order by starts_on desc limit 1;
 insert into public.learner_enrolment_periods(student_id,admission_date,class_id,academic_year_id,term_id,status,created_by)
 values(new.id,coalesce(new.admission_date,(timezone('Africa/Kampala',now()))::date),new.class_id,v_year_id,v_term_id,
 case when new.status='Active' then 'Active' when new.status='Transferred' then 'Transferred' when new.status='Graduated' then 'Completed' else 'Withdrawn' end,auth.uid());
 return new;
end;$$;
create or replace function public.sync_learner_enrolment_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status<>'Active' then
  update public.learner_enrolment_periods set status=case new.status when 'Transferred' then 'Transferred' when 'Graduated' then 'Completed' else 'Withdrawn' end,
   exit_date=greatest((timezone('Africa/Kampala',now()))::date,admission_date) where student_id=new.id and status='Active';
 end if;return new;
end;$$;
create or replace function public.admin_find_learner_matches(p_first_name text,p_last_name text,p_middle_name text default null,p_date_of_birth date default null,p_birth_year integer default null,p_lin text default null,p_guardian_phone text default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_school_admin() then raise exception 'Only school administrators may search previous learner records' using errcode='42501';end if;
 return query select to_jsonb(x) from (
  select s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,s.gender,s.date_of_birth,s.birth_year,s.lin,s.status,s.admission_date,c.name class_name,
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
 values(p_student_id,p_admission_date,coalesce(p_class_id,v_student.class_id),v_year_id,v_term_id,'Active',btrim(p_reason),v_previous_period_id,v_uid) returning id into v_new_period_id;
 update public.students set status='Active',admission_date=p_admission_date,class_id=coalesce(p_class_id,class_id) where id=p_student_id;
 return v_new_period_id;
end;$$;