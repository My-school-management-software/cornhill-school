import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("attendance-backed staff schedule assignments retain their historical basis", async () => {
  const sql = await readFile(new URL("../migrations/049_local_staff_schedule_history_guard.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE FUNCTION cornhill_school\.guard_staff_schedule_assignment_history\(\)/);
  assert.match(sql, /NEW\.schedule_id, NEW\.starts_on, NEW\.ends_on, NEW\.saturday_required/);
  assert.match(sql, /FROM cornhill_school\.attendance_days ad/);
  assert.match(sql, /ad\.staff_account_id = OLD\.staff_account_id/);
  assert.match(sql, /ad\.work_date >= OLD\.starts_on/);
  assert.match(sql, /A schedule assignment with recorded attendance history cannot be changed or deleted/);
  assert.match(sql, /CREATE TRIGGER staff_schedule_assignment_history_guard\s+BEFORE UPDATE OR DELETE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.guard_staff_schedule_assignment_history\(\) FROM PUBLIC/);
});
