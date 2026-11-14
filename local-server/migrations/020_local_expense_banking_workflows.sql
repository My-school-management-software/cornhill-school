-- CORNHILL expense and banking transaction workflows.
-- All transitions run inside one PostgreSQL transaction; callers cannot write tables directly.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_actor_has_permission(
 p_actor uuid,p_permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM cornhill_auth.staff_accounts sa
  JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
  JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
  JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
  WHERE sa.id=p_actor AND sa.account_status='active'
    AND sp.employment_status='Active' AND rp.permission_code=p_permission
 )
$fn$;


CREATE OR REPLACE FUNCTION cornhill_school.set_local_expense_operator_limit(
 p_actor uuid,p_staff uuid,p_daily_limit bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF p_daily_limit IS NULL OR p_daily_limit<=0 THEN
  RAISE EXCEPTION 'Daily expense limit must be a positive UGX amount' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_manage') THEN
  RAISE EXCEPTION 'Staff account lacks expense limit administration permission' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cornhill_auth.staff_accounts sa
  JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
  WHERE sa.id=p_staff AND sa.account_status='active' AND sp.employment_status='Active') THEN
  RAISE EXCEPTION 'Expense limit must be assigned to active staff' USING ERRCODE='22023';
 END IF;
 INSERT INTO cornhill_school.finance_operator_limits(staff_account_id,daily_limit_ugx,updated_by_staff_id)
 VALUES(p_staff,p_daily_limit,p_actor)
 ON CONFLICT(staff_account_id) DO UPDATE
 SET daily_limit_ugx=EXCLUDED.daily_limit_ugx,is_active=true,
     updated_by_staff_id=EXCLUDED.updated_by_staff_id,updated_at=now()
 RETURNING id INTO v_id;
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.create_local_bank_account(
 p_actor uuid,p_account_name text,p_bank_name text,p_last4 text,p_opening_balance bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF length(btrim(coalesce(p_account_name,''))) NOT BETWEEN 2 AND 120 OR
    length(btrim(coalesce(p_bank_name,''))) NOT BETWEEN 2 AND 120 OR
    p_last4 !~ '^[0-9]{4}
 p_actor uuid,p_request_number text,p_category uuid,p_description text,p_amount bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_limit bigint; v_day date; v_total bigint; v_id uuid;
BEGIN
 IF p_actor IS NULL OR p_category IS NULL OR p_amount IS NULL OR p_amount<=0
    OR length(btrim(coalesce(p_request_number,''))) NOT BETWEEN 4 AND 40
    OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 5 AND 500 THEN
  RAISE EXCEPTION 'Expense request details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_request') THEN
  RAISE EXCEPTION 'Staff account lacks expense request permission' USING ERRCODE='42501';
 END IF;
 v_day:=(timezone('Africa/Kampala',now()))::date;
 -- Lock the operator's limit row to serialize concurrent submissions for this operator/day.
 SELECT daily_limit_ugx INTO v_limit FROM cornhill_school.finance_operator_limits
 WHERE staff_account_id=p_actor AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No active daily expense limit is configured' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cornhill_school.expense_categories WHERE id=p_category AND is_active) THEN
  RAISE EXCEPTION 'Expense category is unavailable' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(sum(amount_ugx),0) INTO v_total
 FROM cornhill_school.expense_requests
 WHERE requested_by_staff_id=p_actor AND expense_date=v_day AND status<>'Cancelled';
 IF v_total+p_amount>v_limit THEN
  RAISE EXCEPTION 'Daily expense limit would be exceeded' USING ERRCODE='23514';
 END IF;
 INSERT INTO cornhill_school.expense_requests(request_number,category_id,requested_by_staff_id,description,amount_ugx,expense_date)
 VALUES(btrim(p_request_number),p_category,p_actor,btrim(p_description),p_amount,v_day)
 RETURNING id INTO v_id;
 INSERT INTO cornhill_school.expense_request_events(expense_request_id,actor_staff_id,event_code,details)
 VALUES(v_id,p_actor,'expense.requested',jsonb_build_object('amount_ugx',p_amount,'business_date',v_day));
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.review_local_expense_request(
 p_actor uuid,p_request uuid,p_decision text,p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.expense_requests%ROWTYPE; v_status text;
BEGIN
 IF p_decision NOT IN ('Approved','Rejected') OR
    (p_decision='Rejected' AND length(btrim(coalesce(p_note,'')))<5) OR
    (p_note IS NOT NULL AND length(p_note)>500) THEN
  RAISE EXCEPTION 'Expense review decision or note is invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review') THEN
  RAISE EXCEPTION 'Staff account lacks expense review permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.expense_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'Pending' THEN
  RAISE EXCEPTION 'Expense request is not awaiting review' USING ERRCODE='23514';
 END IF;
 IF v_row.requested_by_staff_id=p_actor THEN
  RAISE EXCEPTION 'An expense requester cannot approve or reject their own request' USING ERRCODE='42501';
 END IF;
 UPDATE cornhill_school.expense_requests
 SET status=p_decision,reviewed_by_staff_id=p_actor,reviewed_at=now(),
     review_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
 WHERE id=p_request;
 INSERT INTO cornhill_school.expense_request_events(expense_request_id,actor_staff_id,event_code,details)
 VALUES(p_request,p_actor,CASE p_decision WHEN 'Approved' THEN 'expense.approved' ELSE 'expense.rejected' END,
        jsonb_build_object('note',nullif(btrim(coalesce(p_note,'')),'')));
 RETURN p_decision;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.post_local_expense(
 p_actor uuid,p_request uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.expense_requests%ROWTYPE; v_id uuid;
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post') THEN
  RAISE EXCEPTION 'Staff account lacks expense posting permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.expense_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expense request was not found' USING ERRCODE='P0002'; END IF;
 IF v_row.status='Posted' THEN
  SELECT id INTO v_id FROM cornhill_school.expense_ledger WHERE expense_request_id=p_request;
  RETURN v_id;
 END IF;
 IF v_row.status<>'Approved' THEN
  RAISE EXCEPTION 'Only approved expense requests can be posted' USING ERRCODE='23514';
 END IF;
 IF v_row.evidence_request_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM cornhill_school.evidence_capture_requests e
  WHERE e.id=v_row.evidence_request_id AND e.context_type='expense_request'
    AND e.context_record_id=p_request AND e.status='Approved'
 ) THEN
  RAISE EXCEPTION 'Approved evidence is required before expense posting' USING ERRCODE='23514';
 END IF;
 INSERT INTO cornhill_school.expense_ledger(
  expense_request_id,category_id,amount_ugx,description,expense_date,posted_by_staff_id
 ) VALUES(v_row.id,v_row.category_id,v_row.amount_ugx,v_row.description,v_row.expense_date,p_actor)
 ON CONFLICT(expense_request_id) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM cornhill_school.expense_ledger WHERE expense_request_id=p_request;
 END IF;
 UPDATE cornhill_school.expense_requests SET status='Posted',updated_at=now() WHERE id=p_request;
 INSERT INTO cornhill_school.expense_request_events(expense_request_id,actor_staff_id,event_code,details)
 VALUES(p_request,p_actor,'expense.posted',jsonb_build_object('ledger_id',v_id))
 ON CONFLICT DO NOTHING;
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.create_local_bank_transaction(
 p_actor uuid,p_account uuid,p_type text,p_amount bigint,p_description text,p_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF p_type NOT IN ('Deposit','Withdrawal') OR p_amount IS NULL OR p_amount<=0
    OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 5 AND 500
    OR (p_reference IS NOT NULL AND length(p_reference)>120) THEN
  RAISE EXCEPTION 'Bank transaction details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage') THEN
  RAISE EXCEPTION 'Staff account lacks banking management permission' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cornhill_school.bank_accounts WHERE id=p_account AND is_active) THEN
  RAISE EXCEPTION 'Bank account is unavailable' USING ERRCODE='P0002';
 END IF;
 INSERT INTO cornhill_school.bank_transactions(
  bank_account_id,transaction_type,amount_ugx,description,external_reference,requested_by_staff_id
 ) VALUES(p_account,p_type,p_amount,btrim(p_description),nullif(btrim(coalesce(p_reference,'')),''),p_actor)
 RETURNING id INTO v_id;
 INSERT INTO cornhill_school.bank_transaction_events(bank_transaction_id,actor_staff_id,event_code,details)
 VALUES(v_id,p_actor,'bank_transaction.requested',jsonb_build_object('amount_ugx',p_amount,'type',p_type));
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.review_local_bank_transaction(
 p_actor uuid,p_transaction uuid,p_decision text,p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.bank_transactions%ROWTYPE;
BEGIN
 IF p_decision NOT IN ('Approved','Rejected') OR
    (p_decision='Rejected' AND length(btrim(coalesce(p_note,'')))<5) OR
    (p_note IS NOT NULL AND length(p_note)>500) THEN
  RAISE EXCEPTION 'Bank transaction decision or note is invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review') THEN
  RAISE EXCEPTION 'Staff account lacks banking review permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.bank_transactions WHERE id=p_transaction FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'Pending' THEN
  RAISE EXCEPTION 'Bank transaction is not awaiting review' USING ERRCODE='23514';
 END IF;
 IF v_row.requested_by_staff_id=p_actor THEN
  RAISE EXCEPTION 'A transaction entrant cannot approve or reject their own transaction' USING ERRCODE='42501';
 END IF;
 UPDATE cornhill_school.bank_transactions
 SET status=p_decision,reviewed_by_staff_id=p_actor,reviewed_at=now(),
     review_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
 WHERE id=p_transaction;
 INSERT INTO cornhill_school.bank_transaction_events(bank_transaction_id,actor_staff_id,event_code,details)
 VALUES(p_transaction,p_actor,
  CASE p_decision WHEN 'Approved' THEN 'bank_transaction.approved' ELSE 'bank_transaction.rejected' END,
  jsonb_build_object('note',nullif(btrim(coalesce(p_note,'')),'')));
 RETURN p_decision;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.verify_local_bank_transaction(
 p_actor uuid,p_transaction uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.bank_transactions%ROWTYPE; v_signed bigint; v_id uuid;
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify') THEN
  RAISE EXCEPTION 'Staff account lacks bank verification permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.bank_transactions WHERE id=p_transaction FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank transaction was not found' USING ERRCODE='P0002'; END IF;
 IF v_row.status='Verified' THEN
  SELECT id INTO v_id FROM cornhill_school.bank_ledger WHERE bank_transaction_id=p_transaction;
  RETURN v_id;
 END IF;
 IF v_row.status<>'Approved' THEN
  RAISE EXCEPTION 'Only approved bank transactions can be verified' USING ERRCODE='23514';
 END IF;
 IF v_row.evidence_request_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM cornhill_school.evidence_capture_requests e
  WHERE e.id=v_row.evidence_request_id AND e.context_type='bank_transaction'
    AND e.context_record_id=p_transaction AND e.status='Approved'
 ) THEN
  RAISE EXCEPTION 'Approved evidence is required before bank verification' USING ERRCODE='23514';
 END IF;
 v_signed:=CASE v_row.transaction_type WHEN 'Deposit' THEN v_row.amount_ugx ELSE -v_row.amount_ugx END;
 IF v_signed<0 AND (
  (SELECT opening_balance_ugx FROM cornhill_school.bank_accounts WHERE id=v_row.bank_account_id)
  + (SELECT coalesce(sum(signed_amount_ugx),0) FROM cornhill_school.bank_ledger WHERE bank_account_id=v_row.bank_account_id)
  + v_signed < 0
 ) THEN RAISE EXCEPTION 'Withdrawal would make the verified bank balance negative' USING ERRCODE='23514'; END IF;
 INSERT INTO cornhill_school.bank_ledger(
  bank_transaction_id,bank_account_id,transaction_type,amount_ugx,signed_amount_ugx,
  transaction_date,verified_by_staff_id,verified_at
 ) VALUES(p_transaction,v_row.bank_account_id,v_row.transaction_type,v_row.amount_ugx,
          v_signed,v_row.transaction_date,p_actor,now())
 ON CONFLICT(bank_transaction_id) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM cornhill_school.bank_ledger WHERE bank_transaction_id=p_transaction;
 END IF;
 UPDATE cornhill_school.bank_transactions
 SET status='Verified',verified_by_staff_id=p_actor,verified_at=now(),updated_at=now()
 WHERE id=p_transaction;
 INSERT INTO cornhill_school.bank_transaction_events(bank_transaction_id,actor_staff_id,event_code,details)
 VALUES(p_transaction,p_actor,'bank_transaction.verified',jsonb_build_object('ledger_id',v_id))
 ON CONFLICT DO NOTHING;
 RETURN v_id;
END $fn$;


CREATE OR REPLACE FUNCTION cornhill_school.attach_local_finance_evidence(
 p_actor uuid,p_context text,p_record uuid,p_evidence uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_requester uuid; v_status text;
BEGIN
 IF p_context NOT IN ('expense_request','bank_transaction') OR p_record IS NULL OR p_evidence IS NULL THEN
  RAISE EXCEPTION 'Evidence attachment details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,
   CASE p_context WHEN 'expense_request' THEN 'finance.expenses_request' ELSE 'finance.banking_manage' END) THEN
  RAISE EXCEPTION 'Staff account lacks permission to attach financial evidence' USING ERRCODE='42501';
 END IF;
 SELECT requested_by_staff_id INTO v_requester
 FROM cornhill_school.evidence_capture_requests
 WHERE id=p_evidence AND context_type=p_context AND context_record_id=p_record
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evidence request does not match this financial record' USING ERRCODE='23514'; END IF;
 SELECT status INTO v_status FROM cornhill_school.evidence_capture_requests WHERE id=p_evidence;
 IF v_status NOT IN ('Pending','Submitted','Approved') THEN
  RAISE EXCEPTION 'Evidence request is not attachable' USING ERRCODE='23514';
 END IF;
 IF p_context='expense_request' THEN
  UPDATE cornhill_school.expense_requests SET evidence_request_id=p_evidence,updated_at=now()
   WHERE id=p_record AND requested_by_staff_id=p_actor AND status='Pending';
 ELSE
  UPDATE cornhill_school.bank_transactions SET evidence_request_id=p_evidence,updated_at=now()
   WHERE id=p_record AND requested_by_staff_id=p_actor AND status IN ('Pending','Approved');
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Financial record is not owned by this actor or is no longer attachable' USING ERRCODE='42501'; END IF;
 RETURN p_evidence;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_actor_has_permission(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.attach_local_finance_evidence(uuid,text,uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.set_local_expense_operator_limit(uuid,uuid,bigint) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.create_local_bank_account(uuid,text,text,text,bigint) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.create_local_expense_request(uuid,text,uuid,text,bigint) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.review_local_expense_request(uuid,uuid,text,text) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.post_local_expense(uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.create_local_bank_transaction(uuid,uuid,text,bigint,text,text) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.review_local_bank_transaction(uuid,uuid,text,text) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.verify_local_bank_transaction(uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.set_local_expense_operator_limit(uuid,uuid,bigint),
 cornhill_school.create_local_bank_account(uuid,text,text,text,bigint),
 cornhill_school.create_local_expense_request(uuid,text,uuid,text,bigint),
 cornhill_school.review_local_expense_request(uuid,uuid,text,text),
 cornhill_school.post_local_expense(uuid,uuid),
 cornhill_school.create_local_bank_transaction(uuid,uuid,text,bigint,text,text),
 cornhill_school.review_local_bank_transaction(uuid,uuid,text,text),
 cornhill_school.verify_local_bank_transaction(uuid,uuid),
 cornhill_school.attach_local_finance_evidence(uuid,text,uuid,uuid)
 TO cornhill_finance_runtime;

COMMIT;
 OR p_opening_balance IS NULL OR p_opening_balance<0 THEN
  RAISE EXCEPTION 'Bank account details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage') THEN
  RAISE EXCEPTION 'Staff account lacks banking management permission' USING ERRCODE='42501';
 END IF;
 INSERT INTO cornhill_school.bank_accounts(
  account_name,bank_name,account_number_last4,opening_balance_ugx,created_by_staff_id
 ) VALUES(btrim(p_account_name),btrim(p_bank_name),p_last4,p_opening_balance,p_actor)
 RETURNING id INTO v_id;
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.create_local_expense_request(
 p_actor uuid,p_request_number text,p_category uuid,p_description text,p_amount bigint
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_limit bigint; v_day date; v_total bigint; v_id uuid;
BEGIN
 IF p_actor IS NULL OR p_category IS NULL OR p_amount IS NULL OR p_amount<=0
    OR length(btrim(coalesce(p_request_number,''))) NOT BETWEEN 4 AND 40
    OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 5 AND 500 THEN
  RAISE EXCEPTION 'Expense request details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_request') THEN
  RAISE EXCEPTION 'Staff account lacks expense request permission' USING ERRCODE='42501';
 END IF;
 v_day:=(timezone('Africa/Kampala',now()))::date;
 -- Lock the operator's limit row to serialize concurrent submissions for this operator/day.
 SELECT daily_limit_ugx INTO v_limit FROM cornhill_school.finance_operator_limits
 WHERE staff_account_id=p_actor AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No active daily expense limit is configured' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cornhill_school.expense_categories WHERE id=p_category AND is_active) THEN
  RAISE EXCEPTION 'Expense category is unavailable' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(sum(amount_ugx),0) INTO v_total
 FROM cornhill_school.expense_requests
 WHERE requested_by_staff_id=p_actor AND expense_date=v_day AND status<>'Cancelled';
 IF v_total+p_amount>v_limit THEN
  RAISE EXCEPTION 'Daily expense limit would be exceeded' USING ERRCODE='23514';
 END IF;
 INSERT INTO cornhill_school.expense_requests(request_number,category_id,requested_by_staff_id,description,amount_ugx,expense_date)
 VALUES(btrim(p_request_number),p_category,p_actor,btrim(p_description),p_amount,v_day)
 RETURNING id INTO v_id;
 INSERT INTO cornhill_school.expense_request_events(expense_request_id,actor_staff_id,event_code,details)
 VALUES(v_id,p_actor,'expense.requested',jsonb_build_object('amount_ugx',p_amount,'business_date',v_day));
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.review_local_expense_request(
 p_actor uuid,p_request uuid,p_decision text,p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.expense_requests%ROWTYPE; v_status text;
BEGIN
 IF p_decision NOT IN ('Approved','Rejected') OR
    (p_decision='Rejected' AND length(btrim(coalesce(p_note,'')))<5) OR
    (p_note IS NOT NULL AND length(p_note)>500) THEN
  RAISE EXCEPTION 'Expense review decision or note is invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review') THEN
  RAISE EXCEPTION 'Staff account lacks expense review permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.expense_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'Pending' THEN
  RAISE EXCEPTION 'Expense request is not awaiting review' USING ERRCODE='23514';
 END IF;
 IF v_row.requested_by_staff_id=p_actor THEN
  RAISE EXCEPTION 'An expense requester cannot approve or reject their own request' USING ERRCODE='42501';
 END IF;
 UPDATE cornhill_school.expense_requests
 SET status=p_decision,reviewed_by_staff_id=p_actor,reviewed_at=now(),
     review_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
 WHERE id=p_request;
 INSERT INTO cornhill_school.expense_request_events(expense_request_id,actor_staff_id,event_code,details)
 VALUES(p_request,p_actor,CASE p_decision WHEN 'Approved' THEN 'expense.approved' ELSE 'expense.rejected' END,
        jsonb_build_object('note',nullif(btrim(coalesce(p_note,'')),'')));
 RETURN p_decision;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.post_local_expense(
 p_actor uuid,p_request uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.expense_requests%ROWTYPE; v_id uuid;
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post') THEN
  RAISE EXCEPTION 'Staff account lacks expense posting permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.expense_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expense request was not found' USING ERRCODE='P0002'; END IF;
 IF v_row.status='Posted' THEN
  SELECT id INTO v_id FROM cornhill_school.expense_ledger WHERE expense_request_id=p_request;
  RETURN v_id;
 END IF;
 IF v_row.status<>'Approved' THEN
  RAISE EXCEPTION 'Only approved expense requests can be posted' USING ERRCODE='23514';
 END IF;
 IF v_row.evidence_request_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM cornhill_school.evidence_capture_requests e
  WHERE e.id=v_row.evidence_request_id AND e.context_type='expense_request'
    AND e.context_record_id=p_request AND e.status='Approved'
 ) THEN
  RAISE EXCEPTION 'Approved evidence is required before expense posting' USING ERRCODE='23514';
 END IF;
 INSERT INTO cornhill_school.expense_ledger(
  expense_request_id,category_id,amount_ugx,description,expense_date,posted_by_staff_id
 ) VALUES(v_row.id,v_row.category_id,v_row.amount_ugx,v_row.description,v_row.expense_date,p_actor)
 ON CONFLICT(expense_request_id) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM cornhill_school.expense_ledger WHERE expense_request_id=p_request;
 END IF;
 UPDATE cornhill_school.expense_requests SET status='Posted',updated_at=now() WHERE id=p_request;
 INSERT INTO cornhill_school.expense_request_events(expense_request_id,actor_staff_id,event_code,details)
 VALUES(p_request,p_actor,'expense.posted',jsonb_build_object('ledger_id',v_id))
 ON CONFLICT DO NOTHING;
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.create_local_bank_transaction(
 p_actor uuid,p_account uuid,p_type text,p_amount bigint,p_description text,p_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF p_type NOT IN ('Deposit','Withdrawal') OR p_amount IS NULL OR p_amount<=0
    OR length(btrim(coalesce(p_description,''))) NOT BETWEEN 5 AND 500
    OR (p_reference IS NOT NULL AND length(p_reference)>120) THEN
  RAISE EXCEPTION 'Bank transaction details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage') THEN
  RAISE EXCEPTION 'Staff account lacks banking management permission' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cornhill_school.bank_accounts WHERE id=p_account AND is_active) THEN
  RAISE EXCEPTION 'Bank account is unavailable' USING ERRCODE='P0002';
 END IF;
 INSERT INTO cornhill_school.bank_transactions(
  bank_account_id,transaction_type,amount_ugx,description,external_reference,requested_by_staff_id
 ) VALUES(p_account,p_type,p_amount,btrim(p_description),nullif(btrim(coalesce(p_reference,'')),''),p_actor)
 RETURNING id INTO v_id;
 INSERT INTO cornhill_school.bank_transaction_events(bank_transaction_id,actor_staff_id,event_code,details)
 VALUES(v_id,p_actor,'bank_transaction.requested',jsonb_build_object('amount_ugx',p_amount,'type',p_type));
 RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.review_local_bank_transaction(
 p_actor uuid,p_transaction uuid,p_decision text,p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.bank_transactions%ROWTYPE;
BEGIN
 IF p_decision NOT IN ('Approved','Rejected') OR
    (p_decision='Rejected' AND length(btrim(coalesce(p_note,'')))<5) OR
    (p_note IS NOT NULL AND length(p_note)>500) THEN
  RAISE EXCEPTION 'Bank transaction decision or note is invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review') THEN
  RAISE EXCEPTION 'Staff account lacks banking review permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.bank_transactions WHERE id=p_transaction FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'Pending' THEN
  RAISE EXCEPTION 'Bank transaction is not awaiting review' USING ERRCODE='23514';
 END IF;
 IF v_row.requested_by_staff_id=p_actor THEN
  RAISE EXCEPTION 'A transaction entrant cannot approve or reject their own transaction' USING ERRCODE='42501';
 END IF;
 UPDATE cornhill_school.bank_transactions
 SET status=p_decision,reviewed_by_staff_id=p_actor,reviewed_at=now(),
     review_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
 WHERE id=p_transaction;
 INSERT INTO cornhill_school.bank_transaction_events(bank_transaction_id,actor_staff_id,event_code,details)
 VALUES(p_transaction,p_actor,
  CASE p_decision WHEN 'Approved' THEN 'bank_transaction.approved' ELSE 'bank_transaction.rejected' END,
  jsonb_build_object('note',nullif(btrim(coalesce(p_note,'')),'')));
 RETURN p_decision;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.verify_local_bank_transaction(
 p_actor uuid,p_transaction uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_row cornhill_school.bank_transactions%ROWTYPE; v_signed bigint; v_id uuid;
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify') THEN
  RAISE EXCEPTION 'Staff account lacks bank verification permission' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM cornhill_school.bank_transactions WHERE id=p_transaction FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank transaction was not found' USING ERRCODE='P0002'; END IF;
 IF v_row.status='Verified' THEN
  SELECT id INTO v_id FROM cornhill_school.bank_ledger WHERE bank_transaction_id=p_transaction;
  RETURN v_id;
 END IF;
 IF v_row.status<>'Approved' THEN
  RAISE EXCEPTION 'Only approved bank transactions can be verified' USING ERRCODE='23514';
 END IF;
 IF v_row.evidence_request_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM cornhill_school.evidence_capture_requests e
  WHERE e.id=v_row.evidence_request_id AND e.context_type='bank_transaction'
    AND e.context_record_id=p_transaction AND e.status='Approved'
 ) THEN
  RAISE EXCEPTION 'Approved evidence is required before bank verification' USING ERRCODE='23514';
 END IF;
 v_signed:=CASE v_row.transaction_type WHEN 'Deposit' THEN v_row.amount_ugx ELSE -v_row.amount_ugx END;
 IF v_signed<0 AND (
  (SELECT opening_balance_ugx FROM cornhill_school.bank_accounts WHERE id=v_row.bank_account_id)
  + (SELECT coalesce(sum(signed_amount_ugx),0) FROM cornhill_school.bank_ledger WHERE bank_account_id=v_row.bank_account_id)
  + v_signed < 0
 ) THEN RAISE EXCEPTION 'Withdrawal would make the verified bank balance negative' USING ERRCODE='23514'; END IF;
 INSERT INTO cornhill_school.bank_ledger(
  bank_transaction_id,bank_account_id,transaction_type,amount_ugx,signed_amount_ugx,
  transaction_date,verified_by_staff_id,verified_at
 ) VALUES(p_transaction,v_row.bank_account_id,v_row.transaction_type,v_row.amount_ugx,
          v_signed,v_row.transaction_date,p_actor,now())
 ON CONFLICT(bank_transaction_id) DO NOTHING
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  SELECT id INTO v_id FROM cornhill_school.bank_ledger WHERE bank_transaction_id=p_transaction;
 END IF;
 UPDATE cornhill_school.bank_transactions
 SET status='Verified',verified_by_staff_id=p_actor,verified_at=now(),updated_at=now()
 WHERE id=p_transaction;
 INSERT INTO cornhill_school.bank_transaction_events(bank_transaction_id,actor_staff_id,event_code,details)
 VALUES(p_transaction,p_actor,'bank_transaction.verified',jsonb_build_object('ledger_id',v_id))
 ON CONFLICT DO NOTHING;
 RETURN v_id;
END $fn$;


CREATE OR REPLACE FUNCTION cornhill_school.attach_local_finance_evidence(
 p_actor uuid,p_context text,p_record uuid,p_evidence uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_requester uuid; v_status text;
BEGIN
 IF p_context NOT IN ('expense_request','bank_transaction') OR p_record IS NULL OR p_evidence IS NULL THEN
  RAISE EXCEPTION 'Evidence attachment details are invalid' USING ERRCODE='22023';
 END IF;
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,
   CASE p_context WHEN 'expense_request' THEN 'finance.expenses_request' ELSE 'finance.banking_manage' END) THEN
  RAISE EXCEPTION 'Staff account lacks permission to attach financial evidence' USING ERRCODE='42501';
 END IF;
 SELECT requested_by_staff_id INTO v_requester
 FROM cornhill_school.evidence_capture_requests
 WHERE id=p_evidence AND context_type=p_context AND context_record_id=p_record
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evidence request does not match this financial record' USING ERRCODE='23514'; END IF;
 SELECT status INTO v_status FROM cornhill_school.evidence_capture_requests WHERE id=p_evidence;
 IF v_status NOT IN ('Pending','Submitted','Approved') THEN
  RAISE EXCEPTION 'Evidence request is not attachable' USING ERRCODE='23514';
 END IF;
 IF p_context='expense_request' THEN
  UPDATE cornhill_school.expense_requests SET evidence_request_id=p_evidence,updated_at=now()
   WHERE id=p_record AND requested_by_staff_id=p_actor AND status='Pending';
 ELSE
  UPDATE cornhill_school.bank_transactions SET evidence_request_id=p_evidence,updated_at=now()
   WHERE id=p_record AND requested_by_staff_id=p_actor AND status IN ('Pending','Approved');
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Financial record is not owned by this actor or is no longer attachable' USING ERRCODE='42501'; END IF;
 RETURN p_evidence;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_actor_has_permission(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.attach_local_finance_evidence(uuid,text,uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.create_local_expense_request(uuid,text,uuid,text,bigint) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.review_local_expense_request(uuid,uuid,text,text) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.post_local_expense(uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.create_local_bank_transaction(uuid,uuid,text,bigint,text,text) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.review_local_bank_transaction(uuid,uuid,text,text) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.verify_local_bank_transaction(uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.create_local_expense_request(uuid,text,uuid,text,bigint),
 cornhill_school.review_local_expense_request(uuid,uuid,text,text),
 cornhill_school.post_local_expense(uuid,uuid),
 cornhill_school.create_local_bank_transaction(uuid,uuid,text,bigint,text,text),
 cornhill_school.review_local_bank_transaction(uuid,uuid,text,text),
 cornhill_school.verify_local_bank_transaction(uuid,uuid),
 cornhill_school.attach_local_finance_evidence(uuid,text,uuid,uuid)
 TO cornhill_finance_runtime;

COMMIT;
