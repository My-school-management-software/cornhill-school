import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/042_local_attendance_adjustment_history_guard.sql", import.meta.url), "utf8");

test("attendance adjustment history migration is transactional and additive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /CREATE TRIGGER attendance_adjustment_history_guard\s+BEFORE INSERT OR UPDATE OR DELETE ON cornhill_school\.attendance_adjustments/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_attendance_adjustment_history\(\) FROM PUBLIC/);
});

test("attendance adjustment submissions and decisions preserve review history", () => {
  assert.match(sql, /Submitted attendance adjustment details are immutable/);
  assert.match(sql, /An attendance adjustment decision is final and cannot be rewritten/);
  assert.match(sql, /Attendance adjustment requests cannot be deleted/);
  assert.match(sql, /reviewer_is_active IS DISTINCT FROM true/);
  assert.match(sql, /must begin pending and undecided/);
});
