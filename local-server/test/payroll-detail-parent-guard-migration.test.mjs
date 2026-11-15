import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("payroll detail rows cannot escape their original run after posting", async () => {
  const sql = await readFile(new URL("../migrations/048_local_payroll_detail_parent_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_payroll_line_parent_identity\(\)/);
  assert.match(sql, /FROM cornhill_school\.payroll_runs pr\s+WHERE pr\.id = OLD\.payroll_run_id\s+FOR UPDATE/);
  assert.match(sql, /NEW\.payroll_run_id IS DISTINCT FROM OLD\.payroll_run_id/);
  assert.match(sql, /CREATE TRIGGER payroll_line_parent_identity_guard\s+BEFORE UPDATE ON cornhill_school\.payroll_lines/);
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_payroll_item_parent_identity\(\)/);
  assert.match(sql, /WHERE pl\.id = OLD\.payroll_line_id\s+FOR UPDATE OF pr/);
  assert.match(sql, /NEW\.payroll_line_id IS DISTINCT FROM OLD\.payroll_line_id/);
  assert.match(sql, /CREATE TRIGGER payroll_line_item_parent_identity_guard\s+BEFORE UPDATE ON cornhill_school\.payroll_line_items/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_payroll_line_parent_identity\(\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_payroll_item_parent_identity\(\) FROM PUBLIC/);
});
