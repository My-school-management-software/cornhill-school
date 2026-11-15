-- Complete the permission catalog for local expense and banking workflows.
-- Earlier workflow functions already enforced these codes; this makes them assignable.
BEGIN;
INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('finance.expenses_request','finance','Create and view own school expense requests and matching evidence.',true),
 ('finance.expenses_review','finance','Independently approve or reject school expense requests and attach matching evidence.',true),
 ('finance.banking_manage','finance','Manage school bank accounts and create bank transaction requests.',true),
 ('finance.banking_review','finance','Independently approve or reject school bank transaction requests.',true)
ON CONFLICT(permission_code) DO NOTHING;
COMMIT;
