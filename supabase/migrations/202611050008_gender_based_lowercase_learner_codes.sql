-- Require gender before generating a permanent learner code.
-- New codes are eight lowercase characters: m0000001 / f0000002.
create or replace function public.assign_permanent_learner_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_sequence bigint;
  v_gender_prefix text;
begin
  if new.gender not in ('Male','Female') then
    raise exception 'Learner gender must be selected before a permanent learner code can be generated.';
  end if;
  v_gender_prefix := case new.gender when 'Male' then 'm' when 'Female' then 'f' end;
  v_sequence := pg_catalog.nextval('public.student_admission_sequence'::regclass);
  new.admission_year := extract(year from pg_catalog.timezone('Africa/Kampala', now()))::integer;
  new.admission_number := v_gender_prefix || pg_catalog.lpad(v_sequence::text, 7, '0');
  return new;
end;
$function$;
