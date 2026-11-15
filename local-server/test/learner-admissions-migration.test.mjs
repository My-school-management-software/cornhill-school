import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/005_local_learner_admissions_foundation.sql", import.meta.url), "utf8");

test("learner migration is transactional and isolated in its own schema", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS cornhill_school/);
  assert.match(sql, /REVOKE ALL ON SCHEMA cornhill_school FROM PUBLIC/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("seeded classes cover all nursery and primary levels", () => {
  for (const code of ["BABY", "MIDDLE", "TOP", "P1", "P2", "P3", "P4", "P5", "P6", "P7"]) {
    assert.match(sql, new RegExp("'" + code + "'"));
  }
  assert.match(sql, /section IN \('Nursery', 'Primary'\)/);
  assert.match(sql, /class_section_level_consistent/);
});

test("class order constraints keep Nursery before Primary", () => {
  assert.match(sql, /level_order BETWEEN 1 AND 10/);
  assert.match(sql, /section = 'Nursery' AND level_order BETWEEN 1 AND 3/);
  assert.match(sql, /section = 'Primary' AND level_order BETWEEN 4 AND 10/);
});

test("pupil codes are generated automatically with a sequence", () => {
  assert.match(sql, /CREATE SEQUENCE cornhill_school\.pupil_code_sequence/);
  assert.match(sql, /generate_pupil_code\(\)/);
  assert.match(sql, /'CH-'[\s\S]*?lpad\(nextval/);
  assert.match(sql, /pupil_code text NOT NULL UNIQUE DEFAULT cornhill_school\.generate_pupil_code\(\)/);
});

test("pupil code generation uses Kampala local calendar year", () => {
  assert.match(sql, /timezone\('Africa\/Kampala', clock_timestamp\(\)\)/);
});

test("permanent pupil codes cannot be changed after admission", () => {
  assert.match(sql, /prevent_pupil_code_change/);
  assert.match(sql, /NEW\.pupil_code IS DISTINCT FROM OLD\.pupil_code/);
  assert.match(sql, /CREATE TRIGGER learners_pupil_code_immutable/);
});

test("LIN is stored separately and unique when Ministry number is supplied", () => {
  assert.match(sql, /lin text UNIQUE/);
  assert.match(sql, /learner_lin_format/);
});

test("learner profile stores admission and progression essentials", () => {
  for (const field of ["first_name", "middle_name", "last_name", "gender", "date_of_birth",
    "birth_year", "class_id", "admission_date", "admission_year", "learner_type",
    "previous_school", "p7_index_number", "status", "admission_complete"]) {
    assert.match(sql, new RegExp("\\b" + field + "\\b"));
  }
});

test("learner type and status values are constrained", () => {
  assert.match(sql, /learner_type IN \('Day', 'Boarding'\)/);
  assert.match(sql, /'Active', 'Inactive', 'Transferred', 'Withdrawn', 'Graduated', 'Archived'/);
});

test("bursary amount cannot be negative and ordinary learners cannot carry bursary debt", () => {
  assert.match(sql, /bursary_fee_ugx bigint NOT NULL DEFAULT 0 CHECK \(bursary_fee_ugx >= 0\)/);
  assert.match(sql, /learner_bursary_consistency/);
});

test("guardian contacts are separate, linked to a learner and support consent flags", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.guardian_contacts/);
  assert.match(sql, /learner_id uuid NOT NULL REFERENCES cornhill_school\.learners/);
  assert.match(sql, /sms_opt_in boolean NOT NULL DEFAULT false/);
  assert.match(sql, /whatsapp_opt_in boolean NOT NULL DEFAULT false/);
});

test("Ugandan guardian phone fields require E.164 +256 format", () => {
  assert.match(sql, /guardian_phone_ug_format/);
  assert.match(sql, /guardian_whatsapp_ug_format/);
  assert.ok(sql.includes(String.raw`phone_e164 ~ '^\+256[0-9]{9}$'`));
  assert.ok(sql.includes(String.raw`whatsapp_e164 ~ '^\+256[0-9]{9}$'`));
});
test("only one active primary guardian can be linked to a learner", () => {
  assert.match(sql, /one_active_primary_guardian_per_learner/);
  assert.match(sql, /WHERE is_active = true AND is_primary = true/);
});

test("enrolment periods preserve learner movement history", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.enrolment_periods/);
  assert.match(sql, /previous_period_id uuid REFERENCES cornhill_school\.enrolment_periods/);
  assert.match(sql, /one_active_enrolment_per_learner/);
});

test("admission event audit records actor, reason and structured details", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.admission_events/);
  assert.match(sql, /actor_staff_id uuid REFERENCES cornhill_auth\.staff_accounts/);
  assert.match(sql, /details jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
});

test("admission enquiries support review and registration workflow", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.admission_enquiries/);
  assert.match(sql, /'Pending', 'Contacted', 'Visit scheduled', 'Approved for admission', 'Registered'/);
  assert.match(sql, /reviewed_by_staff_id/);
  assert.match(sql, /registered_at/);
});

test("admission and learner management permissions are added without role grants", () => {
  assert.match(sql, /admissions\.register_learner/);
  assert.match(sql, /admissions\.archive_learner/);
  assert.match(sql, /learners\.guardians_manage/);
  assert.match(sql, /learners\.lin_manage/);
  assert.match(sql, /ON CONFLICT \(permission_code\) DO NOTHING/);
  assert.doesNotMatch(sql, /INSERT INTO cornhill_auth\.staff_role_permissions/);
});

test("no public table, sequence or function access is granted", () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated|PUBLIC)/i);
});

test("migration does not import, update or delete live school data", () => {
  assert.doesNotMatch(sql, /INSERT INTO public\.|UPDATE public\.|DELETE FROM public\./i);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});

test("source identifiers for legacy records are optional and unique", () => {
  assert.match(sql, /source_record_id uuid UNIQUE/);
  assert.match(sql, /Existing admission codes must be preserved verbatim/);
});
