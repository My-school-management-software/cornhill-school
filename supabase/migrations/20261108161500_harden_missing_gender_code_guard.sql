-- Ensure a missing gender is treated as incomplete identity, never as a valid code.
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
  v_birth_year := coalesce(new.birth_year,extract(year from new.date_of_birth)::integer);
  if new.date_of_birth is not null and new.birth_year is not null
     and new.birth_year <> extract(year from new.date_of_birth)::integer then
    raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.';
  end if;
  if new.gender is not null and new.gender not in ('Male','Female') then
    raise exception 'Gender must be Male or Female when supplied.';
  end if;
  if v_birth_year is not null and (v_birth_year<1900 or v_birth_year>extract(year from pg_catalog.now())::integer) then
    raise exception 'Enter a valid year of birth before issuing a permanent pupil code.';
  end if;
  if tg_op='UPDATE' and v_revoke_mode and old.admission_number ~ '^CH[0-9]{2}X[0-9]{4}[A-Z]{2}$' then
    if new.admission_number !~ '^TMP[0-9A-F]{10}$' then
      raise exception 'Invalid temporary replacement code during code correction.';
    end if;
    new.admission_complete:=false;
    return new;
  end if;
  v_valid_identity := coalesce(
    new.gender in ('Male','Female')
    and v_birth_year is not null
    and v_birth_year between 1900 and extract(year from pg_catalog.now())::integer,
    false
  );
  if not v_valid_identity then
    if tg_op='UPDATE' and old.admission_number ~ '^CH[0-9]{2}[MF][0-9]{4}[A-Z]{2}$' then
      raise exception 'A permanent code cannot be kept after removing its verified gender or year of birth.';
    end if;
    if tg_op='UPDATE' and old.admission_number like 'TMP%' then
      new.admission_number:=old.admission_number;
    else
      new.admission_number:='TMP'||pg_catalog.upper(pg_catalog.substr(
        pg_catalog.md5(pg_catalog.random()::text||pg_catalog.clock_timestamp()::text||coalesce(new.id::text,'')),1,10));
    end if;
    if tg_op='UPDATE' then new.admission_year:=old.admission_year;
    else new.admission_year:=coalesce(new.admission_year,extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer);
    end if;
    new.admission_complete:=false;
    return new;
  end if;
  new.birth_year:=v_birth_year;
  v_gender_letter:=case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
  if tg_op='UPDATE'
     and old.admission_number ~ '^CH[0-9]{2}[MF][0-9]{4}[A-Z]{2}$'
     and old.gender is not distinct from new.gender
     and coalesce(old.birth_year,extract(year from old.date_of_birth)::integer)=v_birth_year
     and pg_catalog.left(old.admission_number,5)='CH'||pg_catalog.right(v_birth_year::text,2)||v_gender_letter then
    new.admission_number:=old.admission_number;
    new.admission_year:=old.admission_year;
  else
    v_sequence:=pg_catalog.nextval('public.student_admission_sequence'::regclass);
    if v_sequence>9999 then raise exception 'The four-digit admission sequence is full. Please contact the system administrator.'; end if;
    v_random_letters:=
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1)||
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
    if tg_op='UPDATE' then new.admission_year:=old.admission_year;
    else new.admission_year:=coalesce(new.admission_year,extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer);
    end if;
    new.admission_number:='CH'||pg_catalog.right(v_birth_year::text,2)||v_gender_letter||
      pg_catalog.lpad(v_sequence::text,4,'0')||v_random_letters;
  end if;
  new.admission_complete:=(
    new.gender in ('Male','Female') and new.birth_year is not null
    and new.date_of_birth is not null and nullif(pg_catalog.btrim(new.lin),'') is not null
    and nullif(pg_catalog.btrim(new.guardian_name),'') is not null
    and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null
  );
  return new;
end;
$function$;
