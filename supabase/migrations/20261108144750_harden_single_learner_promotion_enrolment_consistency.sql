-- Keep single-learner promotion consistent with bulk promotion validation.
create or replace function public.promote_learner(
  p_student_id uuid,
  p_new_class_id uuid,
  p_effective_date date default (timezone('Africa/Kampala',now()))::date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_class_id uuid;
  v_active_period_class_id uuid;
  v_active_period_count integer;
  v_history_id uuid;
  v_student_update_count integer;
  v_enrolment_update_count integer;
  v_notes text := nullif(btrim(p_notes),'');
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only an authenticated school administrator can promote learners' using errcode='42501';
  end if;
  if p_student_id is null or p_new_class_id is null or p_effective_date is null then
    raise exception 'Select a learner, destination class and effective date';
  end if;
  if v_notes is not null and char_length(v_notes)>500 then
    raise exception 'Promotion notes must be 500 characters or fewer';
  end if;
  if not exists(select 1 from public.school_classes where id=p_new_class_id) then
    raise exception 'The destination class does not exist';
  end if;

  select class_id into v_old_class_id from public.students
  where id=p_student_id and status='Active' for update;
  if not found then raise exception 'Only an active learner can be promoted'; end if;
  if v_old_class_id is null then raise exception 'The learner must have a current class before promotion'; end if;
  if v_old_class_id=p_new_class_id then raise exception 'The learner is already assigned to that class'; end if;

  select count(*),min(class_id) into v_active_period_count,v_active_period_class_id
  from public.learner_enrolment_periods
  where student_id=p_student_id and status='Active';
  if v_active_period_count<>1 then raise exception 'The learner must have exactly one active enrolment period before promotion'; end if;
  if v_active_period_class_id is distinct from v_old_class_id then
    raise exception 'The learner class does not match the active enrolment class. Correct the enrolment first; no promotion was made';
  end if;

  insert into public.student_class_history
    (student_id,from_class_id,to_class_id,effective_date,notes,changed_by)
  values (p_student_id,v_old_class_id,p_new_class_id,p_effective_date,
          coalesce(v_notes,'Individual class promotion'),(select auth.uid()))
  returning id into v_history_id;

  update public.students set class_id=p_new_class_id
  where id=p_student_id and status='Active';
  get diagnostics v_student_update_count=row_count;
  if v_student_update_count<>1 then raise exception 'The learner record could not be updated. No promotion was completed'; end if;

  update public.learner_enrolment_periods set class_id=p_new_class_id
  where student_id=p_student_id and status='Active';
  get diagnostics v_enrolment_update_count=row_count;
  if v_enrolment_update_count<>1 then raise exception 'The active enrolment record could not be updated. No promotion was completed'; end if;

  return v_history_id;
end;
$function$;
revoke all on function public.promote_learner(uuid,uuid,date,text) from public,anon;
grant execute on function public.promote_learner(uuid,uuid,date,text) to authenticated;
