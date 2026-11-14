-- CORNHILL finance audit history for expense and bank records.
-- Reuses append-only workflow and evidence events; no duplicate audit table.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_record_history(
 p_actor uuid,p_context text,p_record uuid
) RETURNS TABLE(
 event_id uuid,event_code text,actor_staff_id uuid,actor_name text,
 occurred_at timestamptz,note text,details jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 IF p_actor IS NULL OR p_record IS NULL OR p_context NOT IN ('expense_request','bank_transaction') THEN
  RAISE EXCEPTION 'Finance history lookup details are invalid' USING ERRCODE='22023';
 END IF;
 IF p_context='expense_request' AND NOT (
   cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_request')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post')
 ) THEN RAISE EXCEPTION 'Staff account lacks expense history permission' USING ERRCODE='42501'; END IF;
 IF p_context='bank_transaction' AND NOT (
   cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify')
 ) THEN RAISE EXCEPTION 'Staff account lacks banking history permission' USING ERRCODE='42501'; END IF;

 IF p_context='expense_request' AND NOT EXISTS(
   SELECT 1 FROM cornhill_school.expense_requests e
   WHERE e.id=p_record AND (
     e.requested_by_staff_id=p_actor OR
     cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review') OR
     cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post')
   )
 ) THEN RAISE EXCEPTION 'Expense history record was not found' USING ERRCODE='P0002'; END IF;
 IF p_context='bank_transaction' AND NOT EXISTS(
   SELECT 1 FROM cornhill_school.bank_transactions b
   WHERE b.id=p_record AND (
     b.requested_by_staff_id=p_actor OR
     cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review') OR
     cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify')
   )
 ) THEN RAISE EXCEPTION 'Bank history record was not found' USING ERRCODE='P0002'; END IF;

 RETURN QUERY
 WITH events AS (
  SELECT e.id,e.event_code,e.actor_staff_id,e.occurred_at,
         nullif(e.details->>'note','') AS note,e.details
  FROM cornhill_school.expense_request_events e
  WHERE p_context='expense_request' AND e.expense_request_id=p_record
  UNION ALL
  SELECT e.id,e.event_code,e.actor_staff_id,e.occurred_at,
         nullif(e.details->>'note','') AS note,e.details
  FROM cornhill_school.bank_transaction_events e
  WHERE p_context='bank_transaction' AND e.bank_transaction_id=p_record
  UNION ALL
  SELECT e.id,e.event_code,e.actor_staff_id,e.occurred_at,
         nullif(e.details->>'note','') AS note,e.details
  FROM cornhill_school.evidence_capture_events e
  JOIN cornhill_school.evidence_capture_requests r ON r.id=e.request_id
  WHERE r.context_type=p_context AND r.context_record_id=p_record
 )
 SELECT ev.id,ev.event_code,ev.actor_staff_id,
        coalesce(sp.legal_name,'Staff account'),ev.occurred_at,ev.note,ev.details
 FROM events ev
 LEFT JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=ev.actor_staff_id
 ORDER BY ev.occurred_at DESC,ev.id DESC
 LIMIT 100;
END
$fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_record_history(uuid,text,uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_record_history(uuid,text,uuid) TO cornhill_finance_runtime;

COMMIT;
