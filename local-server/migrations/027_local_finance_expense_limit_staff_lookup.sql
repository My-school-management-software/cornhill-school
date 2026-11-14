-- Permission-scoped active staff directory for expense-limit administration.
BEGIN;

CREATE OR REPLACE FUNCTION cornhill_school.finance_list_expense_limit_staff(p_actor uuid)
RETURNS TABLE(
 staff_account_id uuid,
 staff_number text,
 legal_name text,
 job_title text,
 daily_limit_ugx bigint,
 limit_is_active boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
BEGIN
 IF NOT cornhill_school.finance_actor_has_permission(p_actor,'finance.expenses_manage') THEN
  RAISE EXCEPTION 'Staff account lacks expense limit administration permission' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT sa.id,sp.staff_number,sp.legal_name,sp.job_title,
        fol.daily_limit_ugx,COALESCE(fol.is_active,false)
 FROM cornhill_auth.staff_accounts sa
 JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=sa.id
 LEFT JOIN cornhill_school.finance_operator_limits fol ON fol.staff_account_id=sa.id
 WHERE sa.account_status='active' AND sp.employment_status='Active'
 ORDER BY sp.legal_name,sp.staff_number
 LIMIT 250;
END $fn$;

REVOKE ALL ON FUNCTION cornhill_school.finance_list_expense_limit_staff(uuid)
 FROM PUBLIC,cornhill_auth_runtime,cornhill_auth_api,cornhill_finance_runtime,cornhill_finance_api;
GRANT EXECUTE ON FUNCTION cornhill_school.finance_list_expense_limit_staff(uuid)
 TO cornhill_finance_runtime;

COMMIT;
