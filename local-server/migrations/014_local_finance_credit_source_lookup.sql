-- CORNHILL Batch 20: permission-gated listing of available retained learner credit.
-- This read-only routine exposes only posted receipts with remaining unallocated credit.
BEGIN;

CREATE FUNCTION cornhill_school.finance_list_learner_credit_sources(
  p_actor_staff_id uuid,
  p_learner_id uuid
)
RETURNS TABLE (
  payment_id uuid,
  receipt_number text,
  amount_ugx bigint,
  original_unallocated_ugx bigint,
  allocated_credit_ugx bigint,
  remaining_credit_ugx bigint,
  received_at timestamptz,
  collection_item text,
  payer_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_actor_staff_id IS NULL OR p_learner_id IS NULL THEN
    RAISE EXCEPTION 'An authorised staff account and learner ID are required'
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
    RAISE EXCEPTION 'Staff account lacks permission to view retained learner credit'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cornhill_school.learners l
    WHERE l.id = p_learner_id AND l.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'The active learner record was not found'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    r.receipt_number,
    p.amount_ugx,
    p.unallocated_amount_ugx,
    COALESCE(used.allocated_ugx, 0)::bigint,
    (p.unallocated_amount_ugx - COALESCE(used.allocated_ugx, 0))::bigint,
    p.received_at,
    p.collection_item,
    p.payer_name
  FROM cornhill_school.payment_records p
  JOIN cornhill_school.payment_receipts r ON r.payment_id = p.id
  LEFT JOIN LATERAL (
    SELECT sum(pca.amount_ugx)::bigint AS allocated_ugx
    FROM cornhill_school.payment_credit_allocations pca
    WHERE pca.source_payment_id = p.id
  ) used ON true
  WHERE p.learner_id = p_learner_id
    AND p.status = 'Posted'
    AND p.unallocated_amount_ugx > COALESCE(used.allocated_ugx, 0)
  ORDER BY p.received_at, p.id;
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_learner_credit_sources(uuid, uuid)
  FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_learner_credit_sources(uuid, uuid)
  TO cornhill_finance_runtime;

COMMIT;
