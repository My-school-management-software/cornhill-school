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
  const p7Sql=await readFile(new URL("../migrations/090_local_p7_index_roster_read_api.sql",import.meta.url),"utf8");
  assert.match(p7Sql,/GRANT SELECT \(p7_index_number\)[\s\S]*ON cornhill_school\.learners TO cornhill_auth_runtime/);
  assert.doesNotMatch(p7Sql,/GRANT .* ON ALL TABLES/i);
  const auditSql=await readFile(new URL("../migrations/091_local_learner_audit_append_only.sql",import.meta.url),"utf8");
  assert.match(auditSql,/CREATE TRIGGER admission_events_append_only[\s\S]*BEFORE UPDATE OR DELETE ON cornhill_school\.admission_events/);
  assert.match(auditSql,/Learner audit events are append-only/);
  assert.match(auditSql,/REVOKE ALL ON FUNCTION cornhill_school\.prevent_admission_event_mutation/);
  const profileSql=await readFile(new URL("../migrations/092_local_learner_profile_edit_columns.sql",import.meta.url),"utf8");
  assert.match(profileSql,/GRANT UPDATE \\([\\s\\S]*first_name[\\s\\S]*lin[\\s\\S]*p7_index_number[\\s\\S]*updated_at[\\s\\S]*\\) ON cornhill_school\\.learners TO cornhill_auth_runtime/);
  assert.match(profileSql,/GRANT SELECT \\(id, class_id\\)[\\s\\S]*ON cornhill_school\\.learners TO cornhill_auth_runtime/);
  assert.doesNotMatch(profileSql,/UPDATE \\(\\s*pupil_code|class_id|status|admission_date/);
  assert.doesNotMatch(profileSql,/GRANT .* ON ALL TABLES/i);
});

test("learner roster migration grants only approved identity columns", async () => {
  const sql=await readFile(new URL("../migrations/075_local_learner_roster_read_api.sql",import.meta.url),"utf8");
  assert.match(sql,/SELECT \([\s\S]*pupil_code[\s\S]*date_of_birth[\s\S]*class_id[\s\S]*status/);
  assert.match(sql,/ON cornhill_school\.learners TO cornhill_auth_runtime/);
  assert.doesNotMatch(sql,/GRANT .* ON ALL TABLES/i);
});
