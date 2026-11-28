import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script=await readFile(new URL("../scripts/v60-readonly-academic-year-acceptance.mjs",import.meta.url),"utf8");

test("V60 academic year acceptance requires read-only PostgreSQL transaction and verifies local identity",()=>{
  assert.match(script,/REPEATABLE READ READ ONLY/);
  assert.match(script,/readLocalDatabaseConfig/);
  assert.match(script,/cornhill_local/);
  assert.match(script,/conn[.]query\("ROLLBACK"\)/);
});

test("V60 checks learner-by-learner advancement eligibility without revealing names or changing records",()=>{
  assert.match(script,/candidate_aggregate_by_class/);
  assert.match(script,/COUNT\(DISTINCT ep[.]learner_id\)/);
  assert.match(script,/learners_missing_active_enrolment/);
  assert.match(script,/term1_present/);
  assert.match(script,/role|DIRECTOR_PROMOTION_WRITES=DISABLED/i);
  assert.doesNotMatch(script,/conn[.]query\(\s*"(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
});

test("V60 safe report keeps finance, cloud and promotion writes disabled",()=>{
  assert.match(script,/finance_writes: 0/);
  assert.match(script,/cloud_writes: 0/);
  assert.match(script,/promotion_writes: 0/);
  assert.match(script,/learner_personal_data_in_report: false/);
  assert.match(script,/CORNHILL-V60-SAFE-ACADEMIC-ACCEPTANCE/);
});
