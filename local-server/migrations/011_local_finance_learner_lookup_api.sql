-- CORNHILL local finance read API.
-- Exposes only minimal learner/account data through audited-permission SECURITY DEFINER routines.
-- Finance API receives no direct SELECT privilege on school tables.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_staff_can_read(
  p_actor_staff_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code = ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id = sa.id
    WHERE sa.id = p_actor_staff_id
      AND sa.account_status = 'active'
      AND sp.employment_status = 'Active'
      AND rp.permission_code = 'finance.payments_record'
  );
$function$;

CREATE OR REPLACE FUNCTION cornhill_school.finance_search_learners(
  p_actor_staff_id uuid,
  p_search text
)
RETURNS TABLE (
  learner_id uuid,
  pupil_code text,
  learner_name text,
  class_name text,
  is_bursary boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  search_value text;
BEGIN
  search_value := btrim(COALESCE(p_search, ''));
  IF length(search_value) NOT BETWEEN 2 AND 80
     OR position('%' IN search_value) > 0
     OR position('_' IN search_value) > 0 THEN
    RAISE EXCEPTION 'Search must contain 2 to 80 ordinary characters'
      USING ERRCODE = '22023';
  END IF;
  IF NOT cornhill_school.finance_staff_can_read(p_actor_staff_id) THEN
    RAISE EXCEPTION 'Staff account lacks permission to access finance learner records'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.pupil_code,
    concat_ws(' ', l.first_name, l.middle_name, l.last_name),
    c.display_name,
    l.is_bursary
  FROM cornhill_school.learners l
  LEFT JOIN cornhill_school.classes c ON c.id = l.class_id
  WHERE l.status = 'Active'
    AND (
      upper(l.pupil_code) LIKE upper(search_value) || '%'
      OR concat_ws(' ', l.first_name, l.middle_name, l.last_name) ILIKE '%' || search_value || '%'
    )
  ORDER BY
    CASE WHEN upper(l.pupil_code) LIKE upper(search_value) || '%' THEN 0 ELSE 1 END,
    l.pupil_code
  LIMIT 25;
END;
$function$;

CREATE OR REPLACE FUNCTION cornhill_school.finance_get_learner_account(
  p_actor_staff_id uuid,
  p_learner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  account_snapshot jsonb;
BEGIN
  IF p_learner_id IS NULL THEN
    RAISE EXCEPTION 'A learner ID is required' USING ERRCODE = '22023';
  END IF;
  IF NOT cornhill_school.finance_staff_can_read(p_actor_staff_id) THEN
    RAISE EXCEPTION 'Staff account lacks permission to access finance learner records'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'learner', jsonb_build_object(
      'id', l.id,
      'pupil_code', l.pupil_code,
      'lin', l.lin,
      'learner_name', concat_ws(' ', l.first_name, l.middle_name, l.last_name),
      'class_name', c.display_name,
      'is_bursary', l.is_bursary,
      'bursary_fee_ugx', l.bursary_fee_ugx
    ),
    'totals', jsonb_build_object(
      'charged_ugx', COALESCE(f.charged_ugx, 0),
      'paid_ugx', COALESCE(f.paid_ugx, 0),
      'balance_ugx', COALESCE(f.balance_ugx, 0)
    ),
    'fee_obligations', COALESCE(f.items, '[]'::jsonb)
  )
  INTO account_snapshot
  FROM cornhill_school.learners l
  LEFT JOIN cornhill_school.classes c ON c.id = l.class_id
  LEFT JOIN LATERAL (
    SELECT
      sum(v.amount_ugx)::bigint AS charged_ugx,
      sum(v.paid_ugx)::bigint AS paid_ugx,
      sum(v.balance_ugx)::bigint AS balance_ugx,
      jsonb_agg(jsonb_build_object(
        'fee_obligation_id', v.fee_obligation_id,
        'academic_year', v.academic_year,
        'term_number', v.term_number,
        'term_name', v.term_name,
        'term_status', t.status,
        'fee_item_code', v.fee_item_code,
        'fee_item_name', v.fee_item_name,
        'amount_ugx', v.amount_ugx,
        'paid_ugx', v.paid_ugx,
        'balance_ugx', v.balance_ugx,
        'obligation_status', v.obligation_status,
        'is_overdue', v.is_overdue
      ) ORDER BY ay.starts_on, v.term_number, v.fee_item_name) AS items
    FROM cornhill_school.fee_obligation_balances v
    JOIN cornhill_school.academic_terms t ON t.id = v.academic_term_id
    JOIN cornhill_school.academic_years ay ON ay.id = t.academic_year_id
    WHERE v.learner_id = l.id
  ) f ON true
  WHERE l.id = p_learner_id AND l.status = 'Active';

  RETURN account_snapshot;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.finance_staff_can_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.finance_search_learners(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.finance_get_learner_account(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION cornhill_school.finance_staff_can_read(uuid)
  FROM cornhill_auth_runtime, cornhill_auth_api, cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.finance_search_learners(uuid, text)
  FROM cornhill_auth_runtime, cornhill_auth_api;
REVOKE ALL ON FUNCTION cornhill_school.finance_get_learner_account(uuid, uuid)
  FROM cornhill_auth_runtime, cornhill_auth_api;

GRANT EXECUTE ON FUNCTION cornhill_school.finance_search_learners(uuid, text)
  TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_get_learner_account(uuid, uuid)
  TO cornhill_finance_runtime;

COMMIT;
