import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/006_local_academics_foundation.sql", import.meta.url), "utf8");

test("academic migration is transactional and remains inside the local school schema", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /CREATE TABLE cornhill_school\.academic_years/);
  assert.match(sql, /CREATE TABLE cornhill_school\.academic_terms/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("academic years and terms validate dates and term numbers", () => {
  assert.match(sql, /academic_year_dates_valid CHECK \(ends_on >= starts_on\)/);
  assert.match(sql, /term_number BETWEEN 1 AND 3/);
  assert.match(sql, /term_dates_valid CHECK \(ends_on >= starts_on\)/);
  assert.match(sql, /one_active_academic_year/);
  assert.match(sql, /one_active_term_per_year/);
});

test("subject catalogue includes nursery, lower-primary and upper-primary subjects", () => {
  for (const code of ["NUMBERS", "LANGUAGE_DEV", "READING", "HEALTH_HABITS", "SOCIAL_DEV", "WRITING", "DRAWING",
    "ENGLISH", "MATHEMATICS", "LITERACY_I", "LITERACY_II", "LOCAL_LANGUAGE", "RELIGIOUS_ED", "SCIENCE", "SOCIAL_STUDIES"]) {
    assert.ok(sql.includes("'" + code + "'"), "Missing subject " + code);
  }
});

test("class subject mapping covers Baby to P7 with requested subject groupings", () => {
  for (const code of ["BABY", "MIDDLE", "TOP", "P1", "P2", "P3", "P4", "P5", "P6", "P7"]) {
    assert.ok(sql.includes("'" + code + "'"), "Missing class mapping " + code);
  }
  assert.match(sql, /INSERT INTO cornhill_school\.class_subjects/);
});

test("assessment records are scoped to a term and class", () => {
  assert.match(sql, /academic_term_id uuid NOT NULL REFERENCES cornhill_school\.academic_terms/);
  assert.match(sql, /class_id uuid NOT NULL REFERENCES cornhill_school\.classes/);
  assert.match(sql, /assessment_type IN \('Beginning of Term', 'Mid Term', 'End of Term', 'Continuous Assessment', 'Mock', 'Practice'\)/);
  assert.match(sql, /'Draft', 'Open', 'Locked', 'Published', 'Archived'/);
});

test("marks are constrained to assessment class and class subject", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.learner_marks/);
  assert.match(sql, /mark_assessment_class_fk/);
  assert.match(sql, /mark_class_subject_fk/);
  assert.match(sql, /score numeric\(7,2\) NOT NULL CHECK \(score >= 0\)/);
  assert.match(sql, /score <= max_score/);
  assert.match(sql, /UNIQUE \(assessment_id, learner_id, subject_id\)/);
});

test("mark records preserve teacher attribution and timestamps", () => {
  assert.match(sql, /entered_by_staff_id uuid REFERENCES cornhill_auth\.staff_accounts/);
  assert.match(sql, /updated_by_staff_id uuid REFERENCES cornhill_auth\.staff_accounts/);
  assert.match(sql, /entered_at timestamptz NOT NULL DEFAULT now\(\)/);
});

test("academic permissions are catalogued but not automatically assigned", () => {
  for (const p of ["academics.terms_manage", "academics.subjects_manage", "academics.assessments_manage", "academics.marks_enter", "academics.results_view"]) {
    assert.ok(sql.includes("'" + p + "'"));
  }
  assert.doesNotMatch(sql, /INSERT INTO cornhill_auth\.staff_role_permissions/);
});

test("PUBLIC receives no academic schema table or sequence grants", () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated|PUBLIC)/i);
});

test("academic migration does not mutate live Supabase tables or delete local records", () => {
  assert.doesNotMatch(sql, /INSERT INTO public\.|UPDATE public\.|DELETE FROM public\./i);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA/i);
});
