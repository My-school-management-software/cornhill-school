-- CORNHILL payroll payment register; this records evidence and never transfers money.
BEGIN;
CREATE TABLE cornhill_school.payroll_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id uuid NOT NULL REFERENCES cornhill_school.payroll_lines(id) ON DELETE RESTRICT,
  amount_ugx bigint NOT NULL CHECK (amount_ugx > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('Cash','Bank Transfer','Mobile Money')),
  external_reference text,
  paid_at timestamptz NOT NULL,
  recorded_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  disbursement_status text NOT NULL DEFAULT 'Pending Verification'
    CHECK (disbursement_status IN ('Pending Verification','Verified','Rejected')),
  verified_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
  verified_at timestamptz,
  verification_note text CHECK (verification_note IS NULL OR length(verification_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_disbursement_reference_required CHECK (
    payment_method='Cash' OR length(trim(COALESCE(external_reference,''))) BETWEEN 3 AND 120
  ),
  CONSTRAINT payroll_disbursement_review_metadata CHECK (
    (disbursement_status='Pending Verification' AND verified_by_staff_id IS NULL AND verified_at IS NULL)
    OR (disbursement_status IN ('Verified','Rejected') AND verified_by_staff_id IS NOT NULL AND verified_at IS NOT NULL)
  )
);
CREATE INDEX payroll_disbursements_line_status_idx
  ON cornhill_school.payroll_disbursements(payroll_line_id,disbursement_status);
CREATE UNIQUE INDEX payroll_disbursement_external_reference_unique
  ON cornhill_school.payroll_disbursements(payment_method,external_reference)
  WHERE external_reference IS NOT NULL AND length(trim(external_reference))>0;
INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('staff.payroll_disbursements_manage','staff','Record payroll payments made by cash, bank or mobile money.',true),
 ('staff.payroll_disbursements_verify','staff','Independently verify or reject recorded payroll payments.',true)
ON CONFLICT(permission_code) DO NOTHING;
REVOKE ALL ON TABLE cornhill_school.payroll_disbursements FROM PUBLIC;
COMMIT;
