-- record_learner_code_change writes only to the base audit and alias tables. learner_account_balances is a derived view.
create or replace function public.record_learner_code_change()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
declare v_reason text;
begin
  if old.admission_number is not distinct from new.admission_number then return new; end if;
  if exists(select 1 from public.students s where upper(s.admission_number)=upper(old.admission_number) and s.id<>new.id)
     or exists(select 1 from public.learner_code_aliases a where a.code_normalized=upper(old.admission_number) and a.student_id<>new.id) then
    raise exception 'The previous learner code is already associated with another learner.';
  end if;
  v_reason:=concat_ws('; ',case when old.gender is distinct from new.gender then 'Gender corrected from '||old.gender||' to '||new.gender end,
    case when coalesce(old.birth_year,extract(year from old.date_of_birth)::integer) is distinct from coalesce(new.birth_year,extract(year from new.date_of_birth)::integer)
      then 'Year of birth corrected from '||coalesce(old.birth_year::text,'unknown')||' to '||coalesce(new.birth_year::text,'unknown') end,
    'Pupil code regenerated while preserving the learner record');
  insert into public.learner_code_aliases(code_normalized,old_code,new_code,student_id,changed_by,reason)
    values(upper(btrim(old.admission_number)),old.admission_number,new.admission_number,new.id,auth.uid(),v_reason) on conflict(code_normalized) do nothing;
  insert into public.learner_code_change_audit(student_id,old_code,new_code,old_gender,new_gender,old_birth_year,new_birth_year,old_date_of_birth,new_date_of_birth,changed_by,reason)
    values(new.id,old.admission_number,new.admission_number,old.gender,new.gender,old.birth_year,new.birth_year,old.date_of_birth,new.date_of_birth,auth.uid(),v_reason);
  insert into public.school_notifications(category,severity,title,message,student_id,audience_role,action_workspace,source_key)
    values('learner_code_change','warning','Learner pupil code updated','The pupil code for '||trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name))||' changed from '||old.admission_number||' to '||new.admission_number||'. Use the new code for future records. The learner’s existing history remains linked.',new.id,'Admin','students','learner-code-change-admin:'||new.id::text||':'||new.admission_number)
    on conflict(source_key) do nothing;
  insert into public.school_notifications(category,severity,title,message,student_id,recipient_user_id,action_workspace,source_key)
    select 'learner_code_change','warning','Learner pupil code updated','The pupil code for '||trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name))||' changed from '||old.admission_number||' to '||new.admission_number||'. Use the new code for future records. Existing academic history remains attached.',new.id,cta.user_id,'students','learner-code-change-teacher:'||new.id::text||':'||new.admission_number||':'||cta.user_id::text
    from public.class_teacher_access cta where cta.class_id in (old.class_id,new.class_id) and cta.user_id is not null on conflict(source_key) do nothing;
  return new;
end;
$fn$;
revoke all on function public.record_learner_code_change() from public,anon,authenticated;