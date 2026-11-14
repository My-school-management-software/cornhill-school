-- Serialize bank balance checks across all transactions for the same account.
-- The transaction-row lock alone cannot prevent concurrent withdrawals on one account.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.verify_local_bank_transaction(
 p_actor uuid,p_transaction uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_row cornhill_school.bank_transactions%ROWTYPE;
 v_signed bigint;
 v_id uuid;
 v_opening_balance bigint;
 v_posted_balance bigint;
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify') THEN
  RAISE EXCEPTION 'Staff account lacks bank verification permission' USING ERRCODE='42501';
 END IF;

 SELECT * INTO v_row
 FROM cornhill_school.bank_transactions
 WHERE id=p_transaction
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Bank transaction was not found' USING ERRCODE='P0002';
 END IF;

 IF v_row.status='Verified' THEN
  SELECT id INTO v_id
  FROM cornhill_school.bank_ledger
  WHERE bank_transaction_id=p_transaction;
  RETURN v_id;
 END IF;
 IF v_row.status<>'Approved' THEN
  RAISE EXCEPTION 'Only approved bank transactions can be verified' USING ERRCODE='23514';
 END IF;
 IF v_row.evidence_request_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM cornhill_school.evidence_capture_requests e
  WHERE e.id=v_row.evidence_request_id
    AND e.context_type='bank_transaction'
    AND e.context_record_id=p_transaction
    AND e.status='Approved'
 ) THEN
  RAISE EXCEPTION 'Approved evidence is required before bank verification' USING ERRCODE='23514';
 END IF;

 -- All verifiers for this account must acquire this same row lock before reading
 -- the balance. This prevents two concurrent withdrawals spending the same funds.
 SELECT opening_balance_ugx INTO v_opening_balance
 FROM cornhill_school.bank_accounts
 WHERE id=v_row.bank_account_id AND is_active
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Bank account is unavailable' USING ERRCODE='P0002';
 END IF;

 v_signed:=CASE v_row.transaction_type
  WHEN 'Deposit' THEN v_row.amount_ugx
  ELSE -v_row.amount_ugx
 END;
 SELECT coalesce(sum(signed_amount_ugx),0) INTO v_posted_balance
 FROM cornhill_school.bank_ledger
 WHERE bank_account_id=v_row.bank_account_id;

 IF v_signed<0 AND v_opening_balance+v_posted_balance+v_signed<0 THEN
  RAISE EXCEPTION 'Withdrawal would make the verified bank balance negative' USING ERRCODE='23514';
 END IF;

 INSERT INTO cornhill_school.bank_ledger(
  bank_transaction_id,bank_account_id,transaction_type,amount_ugx,
  signed_amount_ugx,transaction_date,verified_by_staff_id,verified_at
 ) VALUES(
  p_transaction,v_row.bank_account_id,v_row.transaction_type,v_row.amount_ugx,
  v_signed,v_row.transaction_date,p_actor,now()
 )
 ON CONFLICT(bank_transaction_id) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id
  FROM cornhill_school.bank_ledger
  WHERE bank_transaction_id=p_transaction;
 END IF;

 UPDATE cornhill_school.bank_transactions
 SET status='Verified',verified_by_staff_id=p_actor,verified_at=now(),updated_at=now()
 WHERE id=p_transaction;
 INSERT INTO cornhill_school.bank_transaction_events(
  bank_transaction_id,actor_staff_id,event_code,details
 ) VALUES(
  p_transaction,p_actor,'bank_transaction.verified',
  jsonb_build_object('ledger_id',v_id)
 )
 ON CONFLICT DO NOTHING;
 RETURN v_id;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.verify_local_bank_transaction(uuid,uuid)
 FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.verify_local_bank_transaction(uuid,uuid)
 TO cornhill_finance_runtime;

COMMIT;
