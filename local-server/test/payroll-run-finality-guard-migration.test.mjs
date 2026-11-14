import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/044_local_payroll_run_finality_guard.sql", import.meta.url), "utf8");

test("payroll run finality migration is transactional and additive", () => {
  assert.ok(sql.startsWith("--"));
  assert.ok(sql.includes("BEGIN;"));
  assert.ok(sql.trimEnd().endsWith("COMMIT;"));
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.ok(sql.includes("CREATE FUNCTION cornhill_school.guard_payroll_run_finality"));
  assert.ok(sql.includes("BEFORE UPDATE OR DELETE ON cornhill_school.payroll_runs"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION cornhill_school.guard_payroll_run_finality() FROM PUBLIC"));
});

test("posted payroll can only be reversed without rewriting its approval identity", () => {
  assert.ok(sql.includes("OLD.run_status = 'Posted'"));
  assert.ok(sql.includes("NEW.run_status <> 'Reversed'"));
  assert.ok(sql.includes("IS DISTINCT FROM ROW"));
  assert.ok(sql.includes("Posted payroll identity and approval history cannot be rewritten during reversal"));
  assert.ok(sql.includes("Payroll reversal requires an audit reason"));
  assert.ok(sql.includes("Payroll reversal time is assigned by the database"));
});

test("reversed payroll is immutable and posted or reversed runs cannot be deleted", () => {
  assert.ok(sql.includes("OLD.run_status = 'Reversed'"));
  assert.ok(sql.includes("Reversed payroll runs are immutable"));
  assert.ok(sql.includes("OLD.run_status IN ('Posted', 'Reversed')"));
  assert.ok(sql.includes("Posted or reversed payroll runs cannot be deleted"));
});
