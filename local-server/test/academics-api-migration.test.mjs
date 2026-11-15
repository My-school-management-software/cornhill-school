import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/077_local_academics_workspace_api.sql", import.meta.url), "utf8");

test("academic workspace migration is additive and transactional", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /ALTER TABLE cornhill_school\.assessments/);
  assert.match(sql, /CREATE TABLE cornhill_school\.academic_audit_events/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("academic history is append-only and captures assessment and mark changes", () => {
  assert.match(sql, /academic_audit_events_append_only/);
  assert.match(sql, /assessments_audit_capture/);
  assert.match(sql, /learner_marks_audit_capture/);
  assert.match(sql, /Academic audit events are append-only/);
});

test("assessment and mark writes are guarded by database lifecycle and learner scope", () => {
  assert.match(sql, /assessment_lifecycle_guard/);
  assert.match(sql, /OLD\.status = 'Draft' AND NEW\.status IN \('Open', 'Archived'\)/);
  assert.match(sql, /learner_mark_scope_guard/);
  assert.match(sql, /Marks can only be entered while an assessment is open/);
  assert.match(sql, /Learner was not enrolled in the assessment class on the assessment date/);
  assert.match(sql, /NEW\.max_score IS DISTINCT FROM assessment_max_score/);
  assert.match(sql, /FROM cornhill_school\.enrolment_periods ep/);
  assert.match(sql, /assessment_reference_date/);
});

test("runtime receives only column-scoped academic write permissions", () => {
  assert.match(sql, /GRANT INSERT \([\s\S]*?\) ON cornhill_school\.assessments TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT UPDATE \([\s\S]*?\) ON cornhill_school\.assessments TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT INSERT \([\s\S]*?\) ON cornhill_school\.learner_marks TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT UPDATE \([\s\S]*?\) ON cornhill_school\.learner_marks TO cornhill_auth_runtime/);
  assert.match(sql, /REVOKE ALL ON TABLE cornhill_school\.academic_audit_events FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT .* TO PUBLIC/i);
});