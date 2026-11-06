create or replace function public.teacher_visiting_day_lookup(p_pupil_code text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_student_id uuid; v_class_id uuid; v_result jsonb;
begin
 if v_uid is null then raise exception 'Please sign in with your teacher account'; end if;
 if not exists(select 1 from public.user_profiles p where p.id=v_uid and lower(coalesce(p.role,''))='teacher' and coalesce(p.employment_status,'Active') not in ('Inactive','Terminated','Suspended')) then raise exception 'Teacher account required'; end if;
 if nullif(trim(coalesce(p_pupil_code,'')),'') is null then raise exception 'Enter the learner pupil code'; end if;
 select s.id,s.class_id into v_student_id,v_class_id from public.students s
 where upper(trim(s.admission_number))=upper(trim(p_pupil_code)) and s.status='Active'
 and exists(select 1 from public.class_teacher_access a where a.user_id=v_uid and a.class_id=s.class_id) limit 1;
 if v_student_id is null then raise exception 'No active learner with that code was found in your assigned class'; end if;
 select jsonb_build_object(
 'learner',jsonb_build_object('id',s.id,'name',concat_ws(' ',s.first_name,s.middle_name,s.last_name),'pupil_code',s.admission_number,'lin',s.lin,'class_name',sc.name,'gender',s.gender,'date_of_birth',s.date_of_birth,'age_years',case when s.date_of_birth is not null then extract(year from age(current_date,s.date_of_birth))::int when s.birth_year is not null then greatest(0,extract(year from current_date)::int-s.birth_year) else null end,'status',s.status),
 'assessments',coalesce((select jsonb_agg(jsonb_build_object('term',t.name,'academic_year',y.name,'period',case when lower(coalesce(a.title,'')) like '%beginning%' then 'Beginning' when lower(coalesce(a.title,'')) like '%midterm%' or lower(coalesce(a.title,'')) like '%mid-term%' then 'Midterm' when lower(coalesce(a.title,'')) like '%end of term%' or lower(coalesce(a.title,'')) like '%end-term%' then 'End of term' when lower(coalesce(a.title,'')) like '%set i%' then 'Set I' when lower(coalesce(a.title,'')) like '%set ii%' then 'Set II' when lower(coalesce(a.title,'')) like '%set iii%' then 'Set III' when lower(coalesce(a.title,'')) like '%set iv%' then 'Set IV' else 'Other' end,'assessment_title',a.title,'assessment_type',a.assessment_type,'subject',sub.name,'score',scr.score,'maximum_score',a.max_score,'teacher_comment',scr.teacher_comment,'assessment_date',a.assessment_date) order by y.name,t.name,a.assessment_date,a.title,sub.name)
 from public.assessment_scores scr join public.assessments a on a.id=scr.assessment_id join public.academic_terms t on t.id=a.term_id left join public.academic_years y on y.id=t.academic_year_id left join public.subjects sub on sub.id=a.subject_id where scr.student_id=s.id and a.class_id=s.class_id),'[]'::jsonb),
 'conduct_reports',coalesce((select jsonb_agg(jsonb_build_object('report_type',r.report_type,'title',r.title,'details',r.details,'date',coalesce(r.published_at,r.created_at)) order by coalesce(r.published_at,r.created_at) desc) from public.learner_conduct_reports r where r.student_id=s.id),'[]'::jsonb)
 ) into v_result from public.students s join public.school_classes sc on sc.id=s.class_id where s.id=v_student_id;
 return v_result;
end $$;
revoke all on function public.teacher_visiting_day_lookup(text) from public,anon;
grant execute on function public.teacher_visiting_day_lookup(text) to authenticated;
