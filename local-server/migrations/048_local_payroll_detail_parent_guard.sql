-- CORNHILL prevent payroll detail rows from being moved out of a non-draft run.
-- Existing draft-only guards protect edits in place; this closes the old-parent escape route.
BEGIN;

CREATE FUNCTION cornhill_school.guard_payroll_line_parent_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  old_run_status text;
BEGIN
  SELECT pr.run_status INTO old_run_status
  FROM cornhill_school.payroll_runs pr
  WHERE pr.id = OLD.payroll_run_id
  FOR UPDATE;

  IF old_run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll line details cannot be changed after their original run leaves draft'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.payroll_run_id IS DISTINCT FROM OLD.payroll_run_id THEN
    RAISE EXCEPTION 'A payroll line cannot be moved to another payroll run'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_line_parent_identity_guard
BEFORE UPDATE ON cornhill_school.payroll_lines
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_line_parent_identity();

CREATE FUNCTION cornhill_school.guard_payroll_item_parent_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school
AS $function$
DECLARE
  old_run_status text;
BEGIN
  SELECT pr.run_status INTO old_run_status
  FROM cornhill_school.payroll_lines pl
  JOIN cornhill_school.payroll_runs pr ON pr.id = pl.payroll_run_id
  WHERE pl.id = OLD.payroll_line_id
  FOR UPDATE OF pr;

  IF old_run_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Payroll items cannot be changed after their original run leaves draft'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.payroll_line_id IS DISTINCT FROM OLD.payroll_line_id THEN
    RAISE EXCEPTION 'A payroll item cannot be moved to another payroll line'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER payroll_line_item_parent_identity_guard
BEFORE UPDATE ON cornhill_school.payroll_line_items
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_payroll_item_parent_identity();

REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_line_parent_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_item_parent_identity() FROM PUBLIC;

COMMIT;
