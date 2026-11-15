-- CORNHILL guardian account issuance and audited learner-link approval.
-- Privileges are column-scoped. The API additionally requires the explicit,
-- high-risk guardians.access_approve staff permission.
BEGIN;

GRANT SELECT (id, learner_id, guardian_name, phone_e164, is_active)
  ON cornhill_school.guardian_contacts TO cornhill_auth_runtime;

GRANT INSERT (guardian_name, phone_e164, pin_hash, account_status, pin_changed_at)
  ON cornhill_auth.guardian_accounts TO cornhill_auth_runtime;

GRANT UPDATE (pin_hash, pin_changed_at, account_status, updated_at)
  ON cornhill_auth.guardian_accounts TO cornhill_auth_runtime;

GRANT INSERT (
  guardian_account_id, learner_id, access_status,
  approved_by_staff_id, approved_at, revoked_at
) ON cornhill_auth.guardian_learner_access TO cornhill_auth_runtime;

GRANT UPDATE (
  access_status, approved_by_staff_id, approved_at, revoked_at
) ON cornhill_auth.guardian_learner_access TO cornhill_auth_runtime;

GRANT INSERT (target_type, target_id)
  ON cornhill_auth.security_audit_events TO cornhill_auth_runtime;

COMMIT;
