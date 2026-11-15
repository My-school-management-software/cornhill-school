import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/039_local_attendance_incident_authority_guard.sql", import.meta.url), "utf8");

test("attendance incident authority migration is transactional and additive", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\.guard_attendance_incident_decision/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_attendance_incident_decision\(\) FROM PUBLIC/);
});

test("ordinary attendance statements require an active Headteacher or DOS", () => {
  assert.match(sql, /r\.role_code IN \('headteacher', 'director_of_studies'\)/);
  assert.match(sql, /a\.account_status = 'active'/);
  assert.match(sql, /Attendance incident statement must be recorded by an active Headteacher or Director of Studies/);
  assert.match(sql, /A recorded Headteacher\/DOS statement is immutable/);
});

test("ordinary attendance decisions require an active Director after the fixed review window", () => {
  assert.match(sql, /r\.role_code = 'director'/);
  assert.match(sql, /Only an active Director may decide an attendance incident/);
  assert.match(sql, /now\(\) < OLD\.review_deadline_at/);
  assert.match(sql, /Approved attendance deduction exceeds the configured daily rate/);
  assert.match(sql, /A decided attendance incident is immutable/);
});

test("incidents cannot be created with forged leadership review metadata", () => {
  assert.match(sql, /Attendance incidents must be created pending without leadership review metadata/);
  assert.match(sql, /NEW\.review_deadline_at := now\(\) \+ interval '120 minutes'/);
});
