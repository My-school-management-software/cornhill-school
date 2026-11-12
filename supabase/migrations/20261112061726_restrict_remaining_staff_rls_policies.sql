-- Remove generic active-staff access rules that were OR-ing with
-- narrower owner, recipient, assigned-device and administrator policies.
-- Active employment alone must not grant access to other staff records.

DROP POLICY IF EXISTS "active_staff_session_required" ON public.class_teacher_access;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.evidence_capture_files;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.evidence_capture_requests;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_adjustments;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_alerts;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_deduction_settings;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_device_users;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_import_batches;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_incidents;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_attendance_schedule_assignments;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_call_signals;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_communication_comments;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_communication_posts;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_communication_reactions;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_direct_messages;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_media_messages;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_salary_advances;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_salary_agreements;
DROP POLICY IF EXISTS "active_staff_session_required" ON public.staff_work_schedules;

-- The Director/admin-only import batch workflow still needs to finalise
-- counts and notes after event rows have been inserted.
DROP POLICY IF EXISTS "Admins update attendance import batches"
  ON public.staff_attendance_import_batches;

CREATE POLICY "Admins update attendance import batches"
  ON public.staff_attendance_import_batches
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin())
  WITH CHECK (public.is_school_admin());
