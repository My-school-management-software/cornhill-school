import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("attendance facts linked to payroll are frozen once the run leaves draft", async () => {
  const sql = await readFile(new URL("../migrations/051_local_attendance_payroll_basis_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_attendance_day_payroll_basis\(\)/);
  assert.match(sql, /NEW\.staff_account_id, NEW\.work_date, NEW\.first_clock_in, NEW\.last_clock_out/);
  assert.match(sql, /FROM cornhill_school\.attendance_adjustments aa/);
  assert.match(sql, /pli\.source_attendance_adjustment_id = aa\.id/);
  assert.match(sql, /pr\.run_status <> 'Draft'/);
  assert.match(sql, /Attendance facts linked to a non-draft payroll run cannot be changed/);
  assert.match(sql, /CREATE TRIGGER attendance_day_payroll_basis_guard\s+BEFORE UPDATE ON cornhill_school\.attendance_days/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_attendance_day_payroll_basis\(\) FROM PUBLIC/);
});
