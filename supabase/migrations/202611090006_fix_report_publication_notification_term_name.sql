-- Correct report notification label lookup: academic_terms uses column `name`.
create or replace function public.notify_school_report_publication()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_student_name text; v_class_name text; v_term_label text;
begin
  select concat_ws(' ',s.first_name,s.middle_name,s.last_name),c.name,t.name
    into v_student_name,v_class_name,v_term_label
  from public.students s
  left join public.school_classes c on c.id=new.class_id
  left join public.academic_terms t on t.id=new.term_id
  where s.id=new.student_id;

  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    student_id,audience_role,action_payload,is_actionable)
  values('report_publication','info','Learner report approved',
    'A report card for '||coalesce(v_student_name,'a learner')||' in '||coalesce(v_class_name,'the assigned class')||
      ' ('||coalesce(v_term_label,'current term')||') was approved for publication.',
    'academics','report-publication:'||new.id::text||':admin',new.id,new.student_id,'Admin',
    jsonb_build_object('url','/?workspace=academics','workspace','academics','student_id',new.student_id),false)
  on conflict(source_key) do nothing;

  insert into public.school_notifications(category,severity,title,message,action_workspace,source_key,source_id,
    student_id,audience_role,action_payload,is_actionable)
  values('report_publication','info','Report card publication approved',
    'A learner report card for '||coalesce(v_class_name,'your assigned class')||
      ' was approved for publication. Check the academic workspace.',
    'academics','report-publication:'||new.id::text||':teacher',new.id,new.student_id,'Teacher',
    jsonb_build_object('url','/?workspace=academics','workspace','academics','student_id',new.student_id),false)
  on conflict(source_key) do nothing;
  return new;
end;
$function$;
revoke all on function public.notify_school_report_publication() from public,anon,authenticated;
