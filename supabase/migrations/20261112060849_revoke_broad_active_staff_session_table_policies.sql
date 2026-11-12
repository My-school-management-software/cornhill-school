-- Active employment is not, by itself, authorisation to manage
-- class-subject assignments or to create/alter staff clock events.
-- More specific administrator, DOS, teacher-read and self-read
-- policies remain in place.

DROP POLICY IF EXISTS "active_staff_session_required"
  ON public.class_subjects;

DROP POLICY IF EXISTS "active_staff_session_required"
  ON public.staff_attendance_events;
