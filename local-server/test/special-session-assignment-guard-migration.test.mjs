import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/037_local_special_session_assignment_guard.sql", import.meta.url), "utf8");

test("special-session assignment guard is transactional and additive", () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\.guard_scheduled_session_attendance_assignment/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("attendance requires an approved and published session", () => {
  assert.match(sql, /session_status IS DISTINCT FROM 'Approved'/);
  assert.match(sql, /session_published IS DISTINCT FROM true/);
});

test("attendance requires explicit assignment of the same staff member to the session", () => {
  assert.match(sql, /a\.prep_session_id = NEW\.session_id/);
  assert.match(sql, /a\.staff_account_id = NEW\.staff_account_id/);
  assert.match(sql, /Staff member must be explicitly assigned/);
});

test("assignment is checked on attendance insert and reassignment", () => {
  assert.match(sql, /BEFORE INSERT OR UPDATE OF session_id, staff_account_id/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_scheduled_session_attendance_assignment\(\) FROM PUBLIC/);
});
