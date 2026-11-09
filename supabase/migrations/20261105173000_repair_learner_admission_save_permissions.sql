-- Keep birth year writable for the admission form without exposing it to direct SELECT.
grant insert (birth_year) on public.students to authenticated;
grant update (birth_year) on public.students to authenticated;

-- Derive admission completeness in the database, not from a client-supplied flag.
create or replace function public.assign_permanent_learner_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_sequence bigint;
  v_birth_year integer;
  v_gender_letter text;
  v_random_letters text;
begin
  if tg_op = 'UPDATE' and old.admission_number not like 'TMP%' then
    if new.admission_number is distinct from old.admission_number
       or new.admission_year is distinct from old.admission_year then
      raise exception 'A permanent learner code cannot be changed.';
    end if;
    new.admission_complete := (
      new.gender in ('Male','Female')
      and new.date_of_birth is not null
      and nullif(pg_catalog.btrim(new.lin), '') is not null
      and nullif(pg_catalog.btrim(new.guardian_name), '') is not null
      and nullif(pg_catalog.btrim(new.guardian_phone), '') is not null
    );
    return new;
  end if;

  v_birth_year := coalesce(new.birth_year, extract(year from new.date_of_birth)::integer);
  if new.gender not in ('Male','Female') or v_birth_year is null
     or v_birth_year < 1900 or v_birth_year > extract(year from pg_catalog.now())::integer then
    if tg_op = 'INSERT' then
      new.admission_number := 'TMP' || pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text),1,9));
    end if;
    new.admission_complete := false;
    return new;
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
  new.admission_complete := (
    new.gender in ('Male','Female')
    and new.date_of_birth is not null
    and nullif(pg_catalog.btrim(new.lin), '') is not null
    and nullif(pg_catalog.btrim(new.guardian_name), '') is not null
    and nullif(pg_catalog.btrim(new.guardian_phone), '') is not null
  );
  return new;
end;
$function$;

drop trigger if exists students_assign_permanent_code on public.students;
create trigger students_assign_permanent_code
before insert or update of gender, birth_year, date_of_birth, lin, guardian_name, guardian_phone
on public.students
for each row execute function public.assign_permanent_learner_code();