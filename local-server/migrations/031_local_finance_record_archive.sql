-- CORNHILL searchable archive for completed and historical expense/bank records.
-- Access remains scoped to the signed-in staff member's active finance permissions.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_record_archive(
 p_actor uuid,
 p_record_type text DEFAULT 'all',
 p_status text DEFAULT 'all',
 p_search text DEFAULT NULL,
 p_limit integer DEFAULT 50,
 p_offset integer DEFAULT 0
) RETURNS TABLE(
 record_type text,record_id uuid,reference text,title text,status text,
 amount_ugx bigint,business_date date,requested_by_name text,created_at timestamptz,updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
 v_expense_access boolean;
 v_expense_all boolean;
 v_bank_access boolean;
 v_bank_all boolean;
 v_search text;
BEGIN
 IF p_actor IS NULL
    OR p_record_type NOT IN ('all','expense','bank')
    OR p_status NOT IN ('all','Pending','Approved','Rejected','Posted','Cancelled','Verified')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
    OR (p_search IS NOT NULL AND length(btrim(p_search))>80) THEN
  RAISE EXCEPTION 'Finance archive filters are invalid' USING ERRCODE='22023';
 END IF;
 v_expense_access :=
   cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_request')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post');
 v_expense_all :=
   cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_post');
 v_bank_access :=
   cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify');
 v_bank_all :=
   cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review')
   OR cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify');
 IF NOT v_expense_access AND NOT v_bank_access THEN
  RAISE EXCEPTION 'Staff account lacks finance archive permission' USING ERRCODE='42501';
 END IF;
 v_search:=nullif(btrim(coalesce(p_search,'')),'');
 RETURN QUERY
 WITH archive_rows AS (
  SELECT 'expense'::text AS kind,e.id,e.request_number::text AS ref,
         c.category_name::text AS heading,e.status,e.amount_ugx,e.expense_date AS business_date,
         coalesce(sp.legal_name,'Staff account')::text AS requested_by,
         e.created_at,e.updated_at
  FROM cornhill_school.expense_requests e
  JOIN cornhill_school.expense_categories c ON c.id=e.category_id
  LEFT JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=e.requested_by_staff_id
  WHERE v_expense_access AND (v_expense_all OR e.requested_by_staff_id=p_actor)
    AND p_record_type IN ('all','expense')
    AND (p_status='all' OR e.status=p_status)
    AND (v_search IS NULL OR e.request_number ILIKE '%'||v_search||'%' OR
         e.description ILIKE '%'||v_search||'%' OR c.category_name ILIKE '%'||v_search||'%')
  UNION ALL
  SELECT 'bank'::text,b.id,
         coalesce(b.external_reference,'BANK-'||left(b.id::text,8))::text,
         (ba.bank_name||' · '||ba.account_name||' · •••• '||ba.account_number_last4)::text,
         b.status,b.amount_ugx,b.transaction_date,
         coalesce(sp.legal_name,'Staff account')::text,b.created_at,b.updated_at
  FROM cornhill_school.bank_transactions b
  JOIN cornhill_school.bank_accounts ba ON ba.id=b.bank_account_id
  LEFT JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=b.requested_by_staff_id
  WHERE v_bank_access AND (v_bank_all OR b.requested_by_staff_id=p_actor)
    AND p_record_type IN ('all','bank')
    AND (p_status='all' OR b.status=p_status)
    AND (v_search IS NULL OR coalesce(b.external_reference,'') ILIKE '%'||v_search||'%' OR
         b.description ILIKE '%'||v_search||'%' OR ba.bank_name ILIKE '%'||v_search||'%' OR
         ba.account_name ILIKE '%'||v_search||'%' OR ba.account_number_last4::text ILIKE '%'||v_search||'%')
 )
 SELECT kind,id,ref,heading,status,amount_ugx,business_date,requested_by,created_at,updated_at
 FROM archive_rows
 ORDER BY created_at DESC,id DESC
 LIMIT p_limit OFFSET p_offset;
END
$fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_record_archive(uuid,text,text,text,integer,integer)
 FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_record_archive(uuid,text,text,text,integer,integer)
 TO cornhill_finance_runtime;

COMMIT;
