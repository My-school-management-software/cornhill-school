-- CORNHILL Batch 23: permission-gated recovery of an idempotent payment and its immutable receipt snapshot.
-- Only the opaque request key and learner reference need to persist in the browser.
BEGIN;

CREATE FUNCTION cornhill_school.finance_get_payment_by_key(
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
    RAISE EXCEPTION 'An authorised staff account and payment request key are required'
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
      AND rp.permission_code = 'finance.payments_record'
  ) THEN
    RAISE EXCEPTION 'Staff account lacks permission to view payment request status'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'paymentId', p.id,
    'receiptNumber', r.receipt_number,
    'status', p.status,
    'allocatedAmountUgx', p.amount_ugx - p.unallocated_amount_ugx,
    'unallocatedAmountUgx', p.unallocated_amount_ugx,
    'receipt', r.receipt_data_snapshot
  )
  INTO v_result
  FROM cornhill_school.payment_records p
  JOIN cornhill_school.payment_receipts r ON r.payment_id = p.id
  WHERE p.idempotency_key = p_idempotency_key
    AND p.received_by_staff_id = p_actor_staff_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.finance_get_payment_by_key(uuid, uuid)
  FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_get_payment_by_key(uuid, uuid)
  TO cornhill_finance_runtime;

COMMIT;
