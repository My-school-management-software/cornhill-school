-- CORNHILL: permanent school identity, independent of Ministry LIN and personal corrections.
create or replace function public.assign_permanent_learner_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_sequence bigint;
  v_birth_year integer;
  v_admission_year integer;
  v_random_letters text;
  v_needs_code boolean := false;
begin
  v_birth_year := coalesce(new.birth_year, extract(year from new.date_of_birth)::integer);
  v_admission_year := coalesce(
    new.admission_year,
    extract(year from pg_catalog.timezone('Africa/Kampala',now()))::integer
  );

  if new.date_of_birth is not null and new.birth_year is not null
     and new.birth_year <> extract(year from new.date_of_birth)::integer then
    raise exception 'Year of birth and date of birth must have the same year. Correct both fields before saving.';
  end if;

  if tg_op = 'UPDATE' then
    if old.admission_number not like 'TMP%' then
      if new.gender is not null and new.gender not in ('Male','Female') then
        raise exception 'Gender must be Male or Female when supplied.';
      end if;
      if v_birth_year is not null and (
        v_birth_year < 1900 or
        v_birth_year > extract(year from pg_catalog.now())::integer
      ) then
        raise exception 'Enter a valid year of birth before saving this learner record.';
      end if;
      if v_birth_year is not null then new.birth_year := v_birth_year; end if;
      new.admission_number := old.admission_number;
      new.admission_year := old.admission_year;
      new.admission_complete := (
        new.gender in ('Male','Female')
        and new.date_of_birth is not null
        and nullif(pg_catalog.btrim(new.lin),'') is not null
        and nullif(pg_catalog.btrim(new.guardian_name),'') is not null
        and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null
      );
      return new;
    end if;
    v_needs_code := true;
  else
    v_needs_code := true;
  end if;

  if v_needs_code then
    v_sequence := pg_catalog.nextval('public.student_admission_sequence'::regclass);
    if v_sequence > 9999 then
      raise exception 'The four-digit admission sequence is full. Please contact the system administrator.';
    end if;
    v_random_letters :=
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1) ||
      pg_catalog.substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ',(pg_catalog.floor(pg_catalog.random()*26)::integer)+1,1);
    new.admission_year := v_admission_year;
    new.admission_number := 'CH' ||
      pg_catalog.right(v_admission_year::text,2) ||
      'X' ||
      pg_catalog.lpad(v_sequence::text,4,'0') ||
      v_random_letters;
  end if;

  new.admission_complete := (
    new.gender in ('Male','Female')
    and new.date_of_birth is not null
    and nullif(pg_catalog.btrim(new.lin),'') is not null
    and nullif(pg_catalog.btrim(new.guardian_name),'') is not null
    and nullif(pg_catalog.btrim(new.guardian_phone),'') is not null
  );
  return new;
end;
$function$;

drop trigger if exists students_assign_permanent_code on public.students;
create trigger students_assign_permanent_code
before insert or update on public.students
for each row execute function public.assign_permanent_learner_code();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.students'::regclass
      and conname='students_admission_complete_requires_lin'
  ) then
    alter table public.students
      add constraint students_admission_complete_requires_lin
      check (not admission_complete or nullif(btrim(lin),'') is not null) not valid;
  end if;
end
$$;

create or replace function public.admin_learner_identity_quality_summary()
returns table (
  class_name text,
  total_learners bigint,
  missing_lin bigint,
  temporary_pupil_codes bigint,
  incomplete_admissions bigint
)
language plpgsql stable security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only school administrators may view admission-quality totals' using errcode = '42501';
  end if;
  return query
  select coalesce(c.name,'Unassigned')::text,
         count(*)::bigint,
         count(*) filter (where nullif(btrim(s.lin),'') is null)::bigint,
         count(*) filter (where s.admission_number like 'TMP%')::bigint,
         count(*) filter (where not s.admission_complete)::bigint
  from public.students s
  left join public.school_classes c on c.id=s.class_id
  where s.status <> 'Archived'
  group by c.name
  order by case when c.name is null then 1 else 0 end, c.name;
end;
$function$;

revoke all on function public.admin_learner_identity_quality_summary() from public, anon;
grant execute on function public.admin_learner_identity_quality_summary() to authenticated;

create index if not exists students_class_status_created_idx
  on public.students(class_id,status,created_at desc);
create index if not exists learner_charges_student_term_created_idx
  on public.learner_charges(student_id,term_id,created_at desc);
