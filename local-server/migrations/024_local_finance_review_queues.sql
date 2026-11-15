-- Permission-scoped review queues for local expenses and bank transactions.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_expense_review_queue(p_actor uuid)
RETURNS TABLE(
 id uuid,request_number text,category_name text,description text,amount_ugx bigint,
 expense_date date,status text,requested_by_staff_id uuid,evidence_request_id uuid,review_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review')
    AND NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post') THEN
  RAISE EXCEPTION 'Staff account lacks expense review queue access' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT e.id,e.request_number,c.category_name,e.description,e.amount_ugx,e.expense_date,e.status,
        e.requested_by_staff_id,e.evidence_request_id,e.review_note
 FROM cornhill_school.expense_requests e
 JOIN cornhill_school.expense_categories c ON c.id=e.category_id
 WHERE (e.status='Pending' AND cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review'))
    OR (e.status='Approved' AND cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post'))
 ORDER BY e.created_at ASC
 LIMIT 100;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_bank_review_queue(p_actor uuid)
RETURNS TABLE(
 id uuid,bank_account_id uuid,account_name text,bank_name text,account_number_last4 char(4),
 transaction_type text,amount_ugx bigint,description text,external_reference text,
 transaction_date date,status text,requested_by_staff_id uuid,evidence_request_id uuid,review_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review')
    AND NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify') THEN
  RAISE EXCEPTION 'Staff account lacks banking review queue access' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT t.id,t.bank_account_id,a.account_name,a.bank_name,a.account_number_last4,
        t.transaction_type,t.amount_ugx,t.description,t.external_reference,t.transaction_date,
        t.status,t.requested_by_staff_id,t.evidence_request_id,t.review_note
 FROM cornhill_school.bank_transactions t
 JOIN cornhill_school.bank_accounts a ON a.id=t.bank_account_id
 WHERE (t.status='Pending' AND cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review'))
    OR (t.status='Approved' AND cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify'))
 ORDER BY t.created_at ASC
 LIMIT 100;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_expense_review_queue(uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.finance_list_bank_review_queue(uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_expense_review_queue(uuid) TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_bank_review_queue(uuid) TO cornhill_finance_runtime;

COMMIT;
