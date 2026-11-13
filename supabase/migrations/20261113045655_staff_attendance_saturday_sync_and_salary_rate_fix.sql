-- Recalculate Saturday-required status for both old/new class mappings and
-- divide yearly salary by all calendar days in the relevant year (365/366).
create or replace function public.recompute_staff_saturday_attendance_requirement(p_staff_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
begin
  if p_staff_id is null then return; end if;
  update public.staff_attendance_schedule_assignments a
  set saturday_required=exists (
    select 1 from public.class_teacher_access cta
    join public.school_classes c on c.id=cta.class_id
    where cta.user_id=p_staff_id and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
    union
    select 1 from public.class_subjects cs
    join public.school_classes c on c.id=cs.class_id
    where cs.teacher_user_id=p_staff_id and upper(regexp_replace(c.name,'[^A-Za-z0-9]','','g')) in ('P3','P4','P5','P6','P7')
  )
  where a.staff_user_id=p_staff_id;
end;
$function$;
revoke all on function public.recompute_staff_saturday_attendance_requirement(uuid) from public,anon,authenticated;

create or replace function public.refresh_staff_saturday_attendance_requirement()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_op<>'INSERT' then perform public.recompute_staff_saturday_attendance_requirement(old.user_id); end if;
  if tg_op<>'DELETE' and (tg_op='INSERT' or new.user_id is distinct from old.user_id) then
    perform public.recompute_staff_saturday_attendance_requirement(new.user_id);
  end if;
  return null;
end;
$function$;
revoke all on function public.refresh_staff_saturday_attendance_requirement() from public,anon,authenticated;

create or replace function public.refresh_saturday_requirement_from_subject_teacher()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_op<>'INSERT' then perform public.recompute_staff_saturday_attendance_requirement(old.teacher_user_id); end if;
  if tg_op<>'DELETE' and (tg_op='INSERT' or new.teacher_user_id is distinct from old.teacher_user_id) then
    perform public.recompute_staff_saturday_attendance_requirement(new.teacher_user_id);
  end if;
  return null;
end;
$function$;
revoke all on function public.refresh_saturday_requirement_from_subject_teacher() from public,anon,authenticated;

create or replace function public.director_decide_staff_attendance_incident(
 p_incident_id uuid,p_decision text,p_review_note text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_row public.staff_attendance_incidents%rowtype; v_daily_rate bigint; v_already_approved bigint; v_deduction bigint;
begin
 if not public.is_school_director() then raise exception 'Only the Director can make the final attendance deduction decision.'; end if;
 if p_decision not in ('excused','deduct') then raise exception 'Decision must be excused or deduct.'; end if;
 select * into v_row from public.staff_attendance_incidents where id=p_incident_id for update;
 if not found then raise exception 'Attendance incident not found.'; end if;
 if v_row.status<>'pending' or v_row.director_decision is not null then raise exception 'This attendance incident has already been decided.'; end if;
 if p_decision='deduct' then
  if v_row.review_deadline_at is null or now()<v_row.review_deadline_at then raise exception 'The two-hour review window has not ended. No deduction can be approved yet.'; end if;
  if nullif(btrim(v_row.headteacher_statement),'') is null then raise exception 'A Headteacher or DOS statement must be recorded before a deduction can be approved.'; end if;
  select coalesce(a.daily_rate_ugx,case
   when a.salary_basis='Monthly' then round(a.base_salary_ugx::numeric/extract(day from (date_trunc('month',v_row.attendance_date::timestamp)+interval '1 month - 1 day')))::bigint
   when a.salary_basis='Yearly' then round(a.base_salary_ugx::numeric/extract(day from (date_trunc('year',v_row.attendance_date::timestamp)+interval '1 year' - date_trunc('year',v_row.attendance_date::timestamp))))::bigint
   else null end)::bigint
  into v_daily_rate from public.staff_salary_agreements a
  where a.staff_user_id=v_row.staff_user_id and a.is_active and a.effective_from<=v_row.attendance_date
    and (a.effective_to is null or a.effective_to>=v_row.attendance_date)
  order by a.effective_from desc,a.created_at desc limit 1;
  if coalesce(v_daily_rate,0)<=0 then raise exception 'No valid daily rate is configured. Add a daily rate to the staff salary agreement before approving a deduction.'; end if;
  select coalesce(sum(i.approved_deduction_ugx),0)::bigint into v_already_approved
  from public.staff_attendance_incidents i where i.staff_user_id=v_row.staff_user_id and i.attendance_date=v_row.attendance_date
    and i.id<>v_row.id and i.status in ('approved','deducted');
  v_deduction:=greatest(0,v_daily_rate-v_already_approved);
  if v_deduction<=0 then raise exception 'The daily absence deduction limit has already been reached for this date.'; end if;
  update public.staff_attendance_incidents set director_decision='deduct',director_decision_by=(select auth.uid()),
    director_decision_at=now(),status='approved',approved_deduction_ugx=v_deduction,reviewed_by=(select auth.uid()),
    reviewed_at=now(),review_note=nullif(btrim(coalesce(p_review_note,'')),'') where id=p_incident_id;
 else
  update public.staff_attendance_incidents set director_decision='excused',director_decision_by=(select auth.uid()),
    director_decision_at=now(),status='rejected',approved_deduction_ugx=0,reviewed_by=(select auth.uid()),
    reviewed_at=now(),review_note=nullif(btrim(coalesce(p_review_note,'')),'') where id=p_incident_id;
 end if;
 return jsonb_build_object('ok',true,'incident_id',p_incident_id,'decision',p_decision,
  'deduction_ugx',case when p_decision='deduct' then v_deduction else 0 end);
end;
$function$;
revoke all on function public.director_decide_staff_attendance_incident(uuid,text,text) from public,anon;
grant execute on function public.director_decide_staff_attendance_incident(uuid,text,text) to authenticated;
