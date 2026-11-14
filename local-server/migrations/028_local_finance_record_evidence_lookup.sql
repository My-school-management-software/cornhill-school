-- Actor-scoped, exact-record evidence request lookup for finance reviewers.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_record_evidence_requests(
 p_actor uuid,p_context text,p_record uuid
)
RETURNS TABLE(
 request_id uuid,
 purpose text,
 context_label text,
 amount_ugx bigint,
 status text,
 created_at timestamptz,
 assigned_staff_id uuid,
 requested_by_staff_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_can_review boolean; v_can_manage boolean;
BEGIN
 IF p_context NOT IN ('expense_request','bank_transaction') OR p_record IS NULL THEN
  RAISE EXCEPTION 'Evidence lookup context is invalid' USING ERRCODE='22023';
 END IF;
 SELECT
  EXISTS(SELECT 1 FROM cornhill_auth.staff_accounts sa
   JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
   JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
   JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
   WHERE sa.id=p_actor AND sa.account_status='active' AND sp.employment_status='Active'
    AND rp.permission_code='finance.evidence_review'),
  EXISTS(SELECT 1 FROM cornhill_auth.staff_accounts sa
   JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
   JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
   JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
   WHERE sa.id=p_actor AND sa.account_status='active' AND sp.employment_status='Active'
    AND rp.permission_code='finance.evidence_manage')
 INTO v_can_review,v_can_manage;
 IF NOT v_can_review AND NOT v_can_manage THEN
  RAISE EXCEPTION 'Staff account lacks financial evidence lookup permission' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT r.id,r.purpose,r.context_label,r.amount_ugx,r.status,r.created_at,
        r.assigned_staff_id,r.requested_by_staff_id
 FROM cornhill_school.evidence_capture_requests r
 WHERE r.context_type=p_context AND r.context_record_id=p_record
   AND r.status IN ('Pending','Submitted','Approved')
   AND (v_can_review OR p_actor IN (r.assigned_staff_id,r.requested_by_staff_id))
 ORDER BY r.created_at DESC,r.id
 LIMIT 50;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_record_evidence_requests(uuid,text,uuid)
 FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_record_evidence_requests(uuid,text,uuid)
 TO cornhill_finance_runtime;

COMMIT;
