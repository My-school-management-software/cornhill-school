import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/038_local_special_session_assignment_integrity.sql", import.meta.url), "utf8");

test("assignment integrity migration is additive and transactional", () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\.guard_special_session_assignment/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("only active staff may be assigned and assignments cannot target cancelled sessions", () => {
  assert.match(sql, /session_status = 'Cancelled'/);
  assert.match(sql, /staff_status IS DISTINCT FROM 'active'/);
  assert.match(sql, /assigner_status IS DISTINCT FROM 'active'/);
});

test("assignments cannot be removed or reassigned after attendance exists", () => {
  assert.match(sql, /FROM cornhill_school\.staff_scheduled_session_attendance sa/);
  assert.match(sql, /TG_OP = 'DELETE' AND attendance_exists/);
  assert.match(sql, /TG_OP = 'UPDATE'/);
  assert.match(sql, /A staff assignment linked to attendance cannot be reassigned/);
});

test("assignment integrity guard covers insert update delete and revokes public execution", () => {
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_special_session_assignment\(\) FROM PUBLIC/);
});
