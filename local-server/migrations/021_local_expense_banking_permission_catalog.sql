-- Complete the permission catalog required by local expense and banking workflows.
-- Additive correction: migrations 001-020 remain unchanged.
BEGIN;

INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('finance.expenses_manage','finance','Configure staff expense limits and manage expense categories.',true),
 ('finance.expenses_post','finance','Post an approved and evidenced expense to the immutable expense ledger.',true),
 ('finance.banking_verify','finance','Verify evidenced bank transactions and post them to the bank ledger.',true)
ON CONFLICT(permission_code) DO NOTHING;

COMMIT;
