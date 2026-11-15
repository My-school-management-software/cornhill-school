-- Read-only picklists for the authenticated expense and banking workspace.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_expense_categories(p_actor uuid)
RETURNS TABLE(id uuid,category_code text,category_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_request')
    AND NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_review')
    AND NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_manage') THEN
  RAISE EXCEPTION 'Staff account lacks expense category access' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT c.id,c.category_code,c.category_name
 FROM cornhill_school.expense_categories c WHERE c.is_active ORDER BY c.category_name;
END $fn$;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_bank_accounts(p_actor uuid)
RETURNS TABLE(id uuid,account_name text,bank_name text,account_number_last4 text,opening_balance_ugx bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_manage')
    AND NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_review')
    AND NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.banking_verify') THEN
  RAISE EXCEPTION 'Staff account lacks bank account access' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT b.id,b.account_name,b.bank_name,b.account_number_last4,b.opening_balance_ugx
 FROM cornhill_school.bank_accounts b WHERE b.is_active ORDER BY b.bank_name,b.account_name;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_expense_categories(uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL ON FUNCTION cornhill_school.finance_list_bank_accounts(uuid) FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_expense_categories(uuid) TO cornhill_finance_runtime;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_bank_accounts(uuid) TO cornhill_finance_runtime;

COMMIT;
