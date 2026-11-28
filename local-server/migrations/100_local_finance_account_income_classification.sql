-- V50: expose Income A/B classification to the existing bursar account.
-- This is a read-only projection; historical charges and totals are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_get_learner_account(
  p_actor_staff_id uuid,p_learner_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE account_snapshot jsonb;
BEGIN
  IF p_learner_id IS NULL THEN
    RAISE EXCEPTION 'A learner ID is required' USING ERRCODE='22023';
  END IF;
  IF NOT cornhill_school.finance_staff_can_read(p_actor_staff_id) THEN
    RAISE EXCEPTION 'Staff account lacks permission to access learner finance records'
      USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'learner', jsonb_build_object(
      'id',l.id,'pupil_code',l.pupil_code,'lin',l.lin,
      'learner_name',concat_ws(' ',l.first_name,l.middle_name,l.last_name),
      'class_name',c.display_name,'is_bursary',l.is_bursary,
      'bursary_fee_ugx',l.bursary_fee_ugx
    ),
    'totals',jsonb_build_object(
      'charged_ugx',COALESCE(f.charged_ugx,0),
      'paid_ugx',COALESCE(f.paid_ugx,0),
      'balance_ugx',COALESCE(f.balance_ugx,0)
    ),
    'fee_obligations',COALESCE(f.items,'[]'::jsonb)
  ) INTO account_snapshot
  FROM cornhill_school.learners l
  LEFT JOIN cornhill_school.classes c ON c.id=l.class_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(v.amount_ugx)::bigint AS charged_ugx,
      SUM(v.paid_ugx)::bigint AS paid_ugx,
      SUM(v.balance_ugx)::bigint AS balance_ugx,
      jsonb_agg(jsonb_build_object(
        'fee_obligation_id',v.fee_obligation_id,
        'academic_year',v.academic_year,
        'term_number',v.term_number,'term_name',v.term_name,
        'term_status',t.status,
        'fee_item_code',v.fee_item_code,'fee_item_name',v.fee_item_name,
        'income_group',fc.income_group,
        'amount_ugx',v.amount_ugx,'paid_ugx',v.paid_ugx,
        'balance_ugx',v.balance_ugx,
        'obligation_status',v.obligation_status,'is_overdue',v.is_overdue
      ) ORDER BY ay.starts_on,v.term_number,v.fee_item_name) AS items
    FROM cornhill_school.fee_obligation_balances v
    JOIN cornhill_school.academic_terms t ON t.id=v.academic_term_id
    JOIN cornhill_school.academic_years ay ON ay.id=t.academic_year_id
    JOIN cornhill_school.fee_catalogue fc ON fc.item_code=v.fee_item_code
    WHERE v.learner_id=l.id
  ) f ON true
  WHERE l.id=p_learner_id AND l.status='Active';
  RETURN account_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.finance_get_learner_account(uuid,uuid)
  FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_get_learner_account(uuid,uuid)
  TO cornhill_finance_runtime;
COMMIT;
