-- CORNHILL Batch 22: secure recovery of a retained-credit allocation by its idempotency key.
-- The browser may retain only the opaque key across tabs; no payment details are persisted.
BEGIN;

CREATE FUNCTION cornhill_school.finance_get_credit_allocation_by_key(
  p_actor_staff_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_actor_staff_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'An authorised staff account and credit request key are required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code = ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id = sa.id
    WHERE sa.id = p_actor_staff_id
      AND sa.account_status = 'active'
      AND sp.employment_status = 'Active'
      AND rp.permission_code = 'finance.credit_allocate'
  ) THEN
    RAISE EXCEPTION 'Staff account lacks permission to view retained-credit allocation status'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'batch_id', b.id,
    'source_payment_id', b.source_payment_id,
    'learner_id', b.learner_id,
    'total_allocated_ugx', b.total_allocated_ugx,
    'remaining_credit_ugx', b.remaining_credit_after_ugx,
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fee_obligation_id', a.fee_obligation_id,
        'amount_ugx', a.amount_ugx
      ) ORDER BY a.fee_obligation_id)
      FROM cornhill_school.payment_credit_allocations a
      WHERE a.batch_id = b.id
    ), '[]'::jsonb),
    'replayed', true
  )
  INTO v_result
  FROM cornhill_school.payment_credit_allocation_batches b
  WHERE b.idempotency_key = p_idempotency_key
    AND b.actor_staff_id = p_actor_staff_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.finance_get_credit_allocation_by_key(uuid, uuid)
  FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_get_credit_allocation_by_key(uuid, uuid)
  TO cornhill_finance_runtime;

COMMIT;
