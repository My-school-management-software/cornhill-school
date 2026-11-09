revoke select on table public.students from authenticated;
grant select (
 id, admission_number, lin, p7_index_number, first_name, middle_name, last_name,
 gender, birth_year, date_of_birth, admission_date, class_id, learner_type,
 status, previous_school, created_at, admission_complete
) on table public.students to authenticated;
comment on table public.students is 'Learner records. Authenticated direct SELECT is limited by column grants to class-register fields; row-level policies restrict teachers to assigned classes. Administrators use guarded admin RPCs for confidential profile fields.';
