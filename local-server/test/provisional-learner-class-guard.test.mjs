import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/089_local_provisional_learner_class_guard.sql", import.meta.url), "utf8");

test("provisional learner class guard correction is transactional", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
});
test("corrected function preserves its schema-qualified identity", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION cornhill_school\.require_active_class_for_admission/);
});
test("learner may be created before class assignment", () => {
  assert.match(sql, /IF NEW\.class_id IS NULL THEN\s+RETURN NEW;/);
});
test("null class is handled before class lookup", () => {
  assert.ok(sql.indexOf("IF NEW.class_id IS NULL") < sql.indexOf("FROM cornhill_school.classes"));
});
test("assigned classes still require an active class", () => {
  assert.match(sql, /selected_class_active IS DISTINCT FROM true/);
});
test("class row remains locked during admission validation", () => {
  assert.match(sql, /FOR SHARE/);
});
test("unknown assigned class remains rejected", () => {
  assert.match(sql, /Admission class does not exist/);
});
test("unchanged class assignment avoids blocking ordinary profile edits", () => {
  assert.match(sql, /TG_OP = 'UPDATE' AND NEW\.class_id IS NOT DISTINCT FROM OLD\.class_id/);
});
test("function keeps a fixed safe search path", () => {
  assert.match(sql, /SET search_path = pg_catalog, cornhill_school/);
});
test("correction does not rewrite learner records", () => {
  assert.doesNotMatch(sql, /UPDATE\s+cornhill_school\.learners/i);
});
