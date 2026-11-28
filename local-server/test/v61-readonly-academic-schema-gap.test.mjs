import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const s=await readFile(new URL("../scripts/v61-readonly-academic-schema-gap-audit.mjs",import.meta.url),"utf8");

test("V61 uses one read-only PostgreSQL transaction with verified local-only identity",()=>{
  assert.match(s,/REPEATABLE READ READ ONLY/);
  assert.match(s,/readLocalDatabaseConfig/);
  assert.match(s,/cornhill_local/);
  assert.match(s,/conn[.]query\("ROLLBACK"\)/);
});
test("V61 safely skips absent Nursery material tables without disguising missing schema",()=>{
  assert.match(s,/nursery_material_receipts/);
  assert.match(s,/nursery_material_movements/);
  assert.match(s,/if\(!has\(table\)\)\{report[.]academic_counts\[key\]=null;continue;\}/);
  assert.match(s,/missing_required_functional_tables/);
  assert.match(s,/migration_record_names_090_onward/);
});
test("V61 reports only aggregated academic data, keeping school writes disabled",()=>{
  assert.match(s,/count\(DISTINCT l[.]id\)/);
  assert.match(s,/learners_missing_active_enrolment/);
  assert.match(s,/school_year_ready_for_promotions/);
  assert.match(s,/finance_sync_safe:false/);
  assert.match(s,/writes_to_database:0/);
  assert.match(s,/learner_promotions:0/);
  assert.match(s,/cloud_writes:0/);
  assert.doesNotMatch(s,/conn[.]query\(\s*"(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
});
