-- The function is invoked by the class_subjects trigger only.
-- Remove direct RPC execution for public-facing roles while retaining the trigger.
REVOKE EXECUTE ON FUNCTION public.track_class_subject_teacher_history() FROM PUBLIC, anon, authenticated;
