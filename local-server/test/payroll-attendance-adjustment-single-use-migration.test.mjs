import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("an attendance adjustment can be linked to only one payroll line item", async () => {
  const sql = await readFile(new URL("../migrations/050_local_payroll_attendance_adjustment_single_use.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX payroll_attendance_adjustment_single_use/);
  assert.match(sql, /ON cornhill_school\.payroll_line_items\(source_attendance_adjustment_id\)/);
  assert.match(sql, /WHERE source_attendance_adjustment_id IS NOT NULL/);
});
