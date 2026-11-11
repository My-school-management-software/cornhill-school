-- CORNHILL role/access contract checks.
--
-- Read-only structural assertions. Run only after the staged migration has been
-- applied to an isolated/staging database. This script creates no users, posts no
-- payments, changes no school data, and does not simulate authenticated browser
-- sessions. Those require separate end-to-end tests with dedicated test accounts.

do $tests$
declare
  v_post_oid oid := to_regprocedure('public.post_school_payment(uuid,bigint,text,text,text)');
  v_reverse_oid oid := to_regprocedure('public.reverse_school_payment(uuid,text)');
  v_post_def text;
  v_reverse_def text;
  v_post_security_definer boolean;
  v_reverse_security_definer boolean;
  v_role_constraint text;
  v_report_policy record;
begin
  if v_post_oid is null then
    raise exception 'Missing public.post_school_payment(uuid,bigint,text,text,text)';
  end if;

  if v_reverse_oid is null then
    raise exception 'Missing public.reverse_school_payment(uuid,text)';
  end if;

  select p.prosecdef, pg_get_functiondef(p.oid)
    into v_post_security_definer, v_post_def
  from pg_proc p
  where p.oid = v_post_oid;

  if not v_post_security_definer then
    raise exception 'Payment posting must use its narrowly scoped SECURITY DEFINER RPC';
  end if;

  if position('is_school_finance_operator' in lower(v_post_def)) = 0 then
    raise exception 'Payment posting RPC must explicitly require an active finance operator';
  end if;

  if position('set search_path' in lower(v_post_def)) = 0
     or position('search_path = ''''' in lower(v_post_def)) = 0 then
    raise exception 'Payment posting RPC must set an empty search_path';
  end if;

  if has_function_privilege('anon', v_post_oid, 'EXECUTE') then
    raise exception 'Anonymous callers must not execute payment posting';
  end if;

  if not has_function_privilege('authenticated', v_post_oid, 'EXECUTE') then
    raise exception 'Authenticated staff must be able to call the guarded payment posting RPC';
  end if;

  select p.prosecdef, pg_get_functiondef(p.oid)
    into v_reverse_security_definer, v_reverse_def
  from pg_proc p
  where p.oid = v_reverse_oid;

  if v_reverse_security_definer then
    raise exception 'Payment reversal must remain SECURITY INVOKER so Admin-only RLS is a second barrier';
  end if;

  if position('is_school_admin' in lower(v_reverse_def)) = 0 then
    raise exception 'Payment reversal must explicitly require the Director/Admin helper';
  end if;

  if position('is_school_finance_operator' in lower(v_reverse_def)) > 0 then
    raise exception 'Payment reversal must not grant authority merely because a user is a finance operator';
  end if;

  if has_function_privilege('anon', v_reverse_oid, 'EXECUTE') then
    raise exception 'Anonymous callers must not execute payment reversal';
  end if;

  if not has_function_privilege('authenticated', v_reverse_oid, 'EXECUTE') then
    raise exception 'Authenticated users must be able to call the guarded reversal RPC';
  end if;

  select pg_get_constraintdef(c.oid)
    into v_role_constraint
  from pg_constraint c
  where c.conrelid = 'public.user_profiles'::regclass
    and c.conname = 'user_profiles_role_check';

  if v_role_constraint is null
     or position('Admin' in v_role_constraint) = 0
     or position('Teacher' in v_role_constraint) = 0
     or position('Staff' in v_role_constraint) = 0 then
    raise exception 'The established Admin/Teacher/Staff profile-role constraint is missing or changed';
  end if;

  if to_regprocedure('public.is_school_headteacher()') is null
     or to_regprocedure('public.is_school_dos()') is null
     or to_regprocedure('public.is_school_academic_manager()') is null
     or to_regprocedure('public.is_school_academic_viewer()') is null
     or to_regprocedure('public.is_school_finance_operator()') is null then
    raise exception 'One or more leadership/academic/finance role helpers are missing';
  end if;

  if to_regprocedure('public.teacher_list_my_assignments()') is null
     or to_regprocedure('public.teacher_subject_learner_roster(uuid)') is null
     or to_regprocedure('public.can_teacher_view_subject(uuid,uuid)') is null
     or to_regprocedure('public.can_teacher_access_subject(uuid,uuid)') is null then
    raise exception 'One or more subject-scoped teacher assignment helpers are missing';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'school_payments' and c.relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on public.school_payments';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'report_card_publications' and c.relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on public.report_card_publications';
  end if;

  select p.qual, p.with_check
    into v_report_policy
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'report_card_publications'
    and p.policyname = 'Admins manage report publication'
    and p.cmd = 'ALL';

  if not found
     or position('is_school_admin' in lower(coalesce(v_report_policy.qual, ''))) = 0
     or position('is_school_admin' in lower(coalesce(v_report_policy.with_check, ''))) = 0 then
    raise exception 'Final report-card publication must remain Director/Admin-only until the staged approval workflow is implemented';
  end if;
end;
$tests$;
