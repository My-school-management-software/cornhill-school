-- CORNHILL local finance, fees, payments, receipts and notification outbox.
-- Additive migration for the isolated local database only. No live school data is touched.

BEGIN;


CREATE FUNCTION cornhill_school.prevent_posted_allocation_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  payment_status text;
BEGIN
  SELECT status INTO payment_status
  FROM cornhill_school.payment_records
  WHERE id = OLD.payment_id
  FOR UPDATE;
  IF payment_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Allocations for a non-draft payment cannot be removed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER payment_allocation_delete_scope
BEFORE DELETE ON cornhill_school.payment_allocations
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_posted_allocation_delete();

CREATE SEQUENCE cornhill_school.receipt_number_sequence AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE cornhill_school.fee_catalogue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code text NOT NULL UNIQUE,
    item_name text NOT NULL,
    category text NOT NULL CHECK (category IN ('tuition', 'bursary', 'boarding', 'meals', 'graduation', 'other')),
    default_amount_ugx bigint NOT NULL DEFAULT 0 CHECK (default_amount_ugx >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fee_item_code_format CHECK (item_code ~ '^[A-Z0-9_]{2,32}$'),
    CONSTRAINT fee_item_name_length CHECK (length(trim(item_name)) BETWEEN 2 AND 100)
);

INSERT INTO cornhill_school.fee_catalogue (item_code, item_name, category) VALUES
 ('TUITION', 'School Fees', 'tuition'),
 ('BURSARY', 'Bursary Fees', 'bursary'),
 ('BOARDING', 'Boarding Fees', 'boarding'),
 ('BREAKFAST', 'Breakfast', 'meals'),
 ('LUNCH', 'Lunch', 'meals'),
 ('GRADUATION', 'Graduation Fees', 'graduation'),
 ('OTHER', 'Other School Payment', 'other')
ON CONFLICT (item_code) DO NOTHING;

CREATE TABLE cornhill_school.fee_obligations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    academic_term_id uuid NOT NULL REFERENCES cornhill_school.academic_terms(id) ON DELETE RESTRICT,
    fee_item_id uuid NOT NULL REFERENCES cornhill_school.fee_catalogue(id) ON DELETE RESTRICT,
    description text,
    amount_ugx bigint NOT NULL CHECK (amount_ugx > 0),
    due_date date,
    status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Settled', 'Waived', 'Cancelled')),
    created_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (learner_id, academic_term_id, fee_item_id),
    CONSTRAINT fee_obligation_description_length CHECK (description IS NULL OR length(description) <= 180)
);

CREATE INDEX fee_obligations_learner_term_idx
  ON cornhill_school.fee_obligations (learner_id, academic_term_id, status);
CREATE INDEX fee_obligations_open_due_idx
  ON cornhill_school.fee_obligations (due_date, learner_id) WHERE status = 'Open';

CREATE FUNCTION cornhill_school.validate_learner_fee_obligation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  learner_record cornhill_school.learners%ROWTYPE;
  fee_category text;
BEGIN
  SELECT * INTO learner_record
  FROM cornhill_school.learners
  WHERE id = NEW.learner_id
  FOR SHARE;
  IF NOT FOUND OR learner_record.status <> 'Active' THEN
    RAISE EXCEPTION 'An active learner is required for a fee obligation'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT category INTO fee_category
  FROM cornhill_school.fee_catalogue
  WHERE id = NEW.fee_item_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active fee catalogue item is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF learner_record.is_bursary AND fee_category = 'tuition' THEN
    RAISE EXCEPTION 'A bursary learner cannot receive a standard tuition obligation'
      USING ERRCODE = 'check_violation';
  END IF;
  IF fee_category = 'bursary' AND (
    learner_record.is_bursary = false OR NEW.amount_ugx <> learner_record.bursary_fee_ugx
  ) THEN
    RAISE EXCEPTION 'Bursary obligation must match the learner bursary amount'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER fee_obligation_learner_rules
BEFORE INSERT OR UPDATE OF learner_id, fee_item_id, amount_ugx
ON cornhill_school.fee_obligations
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_learner_fee_obligation();

CREATE TABLE cornhill_school.payment_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id uuid NOT NULL REFERENCES cornhill_school.learners(id) ON DELETE RESTRICT,
    amount_ugx bigint NOT NULL CHECK (amount_ugx > 0),
    currency char(3) NOT NULL DEFAULT 'UGX' CHECK (currency = 'UGX'),
    payment_method text NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque')),
    mobile_money_provider text CHECK (mobile_money_provider IN ('MTN', 'Airtel')),
    external_reference text,
    status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Posted', 'Voided', 'Reversed')),
    status_reason text,
    status_changed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    received_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    received_at timestamptz NOT NULL DEFAULT now(),
    idempotency_key uuid NOT NULL UNIQUE,
    notes text,
    posted_at timestamptz,
    reversed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_provider_method_consistent CHECK (
      (payment_method = 'mobile_money' AND mobile_money_provider IS NOT NULL)
      OR (payment_method <> 'mobile_money' AND mobile_money_provider IS NULL)
    ),
    CONSTRAINT payment_status_reason_required CHECK (
      (status IN ('Draft', 'Posted') AND status_reason IS NULL)
      OR (status IN ('Voided', 'Reversed') AND length(trim(status_reason)) BETWEEN 3 AND 300)
    ),
    CONSTRAINT payment_posted_timestamp_consistent CHECK (
      (status IN ('Posted', 'Reversed') AND posted_at IS NOT NULL)
      OR (status IN ('Draft', 'Voided') AND posted_at IS NULL)
    ),
    CONSTRAINT payment_reversed_timestamp_consistent CHECK (
      (status = 'Reversed' AND reversed_at IS NOT NULL)
      OR (status <> 'Reversed' AND reversed_at IS NULL)
    ),
    CONSTRAINT payment_external_reference_length CHECK (external_reference IS NULL OR length(external_reference) <= 120),
    CONSTRAINT payment_notes_length CHECK (notes IS NULL OR length(notes) <= 1000)
);

CREATE UNIQUE INDEX payment_external_reference_unique
  ON cornhill_school.payment_records (payment_method, external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX payment_records_learner_time_idx
  ON cornhill_school.payment_records (learner_id, received_at DESC);
CREATE INDEX payment_records_status_time_idx
  ON cornhill_school.payment_records (status, received_at DESC);

CREATE TABLE cornhill_school.payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES cornhill_school.payment_records(id) ON DELETE RESTRICT,
    fee_obligation_id uuid NOT NULL REFERENCES cornhill_school.fee_obligations(id) ON DELETE RESTRICT,
    amount_ugx bigint NOT NULL CHECK (amount_ugx > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (payment_id, fee_obligation_id)
);

CREATE INDEX payment_allocations_obligation_idx
  ON cornhill_school.payment_allocations (fee_obligation_id, payment_id);

CREATE FUNCTION cornhill_school.validate_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  payment_learner uuid;
  obligation_learner uuid;
  payment_status text;
BEGIN
  SELECT learner_id, status INTO payment_learner, payment_status
  FROM cornhill_school.payment_records
  WHERE id = NEW.payment_id
  FOR UPDATE;
  IF NOT FOUND OR payment_status <> 'Draft' THEN
    RAISE EXCEPTION 'Allocations can only be added to a draft payment'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT learner_id INTO obligation_learner
  FROM cornhill_school.fee_obligations
  WHERE id = NEW.fee_obligation_id
  FOR UPDATE;
  IF NOT FOUND OR obligation_learner <> payment_learner THEN
    RAISE EXCEPTION 'Payment and fee obligation must belong to the same learner'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payment_allocation_scope
BEFORE INSERT OR UPDATE ON cornhill_school.payment_allocations
FOR EACH ROW EXECUTE FUNCTION cornhill_school.validate_payment_allocation();

CREATE FUNCTION cornhill_school.prevent_posted_payment_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF OLD.status <> 'Draft' AND (
    NEW.learner_id IS DISTINCT FROM OLD.learner_id OR
    NEW.amount_ugx IS DISTINCT FROM OLD.amount_ugx OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
    NEW.mobile_money_provider IS DISTINCT FROM OLD.mobile_money_provider OR
    NEW.external_reference IS DISTINCT FROM OLD.external_reference OR
    NEW.received_by_staff_id IS DISTINCT FROM OLD.received_by_staff_id OR
    NEW.received_at IS DISTINCT FROM OLD.received_at OR
    NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION 'A non-draft payment cannot have its financial details edited'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'Posted' AND NEW.status NOT IN ('Posted', 'Reversed') THEN
    RAISE EXCEPTION 'A posted payment can only be reversed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('Voided', 'Reversed') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A voided or reversed payment is final'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'Posted' AND OLD.status = 'Draft' AND NEW.posted_at IS NULL THEN
    NEW.posted_at := now();
  END IF;
  IF NEW.status = 'Reversed' AND OLD.status = 'Posted' AND NEW.reversed_at IS NULL THEN
    NEW.reversed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payment_record_immutable_after_post
BEFORE UPDATE ON cornhill_school.payment_records
FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_posted_payment_edits();

CREATE FUNCTION cornhill_school.assert_posted_payment_allocations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  target_payment_id uuid;
  target_status text;
  target_amount bigint;
  allocated_amount bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_payment_id := OLD.payment_id;
  ELSIF TG_TABLE_NAME = 'payment_records' THEN
    target_payment_id := NEW.id;
  ELSE
    target_payment_id := NEW.payment_id;
  END IF;
  SELECT status, amount_ugx INTO target_status, target_amount
  FROM cornhill_school.payment_records WHERE id = target_payment_id;
  IF NOT FOUND OR target_status <> 'Posted' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount_ugx), 0) INTO allocated_amount
  FROM cornhill_school.payment_allocations
  WHERE payment_id = target_payment_id;
  IF allocated_amount <> target_amount OR allocated_amount <= 0 THEN
    RAISE EXCEPTION 'A posted payment must be fully allocated to fee obligations'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM fo.id
  FROM cornhill_school.fee_obligations fo
  JOIN cornhill_school.payment_allocations pa ON pa.fee_obligation_id = fo.id
  WHERE pa.payment_id = target_payment_id
  ORDER BY fo.id
  FOR UPDATE OF fo;

  IF EXISTS (
    SELECT 1
    FROM cornhill_school.fee_obligations fo
    JOIN cornhill_school.payment_allocations pa ON pa.fee_obligation_id = fo.id
    JOIN cornhill_school.payment_records pr ON pr.id = pa.payment_id
    WHERE pr.status = 'Posted'
    GROUP BY fo.id, fo.amount_ugx
    HAVING sum(pa.amount_ugx) > fo.amount_ugx
  ) THEN
    RAISE EXCEPTION 'Payment allocations cannot exceed the fee obligation balance'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER payment_posted_allocations_valid
AFTER UPDATE OF status ON cornhill_school.payment_records
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION cornhill_school.assert_posted_payment_allocations();

CREATE CONSTRAINT TRIGGER allocation_posted_payment_valid
AFTER INSERT OR UPDATE OR DELETE ON cornhill_school.payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION cornhill_school.assert_posted_payment_allocations();



CREATE TABLE cornhill_school.payment_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL UNIQUE REFERENCES cornhill_school.payment_records(id) ON DELETE RESTRICT,
    receipt_number text NOT NULL UNIQUE,
    receipt_data_snapshot jsonb NOT NULL CHECK (jsonb_typeof(receipt_data_snapshot) = 'object'),
    issued_at timestamptz NOT NULL DEFAULT now(),
    print_count integer NOT NULL DEFAULT 0 CHECK (print_count >= 0),
    last_printed_at timestamptz
);


CREATE FUNCTION cornhill_school.protect_payment_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued payment receipts cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id OR
     NEW.receipt_number IS DISTINCT FROM OLD.receipt_number OR
     NEW.receipt_data_snapshot IS DISTINCT FROM OLD.receipt_data_snapshot OR
     NEW.issued_at IS DISTINCT FROM OLD.issued_at OR
     NEW.print_count < OLD.print_count OR
     NEW.print_count > OLD.print_count + 1 OR
     (NEW.print_count = OLD.print_count AND NEW.last_printed_at IS DISTINCT FROM OLD.last_printed_at) OR
     (NEW.print_count = OLD.print_count + 1 AND NEW.last_printed_at IS NULL) THEN
    RAISE EXCEPTION 'Receipt content is immutable; only a single print event may be recorded'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER payment_receipt_immutable
BEFORE UPDATE OR DELETE ON cornhill_school.payment_receipts
FOR EACH ROW EXECUTE FUNCTION cornhill_school.protect_payment_receipt();

CREATE FUNCTION cornhill_school.issue_payment_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  learner_record record;
  receipt_code text;
  allocation_snapshot jsonb;
BEGIN
  IF NEW.status = 'Posted' AND OLD.status = 'Draft' THEN
    SELECT pupil_code,
      concat_ws(' ', first_name, middle_name, last_name) AS learner_name
    INTO learner_record
    FROM cornhill_school.learners WHERE id = NEW.learner_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fee_item', fc.item_name,
      'term', at.term_name,
      'academic_year', ay.year_label,
      'allocated_ugx', pa.amount_ugx,
      'balance_after_ugx', fo.amount_ugx - (
        SELECT COALESCE(sum(pa2.amount_ugx), 0)
        FROM cornhill_school.payment_allocations pa2
        JOIN cornhill_school.payment_records pr2 ON pr2.id = pa2.payment_id
        WHERE pa2.fee_obligation_id = fo.id AND pr2.status = 'Posted'
      )
    ) ORDER BY ay.year_label, at.term_number, fc.item_name), '[]'::jsonb)
    INTO allocation_snapshot
    FROM cornhill_school.payment_allocations pa
    JOIN cornhill_school.fee_obligations fo ON fo.id = pa.fee_obligation_id
    JOIN cornhill_school.fee_catalogue fc ON fc.id = fo.fee_item_id
    JOIN cornhill_school.academic_terms at ON at.id = fo.academic_term_id
    JOIN cornhill_school.academic_years ay ON ay.id = at.academic_year_id
    WHERE pa.payment_id = NEW.id;

    receipt_code := 'CR-' ||
      to_char(timezone('Africa/Kampala', now()), 'YYYY') || '-' ||
      lpad(nextval('cornhill_school.receipt_number_sequence'::regclass)::text, 7, '0');

    INSERT INTO cornhill_school.payment_receipts
      (payment_id, receipt_number, receipt_data_snapshot)
    VALUES (NEW.id, receipt_code, jsonb_build_object(
      'school_name', 'CORNHILL NURSERY AND PRIMARY SCHOOL',
      'pupil_code', learner_record.pupil_code,
      'learner_name', learner_record.learner_name,
      'amount_ugx', NEW.amount_ugx,
      'currency', NEW.currency,
      'payment_method', NEW.payment_method,
      'mobile_money_provider', NEW.mobile_money_provider,
      'external_reference', NEW.external_reference,
      'received_at', NEW.received_at,
      'received_by_staff_id', NEW.received_by_staff_id,
      'allocations', allocation_snapshot
    ));

    INSERT INTO cornhill_school.payment_notification_outbox
      (payment_id, guardian_contact_id, channel, destination_phone)
    SELECT NEW.id, gc.id, 'sms', gc.phone_e164
    FROM cornhill_school.guardian_contacts gc
    WHERE gc.learner_id = NEW.learner_id
      AND gc.is_active = true
      AND gc.sms_opt_in = true
      AND gc.phone_e164 IS NOT NULL
    ON CONFLICT (payment_id, guardian_contact_id, channel) DO NOTHING;
  ELSIF NEW.status = 'Reversed' AND OLD.status = 'Posted' THEN
    UPDATE cornhill_school.payment_notification_outbox
    SET status = 'cancelled', updated_at = now()
    WHERE payment_id = NEW.id AND status = 'queued';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE cornhill_school.finance_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
    event_code text NOT NULL CHECK (event_code IN (
      'fee_obligation.created', 'fee_obligation.waived',
      'payment.created', 'payment.posted', 'payment.voided', 'payment.reversed',
      'receipt.reprinted', 'expense.recorded', 'banking.reconciled'
    )),
    entity_type text NOT NULL CHECK (entity_type IN ('fee_obligation', 'payment', 'receipt', 'expense', 'banking')),
    entity_id uuid,
    reason text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_audit_reason_length CHECK (reason IS NULL OR length(reason) <= 500)
);

CREATE TABLE cornhill_school.payment_notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES cornhill_school.payment_records(id) ON DELETE RESTRICT,
    guardian_contact_id uuid NOT NULL REFERENCES cornhill_school.guardian_contacts(id) ON DELETE RESTRICT,
    channel text NOT NULL CHECK (channel IN ('sms')),
    destination_phone text NOT NULL CHECK (destination_phone ~ '^\+256[0-9]{9}$'),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
    attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    provider_reference text,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (payment_id, guardian_contact_id, channel)
);

CREATE INDEX payment_notification_ready_idx
  ON cornhill_school.payment_notification_outbox (next_attempt_at, created_at)
  WHERE status = 'queued';

CREATE TRIGGER payment_receipt_and_notification
AFTER UPDATE OF status ON cornhill_school.payment_records
FOR EACH ROW EXECUTE FUNCTION cornhill_school.issue_payment_receipt();

INSERT INTO cornhill_auth.permission_catalog (permission_code, category, description, high_risk)
VALUES
 ('finance.fees_manage', 'finance', 'Create and adjust learner fee obligations.', true),
 ('finance.bursary_manage', 'finance', 'Manage bursary fee obligations and adjustments.', true),
 ('finance.receipts_reprint', 'finance', 'Reprint an existing immutable payment receipt.', false),
 ('finance.expenses_manage', 'finance', 'Record and approve school expenses.', true),
 ('finance.banking_manage', 'finance', 'Manage bank accounts, deposits and reconciliation.', true)
ON CONFLICT (permission_code) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC;

COMMIT;
