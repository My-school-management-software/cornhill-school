CREATE OR REPLACE FUNCTION public.admin_delete_learner_permanently(
  p_student_id uuid,
  p_confirmation_code text,
  p_reason text,
  p_storage_cleanup_confirmed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_student public.students%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_payment_count integer := 0;
  v_payment_total bigint := 0;
  v_charge_count integer := 0;
  v_charge_total bigint := 0;
  v_payment_dates date[] := ARRAY[]::date[];
  v_collection_date date;
  v_bursary_file_count integer := 0;
  v_photo_file_count integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT coalesce(public.is_school_admin(), false) THEN
    RAISE EXCEPTION 'Only an active school administrator may permanently delete a learner'
      USING errcode = '42501';
  END IF;

  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Select a learner record first' USING errcode = '22023';
  END IF;

  IF v_reason IS NULL OR length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Enter a deletion reason between 5 and 500 characters' USING errcode = '22023';
  END IF;

  SELECT *
    INTO v_student
    FROM public.students
   WHERE id = p_student_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Learner record not found' USING errcode = 'P0002';
  END IF;

  IF nullif(btrim(p_confirmation_code), '') IS NULL
     OR btrim(p_confirmation_code) <> v_student.admission_number THEN
    RAISE EXCEPTION 'The confirmation code does not exactly match this learner record'
      USING errcode = '22023';
  END IF;

  SELECT count(*)::integer, coalesce(sum(amount_ugx), 0)::bigint
    INTO v_payment_count, v_payment_total
    FROM public.school_payments
   WHERE student_id = p_student_id;

  SELECT count(*)::integer, coalesce(sum(amount_ugx), 0)::bigint
    INTO v_charge_count, v_charge_total
    FROM public.learner_charges
   WHERE student_id = p_student_id;

  SELECT coalesce(array_agg(DISTINCT timezone('Africa/Kampala', received_at)::date), ARRAY[]::date[])
    INTO v_payment_dates
    FROM public.school_payments
   WHERE student_id = p_student_id;

  v_photo_file_count := CASE WHEN nullif(btrim(v_student.photo_path), '') IS NULL THEN 0 ELSE 1 END;

  SELECT count(*)::integer
    INTO v_bursary_file_count
    FROM public.learner_bursary_awards
   WHERE student_id = p_student_id
     AND nullif(btrim(support_document_path), '') IS NOT NULL;

  IF (v_photo_file_count > 0 OR v_bursary_file_count > 0)
     AND coalesce(p_storage_cleanup_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'This learner has attached files. Remove the learner photo and bursary evidence from their private storage buckets before permanent deletion.'
      USING errcode = '22023';
  END IF;

  -- Remove parent communications, access sessions and contact-change history.
  DELETE FROM public.school_sms_outbox
   WHERE student_id = p_student_id
      OR payment_id IN (SELECT id FROM public.school_payments WHERE student_id = p_student_id);

  DELETE FROM public.communication_outbox
   WHERE learner_id = p_student_id;

  DELETE FROM public.parent_contact_change_log
   WHERE student_id = p_student_id;

  DELETE FROM public.parent_school_messages
   WHERE student_id = p_student_id
      OR guardian_contact_id IN (
        SELECT id FROM public.parent_guardian_contacts WHERE student_id = p_student_id
      );

  DELETE FROM public.parent_report_access_audit
   WHERE student_id = p_student_id
      OR guardian_contact_id IN (
        SELECT id FROM public.parent_guardian_contacts WHERE student_id = p_student_id
      );

  DELETE FROM public.parent_portal_sessions
   WHERE student_id = p_student_id;

  DELETE FROM public.guardian_pin_audit
   WHERE contact_id IN (
     SELECT id FROM public.parent_guardian_contacts WHERE student_id = p_student_id
   );

  -- Remove financial allocations before their payment and charge parents.
  DELETE FROM public.payment_allocations
   WHERE payment_id IN (SELECT id FROM public.school_payments WHERE student_id = p_student_id)
      OR charge_id IN (SELECT id FROM public.learner_charges WHERE student_id = p_student_id);

  DELETE FROM public.school_payments
   WHERE student_id = p_student_id;

  DELETE FROM public.learner_bursary_awards
   WHERE student_id = p_student_id;

  DELETE FROM public.learner_charges
   WHERE student_id = p_student_id;

  -- Rebuild the affected daily collection summaries so other learners' receipts remain.
  FOREACH v_collection_date IN ARRAY v_payment_dates LOOP
    DELETE FROM public.daily_collection_records
     WHERE collection_date = v_collection_date;

    IF EXISTS (
      SELECT 1
        FROM public.school_payments
       WHERE timezone('Africa/Kampala', received_at)::date = v_collection_date
    ) THEN
      PERFORM public.refresh_daily_collection_record(v_collection_date);
    END IF;
  END LOOP;

  -- Remove alerts and all learner-specific operational records.
  DELETE FROM public.school_notification_user_state
   WHERE notification_id IN (
     SELECT id FROM public.school_notifications WHERE student_id = p_student_id
   );

  DELETE FROM public.school_bursary_review_audit
   WHERE student_id = p_student_id;

  DELETE FROM public.school_notifications
   WHERE student_id = p_student_id;

  DELETE FROM public.school_admission_enquiries
   WHERE student_id = p_student_id;

  DELETE FROM public.report_card_publications
   WHERE student_id = p_student_id;

  DELETE FROM public.assessment_scores
   WHERE student_id = p_student_id;

  DELETE FROM public.learner_conduct_reports
   WHERE student_id = p_student_id;

  DELETE FROM public.school_library_loans
   WHERE student_id = p_student_id;

  DELETE FROM public.school_transport_assignments
   WHERE student_id = p_student_id;

  DELETE FROM public.school_welfare_cases
   WHERE student_id = p_student_id;

  -- Remove history and identifiers that deliberately use restrictive foreign keys.
  DELETE FROM public.learner_archive_audit
   WHERE student_id = p_student_id;

  DELETE FROM public.learner_code_change_audit
   WHERE student_id = p_student_id;

  DELETE FROM public.learner_code_aliases
   WHERE student_id = p_student_id;

  DELETE FROM public.student_class_history
   WHERE student_id = p_student_id;

  DELETE FROM public.student_status_history
   WHERE student_id = p_student_id;

  DELETE FROM public.learner_enrolment_periods
   WHERE student_id = p_student_id;

  DELETE FROM public.parent_guardian_contacts
   WHERE student_id = p_student_id;

  DELETE FROM public.students
   WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permanent deletion did not remove the selected learner record';
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'student_id', p_student_id,
    'admission_number', v_student.admission_number,
    'learner_name', trim(concat_ws(' ', v_student.first_name, v_student.middle_name, v_student.last_name)),
    'payments_deleted', v_payment_count,
    'payment_amount_ugx_deleted', v_payment_total,
    'charges_deleted', v_charge_count,
    'charge_amount_ugx_deleted', v_charge_total,
    'learner_photo_file_count', v_photo_file_count,
    'bursary_evidence_file_count', v_bursary_file_count,
    'reason', v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_learner_permanently(uuid, text, text, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_learner_permanently(uuid, text, text, boolean) TO authenticated;
