import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/045_local_attendance_event_evidence_guard.sql", import.meta.url), "utf8");

test("attendance event evidence guard is transactional and additive", () => {
  assert.ok(sql.startsWith("--"));
  assert.ok(sql.includes("BEGIN;"));
  assert.ok(sql.trimEnd().endsWith("COMMIT;"));
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
  assert.ok(sql.includes("CREATE FUNCTION cornhill_school.guard_attendance_event_review"));
  assert.ok(sql.includes("BEFORE UPDATE OR DELETE ON cornhill_school.attendance_events"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION cornhill_school.guard_attendance_event_review() FROM PUBLIC"));
});

test("raw attendance event identity and evidence cannot be rewritten", () => {
  assert.ok(sql.includes("Imported attendance event evidence is immutable"));
  for (const field of ["import_batch_id", "device_id", "staff_account_id", "device_staff_identifier",
    "external_event_id", "event_type", "occurred_at", "source_type", "created_at"]) {
    assert.ok(sql.includes("NEW." + field), "Expected immutable event field: " + field);
  }
  assert.ok(sql.includes("Attendance event evidence cannot be deleted"));
});

test("attendance events receive one independent decision from an active reviewer", () => {
  assert.ok(sql.includes("OLD.review_status <> 'Pending'"));
  assert.ok(sql.includes("NEW.review_status NOT IN ('Verified', 'Rejected')"));
  assert.ok(sql.includes("NEW.reviewed_by_staff_id = NEW.staff_account_id"));
  assert.ok(sql.includes("reviewer_status IS DISTINCT FROM 'active'"));
  assert.ok(sql.includes("NEW.reviewed_at := now()"));
  assert.ok(sql.includes("NEW.reviewed_at IS NOT NULL"));
});
