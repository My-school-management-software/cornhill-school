import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/034_local_saturday_attendance_hours.sql", import.meta.url), "utf8");

test("Saturday attendance policy correction is transactional and non-destructive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("school-wide Saturday attendance hours are set to the confirmed 08:00–13:00 window", () => {
  assert.match(sql, /UPDATE cornhill_school\.staff_attendance_policy_settings/);
  assert.match(sql, /saturday_start_time = '08:00'/);
  assert.match(sql, /saturday_end_time = '13:00'/);
  assert.match(sql, /WHERE id = true/);
});
