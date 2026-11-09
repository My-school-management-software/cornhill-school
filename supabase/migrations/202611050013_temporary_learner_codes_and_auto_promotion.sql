-- Temporary learner codes are assigned when gender or birth year is not yet known.
-- Completing both fields promotes the temporary code to the permanent CHYYMNNNNLL format.
create or replace function public.assign_permanent_learner_code()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sequence bigint;
  v_birth_year integer;
  v_gender_letter text;
  v_random_letters text;
begin
  if tg_op = 'INSERT' then
    v_birth_year := coalesce(new.birth_year, extract(year from new.date_of_birth)::integer);
    if new.gender not in ('Male','Female') or v_birth_year is null
       or v_birth_year < 1900 or v_birth_year > extract(year from pg_catalog.now())::integer then
      new.admission_number := 'TMP' || pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text),1,9));
      new.admission_complete := false;
      return new;
    end if;
  else
    if old.admission_number not like 'TMP%' then
      if new.admission_number is distinct from old.admission_number then
        raise exception 'A permanent learner code cannot be changed.';
      end if;
      return new;
    end if;
    v_birth_year := coalesce(new.birth_year, extract(year from new.date_of_birth)::integer);
    if new.gender not in ('Male','Female') or v_birth_year is null
       or v_birth_year < 1900 or v_birth_year > extract(year from pg_catalog.now())::integer then
      return new;
    end if;
  end if;

  new.birth_year := v_birth_year;
  v_gender_letter := case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
  v_sequence := pg_catalog.nextval('public.student_admission_sequence'::regclass);
  if v_sequence > 9999 then
    raise exception 'The four-digit admission sequence is full. Please contact the system administrator.';
  end if;
  v_random_letters :=
    pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (pg_catalog.floor(pg_catalog.random()*26)::integer)+1, 1) ||
    pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (pg_catalog.floor(pg_catalog.random()*26)::integer)+1, 1);
  new.admission_year := extract(year from pg_catalog.timezone('Africa/Kampala', now()))::integer;
  new.admission_number := 'CH' || pg_catalog.right(v_birth_year::text, 2) || v_gender_letter ||
    pg_catalog.lpad(v_sequence::text, 4, '0') || v_random_letters;
  return new;
end;
$function$;

create or replace function public.prevent_permanent_learner_code_change()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.admission_number not like 'TMP%' and
     (new.admission_number is distinct from old.admission_number or new.admission_year is distinct from old.admission_year) then
    raise exception 'The permanent learner code and admission year cannot be changed.';
  end if;
  if old.admission_number like 'TMP%' and new.admission_number is distinct from old.admission_number
     and new.admission_number not like 'CH%' then
    raise exception 'A temporary learner code can only be replaced by a valid permanent school code.';
  end if;
  return new;
end;
$function$;

drop trigger if exists students_assign_permanent_code on public.students;
create trigger students_assign_permanent_code
before insert or update of gender, birth_year, date_of_birth on public.students
for each row execute function public.assign_permanent_learner_code();