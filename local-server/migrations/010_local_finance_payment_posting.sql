-- Local-only, additive finance posting workflow. Never apply to hosted Supabase.
BEGIN;

DO $roles$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cornhill_finance_runtime')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cornhill_finance_api') THEN
    RAISE EXCEPTION 'Provision restricted finance roles before migration 010';
  END IF;
  IF NOT pg_has_role('cornhill_finance_api','cornhill_finance_runtime','MEMBER') THEN
    RAISE EXCEPTION 'Finance API role must inherit finance runtime role';
  END IF;
  FOR r IN SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
           FROM pg_roles WHERE rolname IN ('cornhill_finance_runtime','cornhill_finance_api')
  LOOP
    IF r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls THEN
      RAISE EXCEPTION 'Finance role % must remain NOLOGIN and non-privileged',r.rolname;
    END IF;
  END LOOP;
END $roles$;

ALTER TABLE cornhill_school.payment_records
  ADD COLUMN payer_name text,
  ADD COLUMN collection_item text NOT NULL DEFAULT 'School fees',
  ADD COLUMN unallocated_amount_ugx bigint NOT NULL DEFAULT 0;
ALTER TABLE cornhill_school.payment_records
  ADD CONSTRAINT payment_payer_name_length CHECK (payer_name IS NULL OR length(trim(payer_name)) BETWEEN 2 AND 140),
  ADD CONSTRAINT payment_collection_item_length CHECK (length(trim(collection_item)) BETWEEN 2 AND 100),
  ADD CONSTRAINT payment_unallocated_amount_range CHECK (unallocated_amount_ugx BETWEEN 0 AND amount_ugx);

-- Block UPDATE as well as DELETE/INSERT attempts against allocations on posted payments.
CREATE OR REPLACE FUNCTION cornhill_school.guard_payment_allocation_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $fn$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM cornhill_school.payment_records WHERE id=OLD.payment_id FOR UPDATE;
  IF s IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Allocations on non-draft payments are immutable' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION cornhill_school.guard_payment_allocation_update() FROM PUBLIC;
CREATE TRIGGER payment_allocation_update_guard
BEFORE UPDATE ON cornhill_school.payment_allocations
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payment_allocation_update();

CREATE OR REPLACE FUNCTION cornhill_school.prevent_posted_payment_edits()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $fn$
BEGIN
  IF OLD.status<>'Draft' AND (
    NEW.learner_id IS DISTINCT FROM OLD.learner_id OR NEW.amount_ugx IS DISTINCT FROM OLD.amount_ugx OR
    NEW.currency IS DISTINCT FROM OLD.currency OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
    NEW.mobile_money_provider IS DISTINCT FROM OLD.mobile_money_provider OR NEW.external_reference IS DISTINCT FROM OLD.external_reference OR
    NEW.received_by_staff_id IS DISTINCT FROM OLD.received_by_staff_id OR NEW.received_at IS DISTINCT FROM OLD.received_at OR
    NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.payer_name IS DISTINCT FROM OLD.payer_name OR
    NEW.collection_item IS DISTINCT FROM OLD.collection_item OR NEW.unallocated_amount_ugx IS DISTINCT FROM OLD.unallocated_amount_ugx
  ) THEN RAISE EXCEPTION 'Financial details of a non-draft payment are immutable' USING ERRCODE='check_violation'; END IF;
  IF OLD.status='Posted' AND NEW.status NOT IN ('Posted','Reversed') THEN
    RAISE EXCEPTION 'A posted payment may only be reversed' USING ERRCODE='check_violation';
  END IF;
  IF OLD.status IN ('Voided','Reversed') AND NEW.status<>OLD.status THEN
    RAISE EXCEPTION 'A voided or reversed payment is final' USING ERRCODE='check_violation';
  END IF;
  IF NEW.status='Posted' AND OLD.status='Draft' AND NEW.posted_at IS NULL THEN NEW.posted_at:=now(); END IF;
  IF NEW.status='Reversed' AND OLD.status='Posted' AND NEW.reversed_at IS NULL THEN NEW.reversed_at:=now(); END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.assert_posted_payment_allocations()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $fn$
DECLARE pid uuid; st text; amt bigint; credit bigint; allocated bigint;
BEGIN
  IF TG_OP='DELETE' THEN pid:=OLD.payment_id;
  ELSIF TG_TABLE_NAME='payment_records' THEN pid:=NEW.id;
  ELSE pid:=NEW.payment_id; END IF;
  SELECT status,amount_ugx,unallocated_amount_ugx INTO st,amt,credit
  FROM cornhill_school.payment_records WHERE id=pid;
  IF NOT FOUND OR st<>'Posted' THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount_ugx),0)::bigint INTO allocated
  FROM cornhill_school.payment_allocations WHERE payment_id=pid;
  IF allocated+credit<>amt THEN
    RAISE EXCEPTION 'Allocated amount plus unallocated credit must equal the receipt total' USING ERRCODE='check_violation';
  END IF;
  PERFORM fo.id FROM cornhill_school.fee_obligations fo
    JOIN cornhill_school.payment_allocations pa ON pa.fee_obligation_id=fo.id
    WHERE pa.payment_id=pid ORDER BY fo.id FOR UPDATE OF fo;
  IF EXISTS (
    SELECT 1 FROM cornhill_school.fee_obligations fo
    JOIN cornhill_school.payment_allocations pa ON pa.fee_obligation_id=fo.id
    JOIN cornhill_school.payment_records pr ON pr.id=pa.payment_id
    WHERE pr.status='Posted' GROUP BY fo.id,fo.amount_ugx
    HAVING sum(pa.amount_ugx)>fo.amount_ugx
  ) THEN RAISE EXCEPTION 'Allocations exceed an obligation balance' USING ERRCODE='check_violation'; END IF;
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.issue_payment_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $fn$
DECLARE l record; receipt text; allocs jsonb;
BEGIN
  IF NEW.status='Posted' AND OLD.status='Draft' THEN
    SELECT pupil_code,concat_ws(' ',first_name,middle_name,last_name) AS learner_name
      INTO l FROM cornhill_school.learners WHERE id=NEW.learner_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fee_item',fc.item_name,'term',at.term_name,'academic_year',ay.year_label,
      'allocated_ugx',pa.amount_ugx,
      'balance_after_ugx',fo.amount_ugx-(
        SELECT COALESCE(sum(pa2.amount_ugx),0) FROM cornhill_school.payment_allocations pa2
        JOIN cornhill_school.payment_records pr2 ON pr2.id=pa2.payment_id
        WHERE pa2.fee_obligation_id=fo.id AND pr2.status='Posted'
      )
    ) ORDER BY ay.year_label,at.term_number,fc.item_name),'[]'::jsonb)
    INTO allocs FROM cornhill_school.payment_allocations pa
    JOIN cornhill_school.fee_obligations fo ON fo.id=pa.fee_obligation_id
    JOIN cornhill_school.fee_catalogue fc ON fc.id=fo.fee_item_id
    JOIN cornhill_school.academic_terms at ON at.id=fo.academic_term_id
    JOIN cornhill_school.academic_years ay ON ay.id=at.academic_year_id
    WHERE pa.payment_id=NEW.id;
    receipt:='CR-'||to_char(timezone('Africa/Kampala',now()),'YYYY')||'-'||
      lpad(nextval('cornhill_school.receipt_number_sequence'::regclass)::text,7,'0');
    INSERT INTO cornhill_school.payment_receipts(payment_id,receipt_number,receipt_data_snapshot)
    VALUES(NEW.id,receipt,jsonb_build_object(
      'school_name','CORNHILL NURSERY AND PRIMARY SCHOOL','pupil_code',l.pupil_code,'learner_name',l.learner_name,
      'amount_ugx',NEW.amount_ugx,'unallocated_amount_ugx',NEW.unallocated_amount_ugx,
      'collection_item',NEW.collection_item,'payer_name',NEW.payer_name,'currency',NEW.currency,
      'payment_method',NEW.payment_method,'mobile_money_provider',NEW.mobile_money_provider,
      'external_reference',NEW.external_reference,'received_at',NEW.received_at,
      'received_by_staff_id',NEW.received_by_staff_id,'allocations',allocs
    ));
    INSERT INTO cornhill_school.payment_notification_outbox(payment_id,guardian_contact_id,channel,destination_phone)
    SELECT NEW.id,gc.id,'sms',gc.phone_e164 FROM cornhill_school.guardian_contacts gc
    WHERE gc.learner_id=NEW.learner_id AND gc.is_active AND gc.sms_opt_in AND gc.phone_e164 IS NOT NULL
    ON CONFLICT(payment_id,guardian_contact_id,channel) DO NOTHING;
  ELSIF NEW.status='Reversed' AND OLD.status='Posted' THEN
    UPDATE cornhill_school.payment_notification_outbox SET status='cancelled',updated_at=now()
    WHERE payment_id=NEW.id AND status='queued';
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.post_local_payment(
  p_actor_staff_id uuid,p_learner_id uuid,p_amount_ugx bigint,p_payment_method text,p_idempotency_key uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb,p_mobile_money_provider text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,p_collection_item text DEFAULT 'School fees',
  p_payer_name text DEFAULT NULL,p_notes text DEFAULT NULL
)
RETURNS TABLE(payment_id uuid,receipt_number text,payment_status text,
  allocated_amount_ugx bigint,unallocated_amount_ugx bigint,receipt_data_snapshot jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
  existing_payment cornhill_school.payment_records%ROWTYPE;
  collection_value text; payer_value text; reference_value text; notes_value text;
  requested_allocations jsonb; saved_allocations jsonb;
  allocated_total bigint; paid_total bigint; due_amount bigint; entry record;
  learner_is_active boolean; new_payment_id uuid; receipt_value text; receipt_snapshot jsonb;
BEGIN
  IF p_actor_staff_id IS NULL OR p_learner_id IS NULL OR p_amount_ugx IS NULL OR p_amount_ugx<=0 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A staff member, learner, positive whole-UGX amount and idempotency key are required' USING ERRCODE='22023';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash','mobile_money','bank_transfer','card','cheque') THEN
    RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE='22023';
  END IF;
  IF (p_payment_method='mobile_money' AND COALESCE(p_mobile_money_provider,'') NOT IN ('MTN','Airtel'))
     OR (p_payment_method<>'mobile_money' AND p_mobile_money_provider IS NOT NULL) THEN
    RAISE EXCEPTION 'Choose MTN or Airtel for mobile money only' USING ERRCODE='22023';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' THEN
    RAISE EXCEPTION 'Allocations must be a JSON array' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_allocations)>100 THEN
    RAISE EXCEPTION 'No more than 100 fee allocations may be submitted' USING ERRCODE='22023';
  END IF;

  collection_value:=btrim(COALESCE(p_collection_item,''));
  payer_value:=NULLIF(btrim(COALESCE(p_payer_name,'')),'');
  reference_value:=NULLIF(btrim(COALESCE(p_external_reference,'')),'');
  notes_value:=NULLIF(btrim(COALESCE(p_notes,'')),'');
  IF length(collection_value) NOT BETWEEN 2 AND 100 OR
     (payer_value IS NOT NULL AND length(payer_value) NOT BETWEEN 2 AND 140) OR
     (reference_value IS NOT NULL AND length(reference_value)>120) OR
     (notes_value IS NOT NULL AND length(notes_value)>1000) THEN
    RAISE EXCEPTION 'Payment description or reference is outside the allowed length' USING ERRCODE='22023';
  END IF;

  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_allocations) e(value)
    WHERE jsonb_typeof(e.value)<>'object'
       OR COALESCE(e.value->>'fee_obligation_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(e.value->>'amount_ugx','') !~ '^[1-9][0-9]{0,17}$'
  ) THEN RAISE EXCEPTION 'Each allocation needs a fee ID and positive whole-UGX amount' USING ERRCODE='22023'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('fee_obligation_id',x.fee_id,'amount_ugx',x.amount)
    ORDER BY x.fee_id),'[]'::jsonb)
  INTO requested_allocations
  FROM (SELECT (e.value->>'fee_obligation_id')::uuid AS fee_id,(e.value->>'amount_ugx')::bigint AS amount
        FROM jsonb_array_elements(p_allocations) e(value)) x;
  IF (SELECT count(*)<>count(DISTINCT e.value->>'fee_obligation_id')
      FROM jsonb_array_elements(p_allocations) e(value)) THEN
    RAISE EXCEPTION 'A fee obligation may appear only once per payment' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(sum((e.value->>'amount_ugx')::bigint),0)::bigint INTO allocated_total
  FROM jsonb_array_elements(p_allocations) e(value);
  IF allocated_total>p_amount_ugx THEN
    RAISE EXCEPTION 'Allocated amount cannot exceed money received' USING ERRCODE='23514';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM cornhill_auth.staff_accounts sa
    JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
    JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
    JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
      AND sp.employment_status='Active' AND rp.permission_code='finance.payments_record'
  ) THEN RAISE EXCEPTION 'Staff account lacks permission to record payments' USING ERRCODE='42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cornhill-payment-key:'||p_idempotency_key::text,0));
  SELECT * INTO existing_payment FROM cornhill_school.payment_records
  WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('fee_obligation_id',pa.fee_obligation_id,'amount_ugx',pa.amount_ugx)
      ORDER BY pa.fee_obligation_id),'[]'::jsonb)
    INTO saved_allocations FROM cornhill_school.payment_allocations pa WHERE pa.payment_id=existing_payment.id;
    IF existing_payment.learner_id IS DISTINCT FROM p_learner_id OR
       existing_payment.amount_ugx IS DISTINCT FROM p_amount_ugx OR
       existing_payment.payment_method IS DISTINCT FROM p_payment_method OR
       existing_payment.mobile_money_provider IS DISTINCT FROM p_mobile_money_provider OR
       existing_payment.external_reference IS DISTINCT FROM reference_value OR
       existing_payment.collection_item IS DISTINCT FROM collection_value OR
       existing_payment.payer_name IS DISTINCT FROM payer_value OR
       existing_payment.notes IS DISTINCT FROM notes_value OR
       existing_payment.received_by_staff_id IS DISTINCT FROM p_actor_staff_id OR
       saved_allocations IS DISTINCT FROM requested_allocations OR existing_payment.status NOT IN ('Posted','Reversed') THEN
      RAISE EXCEPTION 'Idempotency key was reused for a different or unfinished payment' USING ERRCODE='23505';
    END IF;
    SELECT r.receipt_number,r.receipt_data_snapshot INTO receipt_value,receipt_snapshot
    FROM cornhill_school.payment_receipts r WHERE r.payment_id=existing_payment.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Existing payment has no receipt; administrator review required' USING ERRCODE='23514'; END IF;
    RETURN QUERY SELECT existing_payment.id,receipt_value,existing_payment.status,allocated_total,
      existing_payment.unallocated_amount_ugx,receipt_snapshot;
    RETURN;
  END IF;

  SELECT true INTO learner_is_active FROM cornhill_school.learners
  WHERE id=p_learner_id AND status='Active' FOR UPDATE;
  IF NOT COALESCE(learner_is_active,false) THEN
    RAISE EXCEPTION 'An active learner is required' USING ERRCODE='23503';
  END IF;
  FOR entry IN
    SELECT (e.value->>'fee_obligation_id')::uuid AS fee_id,(e.value->>'amount_ugx')::bigint AS amount
    FROM jsonb_array_elements(p_allocations) e(value)
    ORDER BY (e.value->>'fee_obligation_id')::uuid
  LOOP
    SELECT amount_ugx INTO due_amount FROM cornhill_school.fee_obligations
    WHERE id=entry.fee_id AND learner_id=p_learner_id AND status='Open' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fee obligation is not open or belongs to another learner' USING ERRCODE='23514'; END IF;
    SELECT COALESCE(sum(pa.amount_ugx),0)::bigint INTO paid_total
    FROM cornhill_school.payment_allocations pa
    JOIN cornhill_school.payment_records pr ON pr.id=pa.payment_id
    WHERE pa.fee_obligation_id=entry.fee_id AND pr.status='Posted';
    IF entry.amount>due_amount-paid_total THEN
      RAISE EXCEPTION 'Allocation exceeds remaining fee balance' USING ERRCODE='23514';
    END IF;
  END LOOP;

  INSERT INTO cornhill_school.payment_records(
    learner_id,amount_ugx,payment_method,mobile_money_provider,external_reference,status,
    received_by_staff_id,idempotency_key,notes,payer_name,collection_item,unallocated_amount_ugx
  ) VALUES(
    p_learner_id,p_amount_ugx,p_payment_method,p_mobile_money_provider,reference_value,'Draft',
    p_actor_staff_id,p_idempotency_key,notes_value,payer_value,collection_value,p_amount_ugx-allocated_total
  ) RETURNING id INTO new_payment_id;

  INSERT INTO cornhill_school.payment_allocations(payment_id,fee_obligation_id,amount_ugx)
  SELECT new_payment_id,(e.value->>'fee_obligation_id')::uuid,(e.value->>'amount_ugx')::bigint
  FROM jsonb_array_elements(p_allocations) e(value);

  UPDATE cornhill_school.payment_records SET status='Posted',status_changed_by_staff_id=p_actor_staff_id
  WHERE id=new_payment_id;
  INSERT INTO cornhill_school.finance_audit_events(actor_staff_id,event_code,entity_type,entity_id,details)
  VALUES(p_actor_staff_id,'payment.posted','payment',new_payment_id,jsonb_build_object(
    'amount_ugx',p_amount_ugx,'allocated_amount_ugx',allocated_total,
    'unallocated_amount_ugx',p_amount_ugx-allocated_total,'collection_item',collection_value
  ));

  SELECT r.receipt_number,r.receipt_data_snapshot INTO receipt_value,receipt_snapshot
  FROM cornhill_school.payment_receipts r WHERE r.payment_id=new_payment_id;
  RETURN QUERY SELECT new_payment_id,receipt_value,'Posted'::text,allocated_total,
    p_amount_ugx-allocated_total,receipt_snapshot;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.post_local_payment(uuid,uuid,bigint,text,uuid,jsonb,text,text,text,text,text)
  FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api;
REVOKE ALL ON SCHEMA cornhill_school FROM cornhill_auth_runtime,cornhill_auth_api;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
GRANT CONNECT ON DATABASE cornhill_local TO cornhill_finance_runtime;
REVOKE TEMPORARY ON DATABASE cornhill_local FROM cornhill_finance_runtime,cornhill_finance_api;
GRANT USAGE ON SCHEMA cornhill_school TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.post_local_payment(uuid,uuid,bigint,text,uuid,jsonb,text,text,text,text,text)
  TO cornhill_finance_runtime;
COMMIT;
