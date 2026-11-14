-- CORNHILL staff leave request foundation and least-privilege capabilities.
BEGIN;
CREATE TABLE cornhill_school.staff_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_account_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  leave_type text NOT NULL CHECK (leave_type IN ('Annual','Sick','Maternity','Paternity','Compassionate','Unpaid','Study','Other')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  requested_days numeric(6,2) NOT NULL CHECK (requested_days > 0 AND requested_days <= 366),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 8 AND 1200),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Approved','Rejected','Cancelled')),
  requested_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  created_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  reviewed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_leave_dates_valid CHECK (ends_on >= starts_on),
  CONSTRAINT staff_leave_review_metadata CHECK (
    (status IN ('Draft','Cancelled') AND reviewed_by_staff_id IS NULL AND reviewed_at IS NULL)
    OR (status = 'Submitted' AND submitted_at IS NOT NULL AND reviewed_by_staff_id IS NULL AND reviewed_at IS NULL)
    OR (status IN ('Approved','Rejected') AND submitted_at IS NOT NULL AND reviewed_by_staff_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT staff_leave_rejection_note CHECK (status <> 'Rejected' OR length(trim(review_note)) >= 5)
);
CREATE INDEX staff_leave_requests_staff_dates_idx
  ON cornhill_school.staff_leave_requests(staff_account_id,starts_on DESC);
CREATE INDEX staff_leave_requests_review_queue_idx
  ON cornhill_school.staff_leave_requests(status,submitted_at)
  WHERE status = 'Submitted';
INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('staff.leave_manage','staff','Create and submit staff leave requests.',false),
 ('staff.leave_review','staff','Approve or reject staff leave requests independently.',true),
 ('staff.leave_balance_manage','staff','Record authorised leave balance accruals and adjustments.',true)
ON CONFLICT(permission_code) DO NOTHING;
REVOKE ALL ON TABLE cornhill_school.staff_leave_requests FROM PUBLIC;
COMMIT;
