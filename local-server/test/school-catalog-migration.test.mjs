import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("school catalogue migration grants metadata reads but no write privileges", async () => {
  const sql=await readFile(new URL("../migrations/074_local_school_catalog_read_api.sql",import.meta.url),"utf8");
  assert.match(sql,/GRANT USAGE ON SCHEMA cornhill_school TO cornhill_auth_runtime/);
  assert.match(sql,/SELECT \(id, class_code, display_name, section, level_order, stream, is_active\)/);
  assert.match(sql,/SELECT \(id, subject_code, subject_name, subject_group, is_active\)/);
  assert.match(sql,/SELECT \(id, class_id, subject_id, display_order, is_compulsory, is_active\)/);
  assert.match(sql,/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
  assert.doesNotMatch(sql,/GRANT .* ON ALL TABLES/i);
});

test("learner roster migration grants only approved identity columns", async () => {
  const sql=await readFile(new URL("../migrations/075_local_learner_roster_read_api.sql",import.meta.url),"utf8");
  assert.match(sql,/SELECT \([\s\S]*pupil_code[\s\S]*date_of_birth[\s\S]*class_id[\s\S]*status/);
  assert.match(sql,/ON cornhill_school\.learners TO cornhill_auth_runtime/);
  assert.doesNotMatch(sql,/GRANT .* ON ALL TABLES/i);
});
