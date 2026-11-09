-- Gender is a required learner identity field. Existing records were checked before applying NOT NULL.
alter table public.students alter column gender set not null;
