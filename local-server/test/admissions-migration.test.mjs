import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/076_local_learner_admission_write_api.sql", import.meta.url), "utf8");

test("admissions migration grants only the columns required for registration", () => {
  assert.match(sql, /GRANT INSERT \([\s\S]*admission_complete[\s\S]*\) ON cornhill_school\.learners TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT SELECT \([\s\S]*pupil_code[\s\S]*\) ON cornhill_school\.learners TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT INSERT \([\s\S]*sms_opt_in,whatsapp_opt_in[\s\S]*\) ON cornhill_school\.guardian_contacts TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT INSERT \([\s\S]*created_by_staff_id[\s\S]*\) ON cornhill_school\.enrolment_periods TO cornhill_auth_runtime/);
  assert.match(sql, /GRANT INSERT \([\s\S]*details[\s\S]*\) ON cornhill_school\.admission_events TO cornhill_auth_runtime/);
});

test("admissions migration does not grant update or delete capabilities", () => {
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*FROM cornhill_auth_runtime/);
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|UPDATE|DELETE|TRUNCATE)\s+ON\s+cornhill_school\.(?:learners|guardian_contacts|enrolment_periods|admission_events)/i);
});

test("admissions migration relies on database-generated permanent pupil codes", () => {
  assert.match(sql, /generate_pupil_code/);
  assert.match(sql, /pupil_code/);
  assert.doesNotMatch(sql, /GRANT\s+UPDATE\s*\([^)]*pupil_code/i);
});
