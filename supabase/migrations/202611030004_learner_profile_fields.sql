alter table public.students
  add column if not exists middle_name text,
  add column if not exists admission_date date not null default (timezone('Africa/Kampala', now())::date),
  add column if not exists learner_type text not null default 'Day',
  add column if not exists previous_school text,
  add column if not exists guardian_relationship text,
  add column if not exists guardian_email text,
  add column if not exists alternate_guardian_name text,
  add column if not exists alternate_guardian_phone text;

alter table public.students drop constraint if exists students_learner_type_check;
alter table public.students add constraint students_learner_type_check check (learner_type in ('Day','Boarding'));
create index if not exists students_admission_date_idx on public.students (admission_date desc);
create index if not exists students_learner_type_idx on public.students (learner_type);