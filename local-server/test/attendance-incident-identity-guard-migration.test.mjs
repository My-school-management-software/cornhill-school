import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/040_local_attendance_incident_identity_guard.sql", import.meta.url), "utf8");

test("attendance incident identity migration is transactional and additive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_attendance_incident_identity/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON cornhill_school\.staff_attendance_incidents/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_attendance_incident_identity\(\) FROM PUBLIC/);
});

test("attendance incident identity and detection evidence cannot be rewritten", () => {
  for (const field of ["attendance_day_id", "staff_account_id", "attendance_date", "incident_type", "detected_at", "created_at"]) {
    assert.match(sql, new RegExp("NEW\\." + field + " IS DISTINCT FROM OLD\\." + field));
  }
  assert.match(sql, /Attendance incident identity and detection evidence are immutable/);
});

test("attendance incident review history cannot be deleted", () => {
  assert.match(sql, /IF TG_OP = 'DELETE'/);
  assert.match(sql, /Attendance incidents cannot be deleted; use a separately audited correction workflow/);
});
