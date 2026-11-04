# Learner privacy migration — review and test plan

**Migration:** `supabase/migrations/202611040014_student_data_column_privileges.sql`

**Status:** Prepared on `feature/cornhill-v3-foundation`; not applied to the connected Supabase project.

## Before applying

1. Back up the database and use a staging project first.
2. Confirm the paired frontend commit calls `admin_list_students` for the administrator register and `admin_list_active_finance_students` for the finance learner picker.
3. Confirm the deployed frontend and migration are released together. Applying only the grants migration will break administrator learner and finance screens until the frontend RPC changes are deployed.
4. Use separate administrator and teacher test accounts. Do not share passwords in chat.

## Read-only SQL verification after applying

Run in the Supabase SQL editor:

```sql
select
  has_table_privilege('anon', 'public.students', 'SELECT') as anon_table_select,
  has_table_privilege('authenticated', 'public.students', 'SELECT') as authenticated_table_select,
  has_column_privilege('authenticated', 'public.students', 'admission_number', 'SELECT') as auth_can_read_admission_code,
  has_column_privilege('authenticated', 'public.students', 'guardian_phone', 'SELECT') as auth_can_read_guardian_phone,
  has_column_privilege('authenticated', 'public.students', 'bursary_fee_ugx', 'SELECT') as auth_can_read_bursary_fee,
  has_column_privilege('authenticated', 'public.students', 'first_name', 'INSERT') as auth_can_insert_first_name,
  has_column_privilege('authenticated', 'public.students', 'guardian_phone', 'UPDATE') as auth_can_update_guardian_phone;
```

Expected: `anon_table_select=false`, `authenticated_table_select=false`, safe admission-code SELECT true, guardian/bursary SELECT false, permitted INSERT/UPDATE column grants true. RLS must still restrict writes to administrators.

Check RPC execution:

```sql
select
  has_function_privilege('anon', 'public.admin_list_students()', 'EXECUTE') as anon_can_call_admin_list,
  has_function_privilege('authenticated', 'public.admin_list_students()', 'EXECUTE') as signed_in_can_call_admin_list;
```

Expected: anon false; authenticated true. The function itself must reject a signed-in non-administrator with SQLSTATE `42501`.

## Application tests

- Anonymous session: cannot read, insert, update or delete learner records.
- Teacher: can read only assigned-class roster fields; direct requests for guardian phone/email, address, alternate guardian details, SMS consent and bursary fields fail with a permission error.
- Teacher: calling either administrator RPC fails with `42501`.
- Administrator: learner list loads with guardian/bursary details and class names.
- Administrator: create a regular learner; permanent admission code is generated; LIN and P7 index duplicate checks work.
- Administrator: create a bursary learner; the bursary charge is created exactly once; edit learner details without changing the permanent admission code.
- Administrator: finance learner picker loads active learners and bursary fee amounts; payment allocation, receipt, account balance and SMS outbox continue to work.
- Teacher: assigned marks, report preview, class roster and communication still work.
- Confirm browser network requests do not contain service-role credentials.

## Release gate

Do not use real learner data until the staging tests pass and a separately approved production maintenance window is scheduled. This test plan does not authorize applying the migration.
