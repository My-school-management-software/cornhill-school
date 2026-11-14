-- CORNHILL require new independent approval whenever a draft payroll item changes.
BEGIN;

CREATE FUNCTION cornhill_school.guard_payroll_line_item_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE
  approver_status text;
  financial_details_changed boolean;
BEGIN
  IF ROW(NEW.id, NEW.payroll_line_id, NEW.created_by_staff_id, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.payroll_line_id, OLD.created_by_staff_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Payroll line item identity and creator attribution cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  financial_details_changed :=
    ROW(NEW.item_type, NEW.item_code, NEW.description, NEW.amount_ugx, NEW.source_attendance_adjustment_id)
    IS DISTINCT FROM
    ROW(OLD.item_type, OLD.item_code, OLD.description, OLD.amount_ugx, OLD.source_attendance_adjustment_id);

  IF financial_details_changed THEN
    IF NEW.approved_by_staff_id IS NOT DISTINCT FROM OLD.approved_by_staff_id
       OR NEW.approved_at IS NOT NULL
       OR NEW.approved_by_staff_id = NEW.created_by_staff_id THEN
      RAISE EXCEPTION 'Changing a payroll line item requires a new independent approval'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT a.account_status INTO approver_status
    FROM cornhill_auth.staff_accounts a WHERE a.id = NEW.approved_by_staff_id;
    IF approver_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'A changed payroll line item requires an active new approver'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.approved_at := now();
  ELSE
    IF NEW.approved_by_staff_id IS DISTINCT FROM OLD.approved_by_staff_id
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Payroll item approval attribution cannot be rewritten without changing the item'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_line_item_reapproval_guard
BEFORE UPDATE ON cornhill_school.payroll_line_items
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_line_item_reapproval();

REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_line_item_reapproval() FROM PUBLIC;
COMMIT;
