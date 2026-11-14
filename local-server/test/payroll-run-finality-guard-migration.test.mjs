import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/044_local_payroll_run_finality_guard.sql", import.meta.url), "utf8");

test("payroll run finality migration is transactional and additive", () => {
  assert.match(sql, /^--[\\s\\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /CREATE FUNCTION cornhill_school\\.guard_payroll_run_finality/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON cornhill_school\\.payroll_runs/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\\.guard_payroll_run_finality\\(\\) FROM PUBLIC/);
});

test("posted payroll can only be reversed without rewriting its approval identity", () => {
  assert.match(sql, /OLD\\.run_status = 'Posted'/);
  assert.match(sql, /NEW\\.run_status <> 'Reversed'/);
  assert.match(sql, /IS DISTINCT FROM ROW/);
  assert.match(sql, /Posted payroll identity and approval history cannot be rewritten during reversal/);
  assert.match(sql, /Payroll reversal requires an audit reason/);
  assert.match(sql, /Payroll reversal time is assigned by the database/);
});

test("reversed payroll is immutable and posted or reversed runs cannot be deleted", () => {
  assert.match(sql, /OLD\\.run_status = 'Reversed'/);
  assert.match(sql, /Reversed payroll runs are immutable/);
  assert.match(sql, /OLD\\.run_status IN \\('Posted', 'Reversed'\\)/);
  assert.match(sql, /Posted or reversed payroll runs cannot be deleted/);
});
