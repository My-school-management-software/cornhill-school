-- Actor-scoped private evidence file lookup. Storage keys never leave this API.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_get_evidence_file(
  p_actor_staff_id uuid,
  p_file_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE v_file record; v_can_review boolean; v_can_manage boolean;
BEGIN
  SELECT
    EXISTS(
      SELECT 1 FROM cornhill_auth.staff_accounts sa
      JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
      JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
      JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
      WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
        AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_review'
    ),
    EXISTS(
      SELECT 1 FROM cornhill_auth.staff_accounts sa
      JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id=sa.id
      JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code=ra.role_code
      JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
      WHERE sa.id=p_actor_staff_id AND sa.account_status='active'
        AND sp.employment_status='Active' AND rp.permission_code='finance.evidence_manage'
    )
  INTO v_can_review,v_can_manage;

  IF NOT v_can_review AND NOT v_can_manage THEN
    RAISE EXCEPTION 'Staff account lacks permission to access financial evidence' USING ERRCODE='42501';
  END IF;

  SELECT f.storage_object_key,f.sha256,f.content_type,f.original_file_name,
         r.assigned_staff_id,r.requested_by_staff_id
  INTO v_file
  FROM cornhill_school.evidence_capture_files f
  JOIN cornhill_school.evidence_capture_requests r ON r.id=f.request_id
  WHERE f.id=p_file_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT v_can_review AND p_actor_staff_id NOT IN(v_file.assigned_staff_id,v_file.requested_by_staff_id) THEN
    RAISE EXCEPTION 'Evidence file is outside this staff member scope' USING ERRCODE='42501';
  END IF;

  RETURN jsonb_build_object(
    'storage_object_key',v_file.storage_object_key,
    'sha256',v_file.sha256,
    'content_type',v_file.content_type,
    'original_file_name',v_file.original_file_name
  );
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_get_evidence_file(uuid,uuid)
  FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_get_evidence_file(uuid,uuid)
  TO cornhill_finance_runtime;

COMMIT;
