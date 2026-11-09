-- Reapply the birth-year trigger with legacy-data-safe validation.
create or replace function public.assign_permanent_learner_code()
returns trigger language plpgsql set search_path = ''
as $fn$
declare v_sequence bigint; v_birth_year integer; v_old_birth_year integer; v_gender_letter text; v_random_letters text; v_year_fields_changed boolean:=false;
begin
  v_birth_year:=coalesce(new.birth_year,extract(year from new.date_of_birth)::integer);
  if tg_op='INSERT' then
    if new.date_of_birth is not null and new.birth_year is not null and new.birth_year<>extract(year from new.date_of_birth)::integer then raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.'; end if;
  else
    v_year_fields_changed:=new.birth_year is distinct from old.birth_year or new.date_of_birth is distinct from old.date_of_birth;
    if new.date_of_birth is not null and new.birth_year is not null and new.birth_year<>extract(year from new.date_of_birth)::integer and v_year_fields_changed then raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.'; end if;
  end if;
  if tg_op='UPDATE' and old.admission_number not like 'TMP%' then
    v_old_birth_year:=coalesce(old.birth_year,extract(year from old.date_of_birth)::integer);
    if new.gender not in ('Male','Female') or v_birth_year is null or v_birth_year<1900 or v_birth_year>extract(year from pg_catalog.now())::integer then raise exception 'A valid gender and year of birth are required to maintain a permanent learner code.'; end if;
    new.birth_year:=v_birth_year;
    if new.gender is distinct from old.gender or v_birth_year is distinct from v_old_birth_year then
      v_gender_letter:=case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
      v_sequence:=pg_catalog.nextval('public.student_admission_sequence'::regclass);
      if v_sequence>9999 then raise exception 'The four-digit admission sequence is full. Please contact the system administrator.'; end if;
      v_random_letters:=pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1)||pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
      new.admission_number:='CH'||pg_catalog.right(v_birth_year::text,2)||v_gender_letter||pg_catalog.lpad(v_sequence::text,4,'0')||v_random_letters;
    else new.admission_number:=old.admission_number; end if;
    new.admission_year:=old.admission_year;
    new.admission_complete:=(new.gender in ('Male','Female') and new.date_of_birth is not null and nullif(pg_catalog.btrim(new.lin),'') is not null and nullif(pg_catalog.btrim(new.guardian_name),'') is not null and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null);
    return new;
  end if;
  if new.gender not in ('Male','Female') or v_birth_year is null or v_birth_year<1900 or v_birth_year>extract(year from pg_catalog.now())::integer then
    if tg_op='INSERT' then new.admission_number:='TMP'||pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text||pg_catalog.clock_timestamp()::text),1,9)); end if;
    new.admission_complete:=false; return new;
  end if;
  new.birth_year:=v_birth_year;
  v_gender_letter:=case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
  v_sequence:=pg_catalog.nextval('public.student_admission_sequence'::regclass);
  if v_sequence>9999 then raise exception 'The four-digit admission sequence is full. Please contact the system administrator.'; end if;
  v_random_letters:=pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1)||pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
  new.admission_year:=extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer;
  new.admission_number:='CH'||pg_catalog.right(v_birth_year::text,2)||v_gender_letter||pg_catalog.lpad(v_sequence::text,4,'0')||v_random_letters;
  new.admission_complete:=(new.gender in ('Male','Female') and new.date_of_birth is not null and nullif(pg_catalog.btrim(new.lin),'') is not null and nullif(pg_catalog.btrim(new.guardian_name),'') is not null and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null);
  return new;
end;
$fn$;