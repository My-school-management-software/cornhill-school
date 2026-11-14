import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/043_local_attendance_adjustment_independent_review.sql", import.meta.url), "utf8");

test("attendance adjustment independent-review migration is transactional and non-destructive", () => {
  assert.match(sql, /^--[\\s\\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\\.guard_attendance_adjustment_history/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\\.guard_attendance_adjustment_history\\(\\) FROM PUBLIC/);
});

test("both approval and rejection require independent active review", () => {
  assert.match(sql, /NEW\\.approved_by_staff_id = NEW\\.requested_by_staff_id/);
  assert.match(sql, /requester cannot approve or reject their own attendance adjustment/);
  assert.match(sql, /reviewer_is_active IS DISTINCT FROM true/);
  assert.match(sql, /OLD\\.adjustment_status <> 'Pending'/);
});
