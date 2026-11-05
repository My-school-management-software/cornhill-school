create or replace function public.assign_permanent_learner_code()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_sequence bigint;
  v_birth_year text;
  v_gender_letter text;
  v_random_letters text;
begin
  if new.gender not in ('Male','Female') then
    raise exception 'Learner gender must be selected before a permanent learner code can be generated.';
  end if;
  if new.date_of_birth is null then
    raise exception 'Learner date of birth is required before a permanent learner code can be generated.';
  end if;

  v_birth_year := pg_catalog.to_char(new.date_of_birth, 'YY');
  v_gender_letter := case new.gender when 'Male' then 'M' when 'Female' then 'F' end;
  v_sequence := pg_catalog.nextval('public.student_admission_sequence'::regclass);
  if v_sequence > 9999 then
    raise exception 'The four-digit admission sequence is full. Please contact the system administrator.';
  end if;

  v_random_letters :=
    pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (pg_catalog.floor(pg_catalog.random()*26)::integer)+1, 1) ||
    pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (pg_catalog.floor(pg_catalog.random()*26)::integer)+1, 1);

  new.admission_year := extract(year from pg_catalog.timezone('Africa/Kampala', now()))::integer;
  new.admission_number := 'CH' || v_birth_year || v_gender_letter ||
    pg_catalog.lpad(v_sequence::text, 4, '0') || v_random_letters;
  return new;
end;
$function$;