-- Restrict guardian-visible assessment results to approved/published terms.
-- Calculate parent portal balances from the active enrolment period only;
-- retain earlier enrolment financial history in the administration records.
CREATE OR REPLACE FUNCTION public.parent_portal_get_learner(p_pupil_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_student_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in with the registered guardian phone first';
  end if;
  v_phone := nullif(auth.jwt() ->> 'phone', '');
  if v_phone is null or not exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.phone = v_phone
      and u.phone_confirmed_at is not null
  ) then
    raise exception 'A verified guardian phone is required';
  end if;

  select s.id into v_student_id
  from public.students s
  where upper(s.admission_number) = upper(trim(p_pupil_code))
    and exists (
      select 1 from public.parent_guardian_contacts c
      where c.student_id = s.id and c.phone_e164 = v_phone and c.is_active = true
    )
  limit 1;

  if v_student_id is null then
    raise exception 'No learner is linked to this verified guardian number and code';
  end if;

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
end;
$function$

