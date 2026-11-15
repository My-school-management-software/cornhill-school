import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/088_local_admission_database_integrity.sql", import.meta.url), "utf8");

test("admission integrity migration is transactional", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
});
test("migration uses the isolated school schema", () => {
  assert.match(sql, /ALTER TABLE cornhill_school\.learners/);
  assert.doesNotMatch(sql, /public\./i);
});
test("date-of-birth constraint has a stable name", () => {
  assert.match(sql, /CONSTRAINT\s+learner_dob_not_after_admission|ADD CONSTRAINT learner_dob_not_after_admission/);
});
test("missing date of birth remains permitted", () => {
  assert.match(sql, /date_of_birth IS NULL OR date_of_birth <= admission_date/);
});
test("date of birth cannot follow admission date", () => {
  assert.match(sql, /date_of_birth <= admission_date/);
});
test("LIN integrity constraint has a stable name", () => {
  assert.match(sql, /ADD CONSTRAINT learner_lin_trimmed_nonempty/);
});
test("missing LIN remains permitted", () => {
  assert.match(sql, /lin IS NULL OR/);
});
test("empty LIN is rejected", () => {
  assert.match(sql, /length\(lin\) BETWEEN 1 AND 40/);
});
test("LIN whitespace is rejected at the database boundary", () => {
  assert.match(sql, /lin = btrim\(lin\)/);
});
test("LIN maximum length remains forty characters", () => {
  assert.match(sql, /length\(lin\) BETWEEN 1 AND 40/);
});
test("active-class guard is a trigger function", () => {
  assert.match(sql, /CREATE FUNCTION cornhill_school\.require_active_class_for_admission\(\)/);
  assert.match(sql, /RETURNS trigger/);
});
test("active-class trigger function has a fixed search path", () => {
  assert.match(sql, /SET search_path = pg_catalog, cornhill_school/);
});
test("active-class guard checks the selected class identifier", () => {
  assert.match(sql, /WHERE id = NEW\.class_id/);
});
test("active-class guard locks the class row against concurrent deactivation", () => {
  assert.match(sql, /FOR SHARE/);
});
test("missing class is rejected with a foreign-key SQLSTATE", () => {
  assert.match(sql, /Admission class does not exist[\s\S]*?ERRCODE = 'foreign_key_violation'/);
});
test("inactive class is rejected with a check-violation SQLSTATE", () => {
  assert.match(sql, /selected_class_active IS DISTINCT FROM true[\s\S]*?ERRCODE = 'check_violation'/);
});
test("same-class profile updates do not fail after a class is later deactivated", () => {
  assert.match(sql, /TG_OP = 'UPDATE' AND NEW\.class_id IS NOT DISTINCT FROM OLD\.class_id/);
});
test("new admissions are checked before insert", () => {
  assert.match(sql, /BEFORE INSERT OR UPDATE OF class_id ON cornhill_school\.learners/);
});
test("class transfers are checked before class identifier updates", () => {
  assert.match(sql, /UPDATE OF class_id ON cornhill_school\.learners/);
});
test("class guard runs once per learner row", () => {
  assert.match(sql, /FOR EACH ROW\s+EXECUTE FUNCTION cornhill_school\.require_active_class_for_admission/);
});
test("trigger function execution is not granted to PUBLIC", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION cornhill_school\.require_active_class_for_admission\(\) FROM PUBLIC/);
});
test("migration does not alter or regenerate permanent pupil codes", () => {
  assert.doesNotMatch(sql, /UPDATE\s+cornhill_school\.learners[\s\S]*pupil_code/i);
  assert.doesNotMatch(sql, /generate_pupil_code|pupil_code_sequence/i);
});
test("migration does not grant broad runtime or public privileges", () => {
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+ON/i);
  assert.doesNotMatch(sql, /TO\s+(?:PUBLIC|anon|authenticated)/i);
});
