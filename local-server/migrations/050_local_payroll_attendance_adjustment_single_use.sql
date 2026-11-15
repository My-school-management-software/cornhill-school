-- CORNHILL an approved attendance adjustment may be linked to payroll only once.
-- This prevents accidental duplicate allowance/deduction entries across payroll runs.
BEGIN;

CREATE UNIQUE INDEX payroll_attendance_adjustment_single_use
  ON cornhill_school.payroll_line_items(source_attendance_adjustment_id)
  WHERE source_attendance_adjustment_id IS NOT NULL;

COMMIT;
