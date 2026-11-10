-- Temporary Parent Portal sign-in: permanent pupil code + registered guardian phone.
-- Guardian PINs and the existing PIN-based RPCs are retained unchanged for reactivation.
-- This endpoint is service-role-only and enforces pair-specific attempt throttling.

CREATE TABLE IF NOT EXISTS private.parent_portal_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text NOT NULL,
  pupil_code_hash text NOT NULL,
  succeeded boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parent_portal_login_attempts_pair_time_idx
  ON private.parent_portal_login_attempts(phone_hash,pupil_code_hash,attempted_at DESC);

CREATE INDEX IF NOT EXISTS parent_portal_login_attempts_time_idx
  ON private.parent_portal_login_attempts(attempted_at);

REVOKE ALL ON TABLE private.parent_portal_login_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.parent_portal_get_learner_by_code_and_phone(
  p_pupil_code text,
  p_registered_phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_phone text := nullif(trim(p_registered_phone),'');
  v_code text := nullif(trim(p_pupil_code),'');
  v_student_id uuid;
  v_contact_count integer;
  v_result jsonb;
  v_phone_hash text;
  v_code_hash text;
  v_failed_attempts integer;
BEGIN
  IF v_phone IS NULL OR v_code IS NULL OR char_length(v_code)>32 THEN
    RETURN jsonb_build_object('error','Enter the learner pupil code and registered guardian phone number.');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_phone || ':' || upper(v_code),0)
  );
  v_phone_hash := pg_catalog.encode(extensions.digest(v_phone,'sha256'),'hex');
  v_code_hash := pg_catalog.encode(extensions.digest(upper(v_code),'sha256'),'hex');

  DELETE FROM private.parent_portal_login_attempts
  WHERE attempted_at < now() - interval '30 days';

  SELECT count(*) INTO v_failed_attempts
  FROM private.parent_portal_login_attempts
  WHERE phone_hash=v_phone_hash
    AND pupil_code_hash=v_code_hash
    AND succeeded=false
    AND attempted_at >= now() - interval '15 minutes';

  IF v_failed_attempts >= 5 THEN
    RETURN jsonb_build_object('error','Too many attempts. Try again after 15 minutes or contact the school office.');
  END IF;

  v_student_id := private.resolve_learner_id_by_code(v_code);
  IF v_student_id IS NULL THEN
    INSERT INTO private.parent_portal_login_attempts(phone_hash,pupil_code_hash,succeeded)
    VALUES(v_phone_hash,v_code_hash,false);
    RETURN jsonb_build_object('error','Guardian verification failed. Check the learner code and registered phone number.');
  END IF;

  SELECT count(*) INTO v_contact_count
  FROM public.students s
  JOIN public.parent_guardian_contacts c ON c.student_id=s.id
  WHERE s.id=v_student_id
    AND s.status<>'Archived'
    AND c.phone_e164=v_phone
    AND c.is_active=true;

  IF v_contact_count<>1 THEN
    INSERT INTO private.parent_portal_login_attempts(phone_hash,pupil_code_hash,succeeded)
    VALUES(v_phone_hash,v_code_hash,false);
    RETURN jsonb_build_object('error','Guardian verification failed. Check the learner code and registered phone number.');
  END IF;

  INSERT INTO private.parent_portal_login_attempts(phone_hash,pupil_code_hash,succeeded)
  VALUES(v_phone_hash,v_code_hash,true);

  select jsonb_build_object(
    'learner', (
      select jsonb_build_object(
        'pupil_code', s.admission_number,
        'first_name', s.first_name,
        'middle_name', s.middle_name,
        'last_name', s.last_name,
        'gender', s.gender,
        'date_of_birth', s.date_of_birth,
        'age_years', case when s.date_of_birth is null then null
          else extract(year from age(current_date, s.date_of_birth))::int end,
        'lin', s.lin,
        'class_name', sc.name,
        'stream', sc.stream,
        'learner_type', s.learner_type,
        'status', s.status,
        'admission_date', s.admission_date
      )
      from public.students s
      left join public.school_classes sc on sc.id = s.class_id
      where s.id = v_student_id
    ),
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assessment', a.title,
        'assessment_type', a.assessment_type,
        'assessment_date', a.assessment_date,
        'subject', sub.name,
        'term', t.name,
        'academic_year', ay.name,
        'score', sc.score,
        'maximum_score', a.max_score,
        'teacher_comment', sc.teacher_comment
      ) order by a.assessment_date nulls last, a.created_at)
      from public.assessment_scores sc
      join public.assessments a on a.id = sc.assessment_id
      join public.subjects sub on sub.id = a.subject_id
      join public.academic_terms t on t.id = a.term_id
      left join public.academic_years ay on ay.id = t.academic_year_id
      where sc.student_id = v_student_id
        and exists (
          select 1 from public.report_card_publications rp
          where rp.student_id = v_student_id
            and rp.term_id = a.term_id
            and rp.approved_at is not null
        )
    ), '[]'::jsonb),
    'published_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'term_id', t.id, 'term', t.name, 'academic_year', ay.name,
        'published_at', rp.approved_at
      ) order by rp.approved_at desc)
      from public.report_card_publications rp
      join public.academic_terms t on t.id = rp.term_id
      left join public.academic_years ay on ay.id = t.academic_year_id
      where rp.student_id = v_student_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'receipt_no', p.receipt_no, 'amount_ugx', p.amount_ugx,
        'payment_method', p.payment_method, 'collection_item', p.collection_item,
        'payer_name', p.payer_name, 'received_at', p.received_at,
        'term', t.name, 'academic_year', ay.name
      ) order by p.received_at desc)
      from public.school_payments p
      left join lateral (
        select lc.term_id
        from public.payment_allocations pa
        join public.learner_charges lc on lc.id = pa.charge_id
        where pa.payment_id = p.id
        order by pa.created_at limit 1
      ) alloc on true
      left join public.academic_terms t on t.id = alloc.term_id
      left join public.academic_years ay on ay.id = t.academic_year_id
      where p.student_id = v_student_id and p.status = 'Posted'
    ), '[]'::jsonb),
    'balances', jsonb_build_object(
      'total_charged_ugx', coalesce((
        select b.total_charged_ugx from public.learner_enrolment_period_balances b
        where b.student_id = v_student_id and b.status = 'Active'
        order by b.admission_date desc limit 1
      ), 0),
      'total_allocated_ugx', coalesce((
        select b.total_paid_ugx from public.learner_enrolment_period_balances b
        where b.student_id = v_student_id and b.status = 'Active'
        order by b.admission_date desc limit 1
      ), 0),
      'credit_ugx', coalesce((
        select b.credit_ugx from public.learner_enrolment_period_balances b
        where b.student_id = v_student_id and b.status = 'Active'
        order by b.admission_date desc limit 1
      ), 0),
      'outstanding_ugx', greatest(0, coalesce((
        select b.balance_ugx from public.learner_enrolment_period_balances b
        where b.student_id = v_student_id and b.status = 'Active'
        order by b.admission_date desc limit 1
      ), 0))
    ),
    'conduct_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'report_type', cr.report_type, 'title', cr.title, 'details', cr.details,
        'published_at', cr.published_at
      ) order by cr.published_at desc)
      from public.learner_conduct_reports cr
      where cr.student_id = v_student_id
        and cr.visible_to_guardian = true
        and cr.published_at is not null
        and cr.published_at <= now()
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.parent_portal_get_learner_by_code_and_phone(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parent_portal_get_learner_by_code_and_phone(text,text) TO service_role;
