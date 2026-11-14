-- CORNHILL Batch 19: retained learner-credit allocation ledger.
-- The original payment and receipt snapshot are never edited by this workflow.
BEGIN;

INSERT INTO cornhill_auth.permission_catalog
  (permission_code, category, description, high_risk)
VALUES
  ('finance.credit_allocate', 'finance',
   'Allocate retained learner payment credit to an outstanding fee obligation.', true)
ON CONFLICT (permission_code) DO NOTHING;

ALTER TABLE cornhill_school.finance_audit_events
  DROP CONSTRAINT finance_audit_events_event_code_check;
ALTER TABLE cornhill_school.finance_audit_events
  ADD CONSTRAINT finance_audit_events_event_code_check CHECK (event_code IN (
    'fee_obligation.created', 'fee_obligation.waived',
    'payment.created', 'payment.posted', 'payment.voided', 'payment.reversed',
    'payment.credit_allocated', 'receipt.reprinted',
    'expense.recorded', 'banking.reconciled'
  ));

CREATE TABLE cornhill_school.payment_credit_allocation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_payment_id uuid NOT NULL REFERENCES cornhill_school.payment_records(id) ON DELETE RESTRICT,
  learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
  actor_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  request_allocations jsonb NOT NULL CHECK (jsonb_typeof(request_allocations) = 'array'),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 300),
  total_allocated_ugx bigint NOT NULL CHECK (total_allocated_ugx > 0),
  remaining_credit_after_ugx bigint NOT NULL CHECK (remaining_credit_after_ugx >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_credit_batches_source_idx
  ON cornhill_school.payment_credit_allocation_batches (source_payment_id, created_at);

CREATE TABLE cornhill_school.payment_credit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES cornhill_school.payment_credit_allocation_batches(id) ON DELETE RESTRICT,
  source_payment_id uuid NOT NULL REFERENCES cornhill_school.payment_records(id) ON DELETE RESTRICT,
  learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
  fee_obligation_id uuid NOT NULL REFERENCES cornhill_school.fee_obligations(id) ON DELETE RESTRICT,
  amount_ugx bigint NOT NULL CHECK (amount_ugx > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, fee_obligation_id)
);

CREATE INDEX payment_credit_allocations_obligation_idx
  ON cornhill_school.payment_credit_allocations (fee_obligation_id, source_payment_id);

CREATE FUNCTION cornhill_school.prevent_credit_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'Retained-credit allocation ledger entries are immutable'
    USING ERRCODE = 'check_violation';
END;
$function$;

CREATE TRIGGER payment_credit_batches_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.payment_credit_allocation_batches
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_credit_ledger_mutation();

CREATE TRIGGER payment_credit_allocations_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.payment_credit_allocations
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_credit_ledger_mutation();

-- Keep the existing balance view accurate for both original payment allocations
-- and later allocations of retained credit.
CREATE OR REPLACE VIEW cornhill_school.fee_obligation_balances
WITH (security_invoker = true)
AS
SELECT
  fo.id AS fee_obligation_id,
  fo.learner_id,
  l.pupil_code,
  concat_ws(' ', l.first_name, l.middle_name, l.last_name) AS learner_name,
  fo.academic_term_id,
  ay.year_label AS academic_year,
  at.term_number,
  at.term_name,
  fc.item_code AS fee_item_code,
  fc.item_name AS fee_item_name,
  fo.amount_ugx,
  COALESCE(paid.paid_ugx, 0)::bigint AS paid_ugx,
  GREATEST(fo.amount_ugx - COALESCE(paid.paid_ugx, 0), 0)::bigint AS balance_ugx,
  fo.status AS obligation_status,
  (fo.due_date IS NOT NULL AND fo.due_date < CURRENT_DATE
    AND fo.amount_ugx > COALESCE(paid.paid_ugx, 0)
    AND fo.status = 'Open') AS is_overdue
FROM cornhill_school.fee_obligations fo
JOIN cornhill_school.learners l ON l.id = fo.learner_id
JOIN cornhill_school.academic_terms at ON at.id = fo.academic_term_id
JOIN cornhill_school.academic_years ay ON ay.id = at.academic_year_id
JOIN cornhill_school.fee_catalogue fc ON fc.id = fo.fee_item_id
LEFT JOIN LATERAL (
  SELECT sum(allocation.amount_ugx)::bigint AS paid_ugx
  FROM (
    SELECT pa.amount_ugx
    FROM cornhill_school.payment_allocations pa
    JOIN cornhill_school.payment_records pr ON pr.id = pa.payment_id
    WHERE pa.fee_obligation_id = fo.id AND pr.status = 'Posted'
    UNION ALL
    SELECT pca.amount_ugx
    FROM cornhill_school.payment_credit_allocations pca
    JOIN cornhill_school.payment_records source_payment ON source_payment.id = pca.source_payment_id
    WHERE pca.fee_obligation_id = fo.id AND source_payment.status = 'Posted'
  ) allocation
) paid ON true;

-- The shared invariant includes both normal payment allocations and credit-ledger
-- allocations. It runs when a payment is posted and when ordinary allocations change.
CREATE OR REPLACE FUNCTION cornhill_school.assert_posted_payment_allocations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  target_payment_id uuid;
  payment_state text;
  payment_amount bigint;
  retained_credit bigint;
  regular_allocated bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_payment_id := OLD.payment_id;
  ELSIF TG_TABLE_NAME = 'payment_records' THEN
    target_payment_id := NEW.id;
  ELSE
    target_payment_id := NEW.payment_id;
  END IF;

  SELECT status, amount_ugx, unallocated_amount_ugx
    INTO payment_state, payment_amount, retained_credit
  FROM cornhill_school.payment_records
  WHERE id = target_payment_id;

  IF NOT FOUND OR payment_state <> 'Posted' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount_ugx), 0)::bigint
    INTO regular_allocated
  FROM cornhill_school.payment_allocations
  WHERE payment_id = target_payment_id;

  IF regular_allocated + retained_credit <> payment_amount THEN
    RAISE EXCEPTION 'Allocated amount plus retained credit must equal the original payment'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM fo.id
  FROM cornhill_school.fee_obligations fo
  WHERE fo.id IN (
    SELECT pa.fee_obligation_id
    FROM cornhill_school.payment_allocations pa
    WHERE pa.payment_id = target_payment_id
    UNION
    SELECT pca.fee_obligation_id
    FROM cornhill_school.payment_credit_allocations pca
    WHERE pca.source_payment_id = target_payment_id
  )
  ORDER BY fo.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT pa.fee_obligation_id, pa.amount_ugx
      FROM cornhill_school.payment_allocations pa
      JOIN cornhill_school.payment_records pr ON pr.id = pa.payment_id
      WHERE pr.status = 'Posted'
      UNION ALL
      SELECT pca.fee_obligation_id, pca.amount_ugx
      FROM cornhill_school.payment_credit_allocations pca
      JOIN cornhill_school.payment_records source_payment ON source_payment.id = pca.source_payment_id
      WHERE source_payment.status = 'Posted'
    ) all_allocations
    JOIN cornhill_school.fee_obligations fo ON fo.id = all_allocations.fee_obligation_id
    GROUP BY fo.id, fo.amount_ugx
    HAVING sum(all_allocations.amount_ugx) > fo.amount_ugx
  ) THEN
    RAISE EXCEPTION 'Combined payment and retained-credit allocations exceed a fee obligation'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$function$;

-- Until a dedicated credit-release/reversal workflow exists, a source payment
-- with any consumed retained credit cannot be reversed.
CREATE FUNCTION cornhill_school.guard_credit_source_payment_reversal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF OLD.status = 'Posted' AND NEW.status = 'Reversed'
     AND EXISTS (
       SELECT 1
       FROM cornhill_school.payment_credit_allocations pca
       WHERE pca.source_payment_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'This payment has allocated retained credit; reverse the credit allocations through the approved credit-release workflow first'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payment_credit_source_reversal_guard
BEFORE UPDATE OF status ON cornhill_school.payment_records
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_credit_source_payment_reversal();

CREATE FUNCTION cornhill_school.allocate_local_payment_credit(
  p_actor_staff_id uuid,
  p_source_payment_id uuid,
  p_idempotency_key uuid,
  p_allocations jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_payment cornhill_school.payment_records%ROWTYPE;
  v_existing cornhill_school.payment_credit_allocation_batches%ROWTYPE;
  v_requested jsonb;
  v_total bigint;
  v_available bigint;
  v_remaining bigint;
  v_obligation_balance bigint;
  v_entry record;
  v_batch_id uuid;
  v_result_allocations jsonb;
BEGIN
  IF p_actor_staff_id IS NULL OR p_source_payment_id IS NULL OR p_idempotency_key IS NULL
     OR jsonb_typeof(p_allocations) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 100
     OR length(v_reason) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'A source payment, idempotency key, 1–100 allocations and a 5–300 character reason are required'
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
    RAISE EXCEPTION 'Staff account lacks permission to allocate retained learner credit'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) e(value)
    WHERE jsonb_typeof(e.value) <> 'object'
       OR COALESCE(e.value->>'fee_obligation_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(e.value->>'amount_ugx', '') !~ '^[1-9][0-9]{0,17}$'
  ) THEN
    RAISE EXCEPTION 'Each credit allocation needs a fee obligation ID and positive whole-UGX amount'
      USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) <> count(DISTINCT e.value->>'fee_obligation_id')
      FROM jsonb_array_elements(p_allocations) e(value)) THEN
    RAISE EXCEPTION 'A fee obligation may appear only once in a credit allocation batch'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'fee_obligation_id', x.fee_id,
      'amount_ugx', x.amount
    ) ORDER BY x.fee_id), '[]'::jsonb),
    COALESCE(sum(x.amount), 0)::bigint
  INTO v_requested, v_total
  FROM (
    SELECT (e.value->>'fee_obligation_id')::uuid AS fee_id,
           (e.value->>'amount_ugx')::bigint AS amount
    FROM jsonb_array_elements(p_allocations) e(value)
  ) x;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Credit allocation total must be positive'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cornhill-credit-key:' || p_idempotency_key::text, 0));

  SELECT * INTO v_existing
  FROM cornhill_school.payment_credit_allocation_batches
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.source_payment_id IS DISTINCT FROM p_source_payment_id
       OR v_existing.actor_staff_id IS DISTINCT FROM p_actor_staff_id
       OR v_existing.request_allocations IS DISTINCT FROM v_requested
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Credit allocation idempotency key was reused with different details'
        USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fee_obligation_id', pca.fee_obligation_id,
      'amount_ugx', pca.amount_ugx
    ) ORDER BY pca.fee_obligation_id), '[]'::jsonb)
    INTO v_result_allocations
    FROM cornhill_school.payment_credit_allocations pca
    WHERE pca.batch_id = v_existing.id;

    RETURN jsonb_build_object(
      'batch_id', v_existing.id,
      'source_payment_id', v_existing.source_payment_id,
      'total_allocated_ugx', v_existing.total_allocated_ugx,
      'remaining_credit_ugx', v_existing.remaining_credit_after_ugx,
      'allocations', v_result_allocations,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_payment
  FROM cornhill_school.payment_records
  WHERE id = p_source_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.status <> 'Posted' THEN
    RAISE EXCEPTION 'Retained credit can only be allocated from an original posted payment'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM cornhill_school.learners
  WHERE id = v_payment.learner_id AND status = 'Active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The source payment learner is not active'
      USING ERRCODE = '23514';
  END IF;

  SELECT v_payment.unallocated_amount_ugx - COALESCE(sum(pca.amount_ugx), 0)::bigint
    INTO v_available
  FROM cornhill_school.payment_credit_allocations pca
  WHERE pca.source_payment_id = p_source_payment_id;

  v_available := COALESCE(v_available, v_payment.unallocated_amount_ugx);
  IF v_total > v_available THEN
    RAISE EXCEPTION 'Credit allocation exceeds the remaining unallocated amount on the source payment'
      USING ERRCODE = '23514';
  END IF;

  FOR v_entry IN
    SELECT (e.value->>'fee_obligation_id')::uuid AS fee_id,
           (e.value->>'amount_ugx')::bigint AS amount
    FROM jsonb_array_elements(p_allocations) e(value)
    ORDER BY (e.value->>'fee_obligation_id')::uuid
  LOOP
    PERFORM 1
    FROM cornhill_school.fee_obligations fo
    WHERE fo.id = v_entry.fee_id
      AND fo.learner_id = v_payment.learner_id
      AND fo.status = 'Open'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A selected fee obligation is closed or belongs to another learner'
        USING ERRCODE = '23514';
    END IF;

    SELECT fo.amount_ugx - COALESCE((
      SELECT sum(allocation.amount_ugx)::bigint
      FROM (
        SELECT pa.amount_ugx
        FROM cornhill_school.payment_allocations pa
        JOIN cornhill_school.payment_records pr ON pr.id = pa.payment_id
        WHERE pa.fee_obligation_id = fo.id AND pr.status = 'Posted'
        UNION ALL
        SELECT pca.amount_ugx
        FROM cornhill_school.payment_credit_allocations pca
        JOIN cornhill_school.payment_records source_payment ON source_payment.id = pca.source_payment_id
        WHERE pca.fee_obligation_id = fo.id AND source_payment.status = 'Posted'
      ) allocation
    ), 0)
    INTO v_obligation_balance
    FROM cornhill_school.fee_obligations fo
    WHERE fo.id = v_entry.fee_id;

    IF v_entry.amount > v_obligation_balance THEN
      RAISE EXCEPTION 'Credit allocation exceeds the selected fee obligation balance'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_remaining := v_available - v_total;

  INSERT INTO cornhill_school.payment_credit_allocation_batches (
    source_payment_id, learner_id, actor_staff_id, idempotency_key,
    request_allocations, reason, total_allocated_ugx, remaining_credit_after_ugx
  ) VALUES (
    p_source_payment_id, v_payment.learner_id, p_actor_staff_id, p_idempotency_key,
    v_requested, v_reason, v_total, v_remaining
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO cornhill_school.payment_credit_allocations (
    batch_id, source_payment_id, learner_id, fee_obligation_id, amount_ugx
  )
  SELECT v_batch_id, p_source_payment_id, v_payment.learner_id,
         (e.value->>'fee_obligation_id')::uuid, (e.value->>'amount_ugx')::bigint
  FROM jsonb_array_elements(p_allocations) e(value);

  INSERT INTO cornhill_school.finance_audit_events
    (actor_staff_id, event_code, entity_type, entity_id, reason, details)
  VALUES (
    p_actor_staff_id,
    'payment.credit_allocated',
    'payment',
    p_source_payment_id,
    v_reason,
    jsonb_build_object(
      'batch_id', v_batch_id,
      'learner_id', v_payment.learner_id,
      'total_allocated_ugx', v_total,
      'remaining_credit_ugx', v_remaining,
      'allocations', v_requested
    )
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'source_payment_id', p_source_payment_id,
    'total_allocated_ugx', v_total,
    'remaining_credit_ugx', v_remaining,
    'allocations', v_requested,
    'replayed', false
  );
END;
$function$;

REVOKE ALL ON TABLE
  cornhill_school.payment_credit_allocation_batches,
  cornhill_school.payment_credit_allocations
FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api, cornhill_finance_runtime, cornhill_finance_api;

REVOKE ALL ON FUNCTION cornhill_school.prevent_credit_ledger_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_credit_source_payment_reversal() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.allocate_local_payment_credit(uuid, uuid, uuid, jsonb, text)
  FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;

GRANT EXECUTE ON FUNCTION cornhill_school.allocate_local_payment_credit(uuid, uuid, uuid, jsonb, text)
  TO cornhill_finance_runtime;

COMMIT;
