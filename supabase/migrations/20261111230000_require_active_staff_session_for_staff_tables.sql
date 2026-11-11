-- Require a currently active school profile for staff-domain and staff-linked workflow table requests.
-- This is a restrictive policy: it never grants access by itself and is ANDed
-- with the existing table-specific permissive role/ownership policies.
-- It closes stale-JWT access paths where an older policy checked only auth.uid().
do $$
declare
  v_table text;
  v_tables text[] := array[
    'staff_attendance_adjustments',
    'staff_attendance_alerts',
    'staff_attendance_deduction_settings',
    'staff_attendance_device_users',
    'staff_attendance_events',
    'staff_attendance_import_batches',
    'staff_attendance_incidents',
    'staff_attendance_schedule_assignments',
    'staff_call_signals',
    'staff_communication_comments',
    'staff_communication_posts',
    'staff_communication_reactions',
    'staff_direct_messages',
    'staff_media_messages',
    'staff_salary_advances',
    'staff_salary_agreements',
    'staff_work_schedules',
    -- Staff-to-class and evidence workflows had direct auth.uid() ownership
    -- policies that did not independently re-check current employment status.
    'class_teacher_access',
    'class_subjects',
    'evidence_capture_files',
    'evidence_capture_requests'
  ];
begin
  foreach v_table in array v_tables loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind = 'r'
        and c.relrowsecurity
    ) and not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname = 'active_staff_session_required'
    ) then
      execute format(
        'create policy active_staff_session_required on public.%I as restrictive for all to authenticated using (public.is_active_staff_session()) with check (public.is_active_staff_session())',
        v_table
      );
    end if;
  end loop;
end
$$;

comment on function public.is_active_staff_session() is
  'Returns true only for an authenticated user with an active user_profiles row. Used as a restrictive RLS guard on staff-domain and staff-linked workflow tables so stale JWTs cannot bypass current employment status.';
