-- Protect learner records at the database privilege boundary.
-- RLS controls which rows a role may access; column grants additionally prevent
-- teachers from reading guardian, address, and bursary details directly.
-- Apply only after reviewing the paired frontend RPC changes and testing accounts.

revoke all privileges on table public.students from public, anon, authenticated;
revoke all privileges (id, admission_number, first_name, last_name, gender,
  date_of_birth, class_id, guardian_name, guardian_phone, address, status,
  created_at, admission_year, middle_name, admission_date, learner_type,
  previous_school, guardian_relationship, guardian_email, alternate_guardian_name,
  alternate_guardian_phone, is_bursary, bursary_fee_ugx, bursary_notes,
  guardian_sms_opt_in, lin, p7_index_number)
on table public.students from public, anon, authenticated;

-- Staff and teachers may read only the non-confidential roster fields.
grant select (
  id, admission_number, first_name, middle_name, last_name, gender,
  date_of_birth, class_id, status, created_at, admission_year,
  admission_date, learner_type, previous_school, lin, p7_index_number
) on table public.students to authenticated;

-- Only signed-in users passing the existing RLS admin write policies can
-- create/update the editable admission fields. Permanent code and system
-- generated identity/timestamp columns are deliberately not writable.
grant insert (
  first_name, middle_name, last_name, gender, date_of_birth, class_id,
  guardian_name, guardian_phone, address, status, admission_date,
  learner_type, previous_school, guardian_relationship, guardian_email,
  alternate_guardian_name, alternate_guardian_phone, is_bursary,
  bursary_fee_ugx, bursary_notes, guardian_sms_opt_in, lin, p7_index_number
) on table public.students to authenticated;

grant update (
  first_name, middle_name, last_name, gender, date_of_birth, class_id,
  guardian_name, guardian_phone, address, status, admission_date,
  learner_type, previous_school, guardian_relationship, guardian_email,
  alternate_guardian_name, alternate_guardian_phone, is_bursary,
  bursary_fee_ugx, bursary_notes, guardian_sms_opt_in, lin, p7_index_number
) on table public.students to authenticated;

-- Administrators receive full learner records only through this guarded RPC.
-- Teachers cannot call it successfully even if they discover its name.
create or replace function public.admin_list_students()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_school_admin() then
    raise exception 'Only school administrators may view confidential learner records'
      using errcode = '42501';
  end if;

  return query
    select to_jsonb(s) || jsonb_build_object(
      'school_classes',
      case when c.id is null then null else jsonb_build_object('name', c.name) end
    )
    from public.students as s
    left join public.school_classes as c on c.id = s.class_id
    order by s.created_at desc;
end;
$$;

revoke all on function public.admin_list_students() from public, anon;
grant execute on function public.admin_list_students() to authenticated;

-- Finance needs a smaller administrator-only learner picker; do not expose
-- bursary status or fee amounts to teachers through the students table.
create or replace function public.admin_list_active_finance_students()
returns table (
  id uuid,
  admission_number text,
  first_name text,
  middle_name text,
  last_name text,
  is_bursary boolean,
  bursary_fee_ugx bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_school_admin() then
    raise exception 'Only school administrators may access finance learner records'
      using errcode = '42501';
  end if;

  return query
    select s.id, s.admission_number, s.first_name, s.middle_name,
           s.last_name, s.is_bursary, s.bursary_fee_ugx
    from public.students as s
    where s.status = 'Active'
    order by s.first_name, s.last_name
    limit 2000;
end;
$$;

revoke all on function public.admin_list_active_finance_students() from public, anon;
grant execute on function public.admin_list_active_finance_students() to authenticated;

comment on function public.admin_list_students() is
  'Administrator-only full learner list. Guardian, address and bursary fields are not directly selectable by authenticated staff.';
comment on function public.admin_list_active_finance_students() is
  'Administrator-only active learner picker for finance, including bursary fee status.';
