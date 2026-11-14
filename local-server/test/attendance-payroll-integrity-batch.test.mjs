import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../migrations/", import.meta.url);
const files = [
  "054_local_attendance_device_staff_mapping.sql",
  "055_local_attendance_event_mapping_guard.sql",
  "056_local_attendance_import_batch_finality.sql",
  "057_local_attendance_device_identity_guard.sql",
  "058_local_attendance_incident_day_identity.sql",
  "059_local_salary_agreement_history_guard.sql",
  "060_local_employment_term_range_history_guard.sql",
  "061_local_work_schedule_definition_history_guard.sql",
  "062_local_payroll_attendance_source_employee_period_guard.sql",
  "063_local_payroll_line_item_reapproval_guard.sql"
];
const sql = Object.fromEntries(await Promise.all(files.map(async name => [
  name, await readFile(new URL(name, root), "utf8")
])));

test("ten connected attendance/payroll migrations are transactional and forward-only", () => {
  assert.equal(files.length, 10);
  for (const [name, source] of Object.entries(sql)) {
    assert.match(source, /\\bBEGIN;/, name);
    assert.match(source, /COMMIT;\\s*$/, name);
    assert.doesNotMatch(source, /\\bDROP\\s+(TABLE|SCHEMA|COLUMN)\\b|\\bTRUNCATE\\b/i, name);
  }
});

test("fingerprint mapping and device-event ingestion preserve verified staff identity", () => {
  assert.match(sql[files[0]], /CREATE TABLE cornhill_school\\.attendance_device_staff_mappings/);
  assert.match(sql[files[0]], /pg_advisory_xact_lock/);
  assert.match(sql[files[0]], /daterange\\(existing\\.effective_from/);
  assert.match(sql[files[0]], /mapped_staff_status IS DISTINCT FROM 'active'/);
  assert.match(sql[files[0]], /Fingerprint staff mapping identity cannot be reassigned/);
  assert.match(sql[files[1]], /batch_status IS DISTINCT FROM 'Processing'/);
  assert.match(sql[files[1]], /NEW\\.staff_account_id := mapped_staff_id/);
  assert.match(sql[files[1]], /Africa\\/Kampala/);
  assert.match(sql[files[1]], /New attendance events must begin pending independent review/);
});

test("attendance import lifecycle reconciles source, counts and retained events", () => {
  assert.match(sql[files[2]], /Attendance import batch status transition is invalid/);
  assert.match(sql[files[2]], /Completed or failed attendance import batches are immutable/);
  assert.match(sql[files[2]], /NEW\\.rows_accepted \\+ NEW\\.rows_rejected <> NEW\\.rows_received/);
  assert.match(sql[files[2]], /event_count <> NEW\\.rows_accepted/);
  assert.match(sql[files[2]], /Attendance import batches cannot be deleted/);
  assert.match(sql[files[3]], /Attendance devices with mapping or event history cannot be deleted/);
  assert.match(sql[files[3]], /Fingerprint terminal identity cannot be rewritten/);
});

test("attendance incident, salary and employment identity/history are protected", () => {
  assert.match(sql[files[4]], /day_staff_id IS DISTINCT FROM NEW\\.staff_account_id/);
  assert.match(sql[files[4]], /day_work_date IS DISTINCT FROM NEW\\.attendance_date/);
  assert.match(sql[files[5]], /Salary agreements require an active independent approver/);
  assert.match(sql[files[5]], /Salary terms used by reviewed or posted payroll cannot be changed/);
  assert.match(sql[files[5]], /Salary agreements are retained/);
  assert.match(sql[files[6]], /Employment terms for one staff member cannot overlap/);
  assert.match(sql[files[6]], /Employment terms used by reviewed or posted payroll cannot be changed/);
  assert.match(sql[files[6]], /Employment terms covering recorded attendance cannot be rewritten/);
});

test("work schedules cannot reinterpret recorded attendance", () => {
  assert.match(sql[files[7]], /A work schedule with assignment history cannot be deleted/);
  assert.match(sql[files[7]], /A work schedule used by recorded attendance cannot be edited/);
});

test("attendance deductions must match staff and payroll period, and edits need reapproval", () => {
  assert.match(sql[files[8]], /linked_staff_account_id IS DISTINCT FROM payroll_staff_account_id/);
  assert.match(sql[files[8]], /linked_work_date < payroll_starts_on/);
  assert.match(sql[files[8]], /linked_work_date > payroll_ends_on/);
  assert.match(sql[files[8]], /FOR UPDATE OF ad, aa/);
  assert.match(sql[files[8]], /FOR UPDATE OF pr/);
  assert.match(sql[files[9]], /financial_details_changed/);
  assert.match(sql[files[9]], /Changing a payroll line item requires a new independent approval/);
  assert.match(sql[files[9]], /approver_status IS DISTINCT FROM 'active'/);
  assert.match(sql[files[9]], /NEW\\.approved_at := now\\(\\)/);
});
