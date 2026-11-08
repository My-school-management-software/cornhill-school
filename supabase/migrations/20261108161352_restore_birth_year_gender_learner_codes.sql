-- Restore CORNHILL permanent pupil codes to verified birth year + gender format.
-- Missing identity data means a temporary TMP code, never a permanent code.

create or replace function public.assign_permanent_learner_code()
returns trigger language plpgsql set search_path = ''
as $function$
declare
  v_birth_year integer;
  v_gender_letter text;
  v_sequence bigint;
  v_random_letters text;
  v_valid_identity boolean;
  v_revoke_mode boolean :=
    current_user = 'postgres'
    and coalesce(current_setting('app.revoke_incomplete_pupil_codes',true),'') = 'on';
begin
  v_birth_year := coalesce(new.birth_year, extract(year from new.date_of_birth)::integer);
  if new.date_of_birth is not null and new.birth_year is not null
     and new.birth_year <> extract(year from new.date_of_birth)::integer then
    raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.';
  end if;
  if new.gender is not null and new.gender not in ('Male','Female') then
    raise exception 'Gender must be Male or Female when supplied.';
  end if;
  if v_birth_year is not null and (
    v_birth_year < 1900 or v_birth_year > extract(year from pg_catalog.now())::integer
  ) then
    raise exception 'Enter a valid year of birth before issuing a permanent pupil code.';
  end if;

  if tg_op = 'UPDATE' and v_revoke_mode
     and old.admission_number ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$' then
    if new.admission_number !~ '^TMP[0-9A-F]{10}$' then
      raise exception 'Invalid temporary replacement code during code correction.';
    end if;
    new.admission_complete := false;
    return new;
  end if;

  v_valid_identity := new.gender in ('Male','Female')
    and v_birth_year is not null
    and v_birth_year between 1900 and extract(year from pg_catalog.now())::integer;

  if not v_valid_identity then
    if tg_op = 'UPDATE' and old.admission_number ~ '^CH[0-9]{2}[MF][0-9]{4}[A-Z]{2}$' then
      raise exception 'A permanent code cannot be kept after removing its verified gender or year of birth.';
    end if;
    if tg_op = 'UPDATE' and old.admission_number like 'TMP%' then
      new.admission_number := old.admission_number;
    else
      new.admission_number := 'TMP' || pg_catalog.upper(pg_catalog.substr(
        pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text || coalesce(new.id::text,'')),1,10));
    end if;
    if tg_op = 'UPDATE' then
      new.admission_year := old.admission_year;
    else
      new.admission_year := coalesce(new.admission_year,
        extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer);
    end if;
    new.admission_complete := false;
    return new;
  end if;

  new.birth_year := v_birth_year;
  v_gender_letter := case new.gender when 'Male' then 'M' when 'Female' then 'F' end;

  if tg_op = 'UPDATE'
     and old.admission_number ~ '^CH[0-9]{2}[MF][0-9]{4}[A-Z]{2}$'
     and old.gender is not distinct from new.gender
     and coalesce(old.birth_year,extract(year from old.date_of_birth)::integer) = v_birth_year
     and pg_catalog.left(old.admission_number,5) = 'CH' || pg_catalog.right(v_birth_year::text,2) || v_gender_letter then
    new.admission_number := old.admission_number;
    new.admission_year := old.admission_year;
  else
    v_sequence := pg_catalog.nextval('public.student_admission_sequence'::regclass);
    if v_sequence > 9999 then
      raise exception 'The four-digit admission sequence is full. Please contact the system administrator.';
    end if;
    v_random_letters :=
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1) ||
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
    if tg_op = 'UPDATE' then
      new.admission_year := old.admission_year;
    else
      new.admission_year := coalesce(new.admission_year,
        extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer);
    end if;
    new.admission_number := 'CH' || pg_catalog.right(v_birth_year::text,2) ||
      v_gender_letter || pg_catalog.lpad(v_sequence::text,4,'0') || v_random_letters;
  end if;

  new.admission_complete := (
    new.gender in ('Male','Female') and new.birth_year is not null
    and new.date_of_birth is not null
    and nullif(pg_catalog.btrim(new.lin),'') is not null
    and nullif(pg_catalog.btrim(new.guardian_name),'') is not null
    and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null
  );
  return new;
end;
$function$;

create or replace function public.prevent_permanent_learner_code_change()
returns trigger language plpgsql set search_path = ''
as $function$
declare
  v_birth_year integer;
  v_gender_letter text;
begin
  if old.admission_number ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$'
     and new.admission_number ~ '^TMP[0-9A-F]{10}$'
     and current_user = 'postgres'
     and coalesce(current_setting('app.revoke_incomplete_pupil_codes',true),'') = 'on' then
    return new;
  end if;
  if new.admission_number is not distinct from old.admission_number then return new; end if;
  v_birth_year := coalesce(new.birth_year,extract(year from new.date_of_birth)::integer);
  v_gender_letter := case new.gender when 'Male' then 'M' when 'Female' then 'F' else null end;
  if new.admission_number ~ '^CH[0-9]{2}[MF][0-9]{4}[A-Z]{2}$'
     and v_birth_year is not null and v_gender_letter is not null
     and pg_catalog.left(new.admission_number,5) = 'CH' || pg_catalog.right(v_birth_year::text,2) || v_gender_letter then
    return new;
  end if;
  raise exception 'A permanent pupil code must use the verified birth year and gender format. Correct the learner details instead of editing the code.';
end;
$function$;

create or replace function public.record_learner_code_change()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_reason text;
  v_suppress_notifications boolean :=
    coalesce(current_setting('app.bulk_learner_code_backfill',true),'')='on';
begin
  if old.admission_number is not distinct from new.admission_number then return new; end if;
  if old.admission_number ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$' then return new; end if;

  if exists(select 1 from public.students s where upper(s.admission_number)=upper(old.admission_number) and s.id<>new.id)
     or exists(select 1 from public.learner_code_aliases a where a.code_normalized=upper(old.admission_number) and a.student_id<>new.id) then
    raise exception 'The previous learner code is already associated with another learner.';
  end if;

  v_reason := concat_ws('; ',
    case when old.gender is distinct from new.gender then 'Gender corrected from '||old.gender||' to '||new.gender end,
    case when coalesce(old.birth_year,extract(year from old.date_of_birth)::integer)
                   is distinct from coalesce(new.birth_year,extract(year from new.date_of_birth)::integer)
      then 'Year of birth corrected from '||coalesce(old.birth_year::text,'unknown')||
           ' to '||coalesce(new.birth_year::text,'unknown') end,
    'Pupil code regenerated using verified birth year and gender while preserving the learner record');

  insert into public.learner_code_aliases(code_normalized,old_code,new_code,student_id,changed_by,reason)
  values(upper(btrim(old.admission_number)),old.admission_number,new.admission_number,new.id,auth.uid(),v_reason)
  on conflict(code_normalized) do nothing;

  insert into public.learner_code_change_audit
    (student_id,old_code,new_code,old_gender,new_gender,old_birth_year,new_birth_year,
     old_date_of_birth,new_date_of_birth,changed_by,reason)
  values(new.id,old.admission_number,new.admission_number,old.gender,new.gender,
         old.birth_year,new.birth_year,old.date_of_birth,new.date_of_birth,auth.uid(),v_reason);

  if not v_suppress_notifications then
    insert into public.school_notifications(category,severity,title,message,student_id,audience_role,action_workspace,source_key)
    values('learner_code_change','warning','Learner pupil code updated',
      'The pupil code for '||trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name))||
      ' changed from '||old.admission_number||' to '||new.admission_number||
      '. Use the new code for future records. The learner’s existing history remains linked.',
      new.id,'Admin','students','learner-code-change-admin:'||new.id::text||':'||new.admission_number)
    on conflict(source_key) do nothing;

    insert into public.school_notifications(category,severity,title,message,student_id,recipient_user_id,action_workspace,source_key)
    select 'learner_code_change','warning','Learner pupil code updated',
      'The pupil code for '||trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name))||
      ' changed from '||old.admission_number||' to '||new.admission_number||
      '. Use the new code for future records. Existing academic history remains attached.',
      new.id,cta.user_id,'students',
      'learner-code-change-teacher:'||new.id::text||':'||new.admission_number||':'||cta.user_id::text
    from public.class_teacher_access cta
    where cta.class_id in (old.class_id,new.class_id) and cta.user_id is not null
    on conflict(source_key) do nothing;
  end if;
  return new;
end;
$function$;

select pg_catalog.set_config('app.revoke_incomplete_pupil_codes','on',true);

update public.students s
set admission_number = 'TMP' || pg_catalog.upper(pg_catalog.substr(
      pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text || s.id::text),1,10)),
    admission_complete = false
where s.status <> 'Archived'
  and s.admission_number ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$'
  and coalesce(s.birth_year,extract(year from s.date_of_birth)::integer) is null;

update public.learner_code_aliases a
set new_code = s.admission_number,
    reason = 'Incorrect permanent code revoked because verified year of birth was absent; prior code retained only as historical lookup alias pending correction.'
from public.students s
where a.student_id=s.id
  and a.new_code ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$'
  and s.admission_number ~ '^TMP[0-9A-F]{10}$';

delete from public.learner_code_change_audit
where old_code ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$'
   or new_code ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$';

delete from public.school_notifications
where category='learner_code_change'
  and (coalesce(title,'')||' '||coalesce(message,'')||' '||coalesce(source_key,''))
      ~ 'CH[0-9]{2}X[0-9]{4}[A-Z]{2}';
