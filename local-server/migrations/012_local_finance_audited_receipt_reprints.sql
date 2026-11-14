-- CORNHILL local receipt reprint: permission-checked, reasoned and audited.
-- The immutable original receipt snapshot is returned; only print metadata changes.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.reprint_local_payment_receipt(
  p_actor_staff_id uuid,
  p_receipt_number text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_reason text;
  v_receipt cornhill_school.payment_receipts%ROWTYPE;
  v_payment_status text;
  v_printed_at timestamptz;
  v_next_count integer;
  v_authorised boolean;
BEGIN
  v_reason := btrim(COALESCE(p_reason, ''));

  IF p_actor_staff_id IS NULL
     OR p_receipt_number IS NULL
     OR p_receipt_number !~ '^CR-[0-9]{4}-[0-9]{7}$'
     OR length(v_reason) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'A valid receipt number and a reprint reason of 5 to 300 characters are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code = ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id = sa.id
    WHERE sa.id = p_actor_staff_id
      AND sa.account_status = 'active'
      AND sp.employment_status = 'Active'
      AND rp.permission_code = 'finance.receipts_reprint'
  ) INTO v_authorised;

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'Staff account lacks permission to reprint school receipts'
      USING ERRCODE = '42501';
  END IF;

  SELECT r, p.status
    INTO v_receipt, v_payment_status
  FROM cornhill_school.payment_receipts r
  JOIN cornhill_school.payment_records p ON p.id = r.payment_id
  WHERE r.receipt_number = p_receipt_number
  FOR UPDATE OF r, p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested payment receipt was not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_payment_status NOT IN ('Posted', 'Reversed') THEN
    RAISE EXCEPTION 'Only issued payment receipts may be reprinted'
      USING ERRCODE = '23514';
  END IF;

  v_next_count := v_receipt.print_count + 1;
  v_printed_at := clock_timestamp();

  UPDATE cornhill_school.payment_receipts
  SET print_count = v_next_count,
      last_printed_at = v_printed_at
  WHERE id = v_receipt.id;

  INSERT INTO cornhill_school.finance_audit_events
    (actor_staff_id, event_code, entity_type, entity_id, reason, details)
  VALUES (
    p_actor_staff_id,
    'receipt.reprinted',
    'receipt',
    v_receipt.id,
    v_reason,
    jsonb_build_object(
      'receipt_number', v_receipt.receipt_number,
      'payment_id', v_receipt.payment_id,
      'print_count', v_next_count,
      'payment_status', v_payment_status
    )
  );

  RETURN jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'receipt_data_snapshot', v_receipt.receipt_data_snapshot,
    'payment_status', v_payment_status,
    'print_count', v_next_count,
    'last_printed_at', v_printed_at,
    'reprint_reason', v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION cornhill_school.reprint_local_payment_receipt(uuid, text, text)
  FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
GRANT EXECUTE ON FUNCTION cornhill_school.reprint_local_payment_receipt(uuid, text, text)
  TO cornhill_finance_runtime;

COMMIT;
