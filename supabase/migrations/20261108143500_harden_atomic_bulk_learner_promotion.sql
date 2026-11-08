-- Harden CORNHILL bulk class promotion as one atomic database operation.
-- Existing fees, bursary awards, receipts, marks, LINs and pupil codes are not rewritten.

create or replace function public.promote_learners_bulk(
  p_student_ids uuid[],
  p_new_class_id uuid,
  p_effective_date date default (timezone('Africa/Kampala', now()))::date,
  p_notes text default null
)
returns table(promoted_count integer, history_count integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested integer;
  v_distinct integer;
  v_found integer;
  v_active_period_count integer;
  v_history_count integer;
  v_student_update_count integer;
  v_enrolment_update_count integer;
  v_notes text := nullif(btrim(p_notes),'');
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only an authenticated school administrator can promote learners'
      using errcode='42501';
  end if;
  if p_student_ids is null or cardinality(p_student_ids)=0 then
    raise exception 'Select at least one learner for bulk promotion';
  end if;
  if cardinality(p_student_ids)>500 then
    raise exception 'Bulk promotion is limited to 500 learners per operation';
  end if;
  if p_new_class_id is null or p_effective_date is null then
    raise exception 'Choose a destination class and effective date';
  end if;
  if v_notes is not null and char_length(v_notes)>500 then
    raise exception 'Promotion notes must be 500 characters or fewer';
  end if;
  if not exists(select 1 from public.school_classes where id=p_new_class_id) then
    raise exception 'The destination class does not exist';
  end if;

  v_requested := cardinality(p_student_ids);
  select count(distinct x) into v_distinct
  from unnest(p_student_ids) as u(x);
  if v_distinct<>v_requested
     or exists(select 1 from unnest(p_student_ids) u(x) where x is null) then
    raise exception 'The selection contains duplicate or invalid learner entries. Review the selection and try again';
  end if;

  perform s.id
  from public.students s
  where s.id=any(p_student_ids)
  order by s.id
  for update;

  select count(*) into v_found
  from public.students s
  where s.id=any(p_student_ids);
  if v_found<>v_requested then
    raise exception 'One or more selected learner records could not be found. Refresh the register and select them again';
  end if;

  if exists (
    select 1 from public.students s
    where s.id=any(p_student_ids)
      and (s.status<>'Active' or s.class_id is null or s.class_id=p_new_class_id)
  ) then
    raise exception 'All selected learners must be active, assigned to a current class, and in a different class from the destination. No learners were changed';
  end if;

  select count(*) into v_active_period_count
  from public.learner_enrolment_periods ep
  where ep.student_id=any(p_student_ids) and ep.status='Active';
  if v_active_period_count<>v_requested then
    raise exception 'Every selected learner must have exactly one active enrolment period. No learners were changed; review the enrolment records';
  end if;

  if exists (
    select 1
    from public.learner_enrolment_periods ep
    where ep.student_id=any(p_student_ids) and ep.status='Active'
    group by ep.student_id
    having count(*)<>1
  ) then
    raise exception 'An enrolment record has multiple active periods. No learners were changed';
  end if;

  if exists (
    select 1
    from public.students s
    join public.learner_enrolment_periods ep
      on ep.student_id=s.id and ep.status='Active'
    where s.id=any(p_student_ids)
      and ep.class_id is distinct from s.class_id
  ) then
    raise exception 'A selected learner has a class mismatch in the active enrolment record. No learners were changed; correct the enrolment first';
  end if;

  insert into public.student_class_history
    (student_id,from_class_id,to_class_id,effective_date,notes,changed_by)
  select s.id,s.class_id,p_new_class_id,p_effective_date,
         coalesce(v_notes,'Bulk class promotion'),(select auth.uid())
  from public.students s
  where s.id=any(p_student_ids)
  order by s.id;
  get diagnostics v_history_count = row_count;
  if v_history_count<>v_requested then
    raise exception 'The promotion history could not be recorded for every learner. No learners were changed';
  end if;

  update public.students
  set class_id=p_new_class_id
  where id=any(p_student_ids) and status='Active';
  get diagnostics v_student_update_count = row_count;
  if v_student_update_count<>v_requested then
    raise exception 'The selected learner records could not all be updated. No learners were changed';
  end if;

  update public.learner_enrolment_periods
  set class_id=p_new_class_id
  where student_id=any(p_student_ids) and status='Active';
  get diagnostics v_enrolment_update_count = row_count;
  if v_enrolment_update_count<>v_requested then
    raise exception 'The active enrolment records could not all be updated. No learners were changed';
  end if;

  return query select v_requested,v_history_count;
end;
$function$;

revoke all on function public.promote_learners_bulk(uuid[],uuid,date,text) from public,anon;
grant execute on function public.promote_learners_bulk(uuid[],uuid,date,text) to authenticated;
