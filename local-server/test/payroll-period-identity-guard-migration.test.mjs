import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("payroll period identity is locked after a payroll run exists", async () => {
  const sql = await readFile(new URL("../migrations/046_local_payroll_period_identity_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_payroll_period_identity\(\)/);
  assert.match(sql, /ROW\(NEW\.period_code, NEW\.starts_on, NEW\.ends_on, NEW\.payment_date\)/);
  assert.match(sql, /FROM cornhill_school\.payroll_runs pr\s+WHERE pr\.payroll_period_id = OLD\.id/);
  assert.match(sql, /BEFORE UPDATE OF period_code, starts_on, ends_on, payment_date/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_payroll_period_identity\(\) FROM PUBLIC/);
  assert.match(sql, /ERRCODE = 'check_violation'/);
});
