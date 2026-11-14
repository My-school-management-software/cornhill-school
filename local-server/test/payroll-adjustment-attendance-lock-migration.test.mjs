import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("payroll attendance-adjustment linkage is serialized and keeps its approved provenance", async () => {
  const sql = await readFile(new URL("../migrations/053_local_payroll_adjustment_attendance_lock.sql", import.meta.url), "utf8");

  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\.validate_payroll_line_item\(\)/);
  assert.match(sql, /SET search_path = pg_catalog, cornhill_school/);
  assert.match(sql, /NEW\.source_attendance_adjustment_id IS DISTINCT FROM OLD\.source_attendance_adjustment_id/);
  assert.match(sql, /Payroll attendance adjustment provenance cannot be replaced/);
  assert.match(sql, /FOR UPDATE OF ad/);
  assert.match(sql, /linked_adjustment_status IS DISTINCT FROM 'Approved'/);
  assert.match(sql, /Attendance-related payroll adjustments require separate approval/);
  assert.match(sql, /FOR UPDATE OF pr/);
  assert.match(sql, /run_status IS DISTINCT FROM 'Draft'/);
  assert.match(sql, /Payroll items can only be added to a draft payroll run/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.validate_payroll_line_item\(\) FROM PUBLIC/);
});
