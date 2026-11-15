-- Allow an approved expense to receive its evidence link before posting.
-- This is a forward-only correction to the reviewer attachment workflow.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.attach_local_finance_evidence(
 p_actor uuid,p_context text,p_record uuid,p_evidence uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_status text;
BEGIN
 IF p_context NOT IN ('expense_request','bank_transaction') OR p_record IS NULL OR p_evidence IS NULL THEN
  RAISE EXCEPTION 'Evidence attachment details are invalid' USING ERRCODE='22023';
 END IF;
 IF p_context='expense_request' AND NOT (
   cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_request')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review')
 ) THEN
  RAISE EXCEPTION 'Staff account lacks expense evidence attachment permission' USING ERRCODE='42501';
 ELSIF p_context='bank_transaction' AND NOT (
   cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review')
 ) THEN
  RAISE EXCEPTION 'Staff account lacks bank evidence attachment permission' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM cornhill_school.evidence_capture_requests
 WHERE id=p_evidence AND context_type=p_context AND context_record_id=p_record
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evidence request does not match this financial record' USING ERRCODE='23514'; END IF;
 SELECT status INTO v_status FROM cornhill_school.evidence_capture_requests WHERE id=p_evidence;
 IF v_status NOT IN ('Pending','Submitted','Approved') THEN
  RAISE EXCEPTION 'Evidence request is not attachable' USING ERRCODE='23514';
 END IF;
 IF p_context='expense_request' THEN
  UPDATE cornhill_school.expense_requests SET evidence_request_id=p_evidence,updated_at=now()
   WHERE id=p_record AND status IN ('Pending','Approved')
    AND (requested_by_staff_id=p_actor OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review'));
 ELSE
  UPDATE cornhill_school.bank_transactions SET evidence_request_id=p_evidence,updated_at=now()
   WHERE id=p_record AND status IN ('Pending','Approved')
    AND (requested_by_staff_id=p_actor OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review'));
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Financial record is not attachable by this actor' USING ERRCODE='42501'; END IF;
 RETURN p_evidence;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.attach_local_finance_evidence(uuid,text,uuid,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.attach_local_finance_evidence(uuid,text,uuid,uuid) TO cornhill_finance_runtime;

COMMIT;
