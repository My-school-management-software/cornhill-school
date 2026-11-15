import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("active salary agreement date ranges cannot overlap per staff member", async () => {
  const sql = await readFile(new URL("../migrations/047_local_salary_agreement_range_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_salary_agreement_effective_range\(\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /existing\.staff_account_id = NEW\.staff_account_id/);
  assert.match(sql, /existing\.is_active/);
  assert.match(sql, /daterange\(existing\.effective_from, COALESCE\(existing\.effective_to, 'infinity'::date\), '\[\]'\)/);
  assert.match(sql, /daterange\(NEW\.effective_from, COALESCE\(NEW\.effective_to, 'infinity'::date\), '\[\]'\)/);
  assert.match(sql, /A salary agreement cannot be reassigned/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_salary_agreement_effective_range\(\) FROM PUBLIC/);
});
