-- CORNHILL V50: classify each allocated payment line into Income A or B.
-- The existing multi-obligation post_local_payment already supports one receipt
-- for School Fees + graduation + mock exams + trips; no second posting is created.
-- New receipts store independently paid/remaining amounts for each item.
-- Existing issued receipts remain completely unchanged.
BEGIN;

CREATE VIEW cornhill_school.finance_posted_income_allocations AS
SELECT pr.id AS payment_id,
       pr.learner_id, pr.received_at, pr.received_by_staff_id,
       pa.fee_obligation_id, fc.item_code, fc.item_name, fc.income_group,
       pa.amount_ugx AS allocated_ugx,
       fo.academic_term_id, at.academic_year_id
FROM cornhill_school.payment_allocations pa
JOIN cornhill_school.payment_records pr ON pr.id=pa.payment_id
JOIN cornhill_school.fee_obligations fo ON fo.id=pa.fee_obligation_id
JOIN cornhill_school.fee_catalogue fc ON fc.id=fo.fee_item_id
JOIN cornhill_school.academic_terms at ON at.id=fo.academic_term_id
WHERE pr.status='Posted'
UNION ALL
-- Retained learner credit becomes allocated income only when it is applied
-- to a specific fee. Count it once, on the date of the credit allocation.
SELECT source.id, pca.learner_id, batch.created_at, batch.actor_staff_id,
       pca.fee_obligation_id, fc.item_code, fc.item_name, fc.income_group,
       pca.amount_ugx, fo.academic_term_id, at.academic_year_id
FROM cornhill_school.payment_credit_allocations pca
JOIN cornhill_school.payment_credit_allocation_batches batch ON batch.id=pca.batch_id
JOIN cornhill_school.payment_records source ON source.id=pca.source_payment_id
JOIN cornhill_school.fee_obligations fo ON fo.id=pca.fee_obligation_id
JOIN cornhill_school.fee_catalogue fc ON fc.id=fo.fee_item_id
JOIN cornhill_school.academic_terms at ON at.id=fo.academic_term_id
WHERE source.status='Posted';

REVOKE ALL ON cornhill_school.finance_posted_income_allocations FROM PUBLIC;
-- Restricted to an actor-authorised function: no blanket SELECT grant.

CREATE FUNCTION cornhill_school.finance_income_group_summary(
  p_actor_staff_id uuid,p_start_date date,p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE result jsonb;
BEGIN
  IF NOT cornhill_school.finance_staff_can_read(p_actor_staff_id) THEN
    RAISE EXCEPTION 'Finance permission is required to view income reports'
      USING ERRCODE='42501';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL
    OR p_start_date>p_end_date
    OR p_end_date>p_start_date+366 THEN
    RAISE EXCEPTION 'Provide an income-report date range of no more than 366 days'
      USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object(
    'from_date',p_start_date,'to_date',p_end_date,
    'income_a_ugx',COALESCE(SUM(totals.total_ugx) FILTER(WHERE totals.income_group='A'),0),
    'income_b_ugx',COALESCE(SUM(totals.total_ugx) FILTER(WHERE totals.income_group='B'),0),
    'items',COALESCE(jsonb_agg(jsonb_build_object(
      'income_group',totals.income_group,'item_code',totals.item_code,
      'item_name',totals.item_name,'total_ugx',totals.total_ugx
    ) ORDER BY totals.income_group,totals.item_name),'[]'::jsonb)
  ) INTO result
  FROM (
    SELECT income_group,item_code,item_name,SUM(allocated_ugx) AS total_ugx
    FROM cornhill_school.finance_posted_income_allocations
    WHERE (received_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN p_start_date AND p_end_date
    GROUP BY income_group,item_code,item_name
  ) totals;
  RETURN result;
END;
$body$;

-- The receipt snapshot must reflect allocations as posted, NOT a mutable
-- catalogue price that could be revised later.
CREATE OR REPLACE FUNCTION cornhill_school.issue_payment_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE l record; receipt text; allocs jsonb; receiver_name text;
BEGIN
  IF NEW.status='Posted' AND OLD.status='Draft' THEN
    SELECT pupil_code,concat_ws(' ',first_name,middle_name,last_name) AS learner_name
    INTO l FROM cornhill_school.learners WHERE id=NEW.learner_id;
    SELECT COALESCE(NULLIF(btrim(sp.legal_name),''),sa.username) INTO receiver_name
    FROM cornhill_auth.staff_accounts sa
    LEFT JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
    WHERE sa.id=NEW.received_by_staff_id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fee_item',fc.item_name,'fee_item_code',fc.item_code,
      'income_group',fc.income_group,
      'term',at.term_name,'academic_year',ay.year_label,
      'charged_ugx',fo.amount_ugx,
      'allocated_ugx',pa.amount_ugx,
      'balance_after_ugx',GREATEST(fo.amount_ugx-(
        SELECT COALESCE(SUM(posted.amount_ugx),0)
        FROM (
          SELECT pa2.amount_ugx FROM cornhill_school.payment_allocations pa2
          JOIN cornhill_school.payment_records pr2 ON pr2.id=pa2.payment_id
          WHERE pa2.fee_obligation_id=fo.id AND pr2.status='Posted'
          UNION ALL
          SELECT pca.amount_ugx FROM cornhill_school.payment_credit_allocations pca
          JOIN cornhill_school.payment_records source ON source.id=pca.source_payment_id
          WHERE pca.fee_obligation_id=fo.id AND source.status='Posted'
        ) posted
      ),0)
    ) ORDER BY fc.income_group,ay.year_label,at.term_number,fc.item_name),'[]'::jsonb)
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
      'school_name','CORNHILL NURSERY AND PRIMARY SCHOOL',
      'pupil_code',l.pupil_code,'learner_name',l.learner_name,
      'amount_ugx',NEW.amount_ugx,'unallocated_amount_ugx',NEW.unallocated_amount_ugx,
      'collection_item',NEW.collection_item,'payer_name',NEW.payer_name,'currency',NEW.currency,
      'payment_method',NEW.payment_method,'mobile_money_provider',NEW.mobile_money_provider,
      'external_reference',NEW.external_reference,'received_at',NEW.received_at,
      'received_by_staff_id',NEW.received_by_staff_id,
      'received_by_staff_name',receiver_name,
      'allocations',allocs
    ));
    INSERT INTO cornhill_school.payment_notification_outbox(payment_id,guardian_contact_id,channel,destination_phone)
    SELECT NEW.id,gc.id,'sms',gc.phone_e164 FROM cornhill_school.guardian_contacts gc
    WHERE gc.learner_id=NEW.learner_id AND gc.is_active AND gc.sms_opt_in AND gc.phone_e164 IS NOT NULL
    ON CONFLICT(payment_id,guardian_contact_id,channel) DO NOTHING;
  ELSIF NEW.status='Reversed' AND OLD.status='Posted' THEN
    UPDATE cornhill_school.payment_notification_outbox
    SET status='cancelled',updated_at=now()
    WHERE payment_id=NEW.id AND status='queued';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_income_group_summary(uuid,date,date),
  cornhill_school.issue_payment_receipt() FROM PUBLIC, cornhill_auth_runtime, cornhill_auth_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_income_group_summary(uuid,date,date)
  TO cornhill_finance_runtime;
COMMIT;
