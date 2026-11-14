-- CORNHILL append-only staff leave balance ledger; no automatic salary deductions.
BEGIN;
CREATE TABLE cornhill_school.staff_leave_balance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  leave_type text NOT NULL CHECK (leave_type IN ('Annual','Sick','Maternity','Paternity','Compassionate','Unpaid','Study','Other')),
  entry_type text NOT NULL CHECK (entry_type IN ('Accrual','Usage','Adjustment','Reversal')),
  days_delta numeric(7,2) NOT NULL CHECK (days_delta <> 0 AND days_delta BETWEEN -366 AND 366),
  effective_on date NOT NULL,
  source_leave_request_id uuid REFERENCES cornhill_school.staff_leave_requests(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 800),
  created_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  approved_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_balance_entry_sign_valid CHECK (
    (entry_type = 'Accrual' AND days_delta > 0)
    OR (entry_type = 'Usage' AND days_delta < 0 AND source_leave_request_id IS NOT NULL)
    OR (entry_type = 'Adjustment')
    OR (entry_type = 'Reversal' AND days_delta > 0)
  ),
  CONSTRAINT leave_balance_approval_separation CHECK (created_by_staff_id <> approved_by_staff_id)
);
CREATE UNIQUE INDEX staff_leave_usage_single_entry
  ON cornhill_school.staff_leave_balance_entries(source_leave_request_id)
  WHERE entry_type = 'Usage' AND source_leave_request_id IS NOT NULL;
CREATE INDEX staff_leave_balance_staff_effective_idx
  ON cornhill_school.staff_leave_balance_entries(staff_account_id,leave_type,effective_on);
CREATE FUNCTION cornhill_school.guard_staff_leave_balance_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, cornhill_school, cornhill_auth
AS $function$
DECLARE approver_status text; request_staff_id uuid; request_leave_type text; request_days numeric; request_status text; current_balance numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Staff leave balance ledger is append-only'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by_staff_id = NEW.approved_by_staff_id THEN
    RAISE EXCEPTION 'Leave balance entries require independent approval'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT account_status INTO approver_status FROM cornhill_auth.staff_accounts WHERE id = NEW.approved_by_staff_id;
  IF approver_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Leave balance entries require an active approver'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cornhill-leave-balance:' || NEW.staff_account_id::text || ':' || NEW.leave_type,0));
  SELECT COALESCE(sum(days_delta),0) INTO current_balance
  FROM cornhill_school.staff_leave_balance_entries
  WHERE staff_account_id=NEW.staff_account_id AND leave_type=NEW.leave_type;
  IF current_balance + NEW.days_delta < 0 THEN
    RAISE EXCEPTION 'Staff leave balance cannot become negative'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.entry_type = 'Usage' THEN
    SELECT staff_account_id,leave_type,requested_days,status
      INTO request_staff_id,request_leave_type,request_days,request_status
    FROM cornhill_school.staff_leave_requests
    WHERE id = NEW.source_leave_request_id;
    IF request_status IS DISTINCT FROM 'Approved'
       OR request_staff_id IS DISTINCT FROM NEW.staff_account_id
       OR request_leave_type IS DISTINCT FROM NEW.leave_type
       OR NEW.days_delta <> -request_days THEN
      RAISE EXCEPTION 'Leave usage must exactly match an approved request for the same staff member and leave type'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER staff_leave_balance_entry_guard
BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school.staff_leave_balance_entries
FOR EACH ROW EXECUTE FUNCTION cornhill_school.guard_staff_leave_balance_entry();
REVOKE ALL ON FUNCTION cornhill_school.guard_staff_leave_balance_entry() FROM PUBLIC;
REVOKE ALL ON TABLE cornhill_school.staff_leave_balance_entries FROM PUBLIC;
COMMIT;
