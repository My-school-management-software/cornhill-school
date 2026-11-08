-- Remove the remaining writable-schema search paths from SECURITY DEFINER routines.
alter function public.admin_close_academic_term(uuid) set search_path = '';
alter function public.admin_close_expired_academic_terms() set search_path = '';
alter function public.apply_existing_learner_credit_to_new_charge() set search_path = '';
alter function public.post_school_payment_complete(uuid,bigint,text,text,text,jsonb,text,text) set search_path = '';
alter function public.queue_parent_payment_sms() set search_path = '';

-- The assignment index has the higher observed usage; keep it and remove its exact duplicate.
drop index if exists public.class_subjects_teacher_active_idx;
