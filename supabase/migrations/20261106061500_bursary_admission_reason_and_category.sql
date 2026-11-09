-- CORNHILL: accountable bursary categories, reasons and fee handling
-- Existing live learner/finance records are preserved.
begin;

alter table public.students
  add column if not exists bursary_category text,
  add column if not exists bursary_reason text,
  add column if not exists bursary_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists bursary_approved_at timestamptz;

alter table public.students
  drop constraint if exists students_bursary_award_details_check,
  drop constraint if exists students_bursary_category_amount_check;

alter table public.students
  add constraint students_bursary_award_details_check
  check (
    (is_bursary and bursary_category is not null and nullif(btrim(bursary_reason),'') is not null)
    or
    (not is_bursary and bursary_category is null and bursary_reason is null)
  ),
  add constraint students_bursary_category_amount_check
  check (
    (not is_bursary and bursary_fee_ugx = 0)
    or (is_bursary and bursary_category in ('Full bursary','Fully sponsored') and bursary_fee_ugx = 0)
    or (is_bursary and bursary_category in ('Half bursary','Partial bursary') and bursary_fee_ugx > 0)
  );

create or replace function public.stamp_bursary_award_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.is_bursary is distinct from old.is_bursary
       or new.bursary_category is distinct from old.bursary_category
       or new.bursary_fee_ugx is distinct from old.bursary_fee_ugx
       or new.bursary_reason is distinct from old.bursary_reason
     ) then
    raise exception 'Bursary awards are locked after admission. Use an approved bursary amendment workflow to change the award.';
  end if;

  if new.is_bursary then
    if new.bursary_category not in ('Full bursary','Half bursary','Partial bursary','Fully sponsored') then
      raise exception 'Choose a valid bursary category';
    end if;
    if nullif(btrim(new.bursary_reason),'') is null then
      raise exception 'A reason is required for every bursary or free admission';
    end if;
    if new.bursary_category in ('Full bursary','Fully sponsored') and coalesce(new.bursary_fee_ugx,0) <> 0 then
      raise exception 'Full bursary and fully sponsored learners must have UGX 0 payable';
    end if;
    if new.bursary_category in ('Half bursary','Partial bursary') and coalesce(new.bursary_fee_ugx,0) <= 0 then
      raise exception 'Enter the approved amount payable for a half or partial bursary';
    end if;

    if tg_op = 'INSERT' then
      if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
        raise exception 'An authenticated school administrator is required to approve a bursary';
      end if;
      new.bursary_approved_by := auth.uid();
      new.bursary_approved_at := now();
    end if;
    new.bursary_notes := btrim(new.bursary_reason);
  else
    new.bursary_fee_ugx := 0;
    new.bursary_category := null;
    new.bursary_reason := null;
    new.bursary_notes := null;
    new.bursary_approved_by := null;
    new.bursary_approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists students_stamp_bursary_award on public.students;
create trigger students_stamp_bursary_award
before insert or update of is_bursary, bursary_category, bursary_fee_ugx, bursary_reason
on public.students
for each row execute function public.stamp_bursary_award_approval();

create or replace function public.create_bursary_admission_charge()
returns trigger
language plpgsql
set search_path = 'public', 'auth'
as $function$
begin
  if new.is_bursary then
    if new.bursary_category is null or nullif(btrim(new.bursary_reason),'') is null then
      raise exception 'A bursary category and reason are compulsory';
    end if;
    if new.bursary_fee_ugx > 0 then
      insert into public.learner_charges(
        student_id, description, amount_ugx, created_by
      ) values (
        new.id,
        'Approved bursary fee — ' || new.bursary_category || ' — ' || btrim(new.bursary_reason),
        new.bursary_fee_ugx,
        auth.uid()
      );
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.admin_apply_learner_fee_schedule(p_student_id uuid, p_period_label text)
returns table(created_charges integer, already_charged integer, total_amount_ugx bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_student public.students%rowtype;
 v_schedule record;
 v_created integer:=0;
 v_skipped integer:=0;
 v_total bigint:=0;
 v_description text;
begin
 if auth.uid() is null or not public.is_school_admin() then
  raise exception 'Only the school administrator may apply fee schedules' using errcode='42501';
 end if;
 if p_student_id is null or nullif(btrim(p_period_label),'') is null then
  raise exception 'Choose a learner and enter the billing period';
 end if;
 select * into v_student from public.students where id=p_student_id and status='Active';
 if not found then raise exception 'Active learner not found'; end if;
 if v_student.class_id is null then raise exception 'Assign the learner to a class before applying the fee schedule'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_student_id::text||':'||lower(btrim(p_period_label)),0));
 for v_schedule in
  select fs.fee_item_id,fs.amount_ugx,fi.name
  from public.fee_schedules fs
  join public.fee_items fi on fi.id=fs.fee_item_id
  join public.school_classes sc on sc.id=v_student.class_id
  where fs.is_active and fs.class_group=sc.name
    and (fs.learner_type='Any' or fs.learner_type=v_student.learner_type)
    and (
      (fi.name='School fees' and not v_student.is_bursary)
      or (fi.name='Boarding' and v_student.learner_type='Boarding')
      or (fi.name='Breakfast' and v_student.takes_breakfast)
      or (fi.name='Lunch' and v_student.takes_lunch)
    )
  order by case fi.name when 'School fees' then 1 when 'Boarding' then 2 when 'Breakfast' then 3 when 'Lunch' then 4 else 5 end
 loop
  v_description:=btrim(p_period_label)||' - '||v_schedule.name;
  if exists(select 1 from public.learner_charges c where c.student_id=p_student_id and c.fee_item_id=v_schedule.fee_item_id and c.description=v_description) then
   v_skipped:=v_skipped+1;
  else
   insert into public.learner_charges(invoice_no,student_id,fee_item_id,description,amount_ugx,created_by)
   values('SCH-'||upper(replace(gen_random_uuid()::text,'-','')),p_student_id,v_schedule.fee_item_id,v_description,v_schedule.amount_ugx,auth.uid());
   v_created:=v_created+1;
   v_total:=v_total+v_schedule.amount_ugx;
  end if;
 end loop;
 return query select v_created,v_skipped,v_total;
end;
$function$;

drop function if exists public.admin_list_active_finance_students_v2();
create function public.admin_list_active_finance_students_v2()
returns table(
 id uuid, admission_number text, first_name text, middle_name text, last_name text,
 is_bursary boolean, bursary_fee_ugx bigint, class_name text, learner_type text,
 takes_breakfast boolean, takes_lunch boolean, bursary_category text, bursary_reason text,
 bursary_approved_by uuid, bursary_approved_at timestamptz, bursary_approved_by_name text
)
language plpgsql stable security definer
set search_path to ''
as $function$
begin
 if auth.uid() is null or not public.is_school_admin() then
  raise exception 'Only school administrators may access finance learner records' using errcode='42501';
 end if;
 return query
 select s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,
        s.is_bursary,s.bursary_fee_ugx,coalesce(c.name,''),s.learner_type,
        s.takes_breakfast,s.takes_lunch,s.bursary_category,s.bursary_reason,
        s.bursary_approved_by,s.bursary_approved_at,up.full_name
 from public.students s
 left join public.school_classes c on c.id=s.class_id
 left join public.user_profiles up on up.id=s.bursary_approved_by
 where s.status='Active'
 order by s.first_name,s.last_name
 limit 2000;
end;
$function$;
revoke all on function public.admin_list_active_finance_students_v2() from public, anon;
grant execute on function public.admin_list_active_finance_students_v2() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
