import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresGuardianPortalRepository } from "../src/db/guardian-portal-repositories.mjs";

const GUARDIAN_ID = "11111111-2222-4333-8444-555555555555";

test("guardian repository queries only explicitly approved, non-revoked links", async () => {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push({ sql, params });
    return { rows: [{ learnerId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", pupilCode: "CH-2026-000001", firstName: "A", lastName: "Learner" }] };
  } };
  const repository = createPostgresGuardianPortalRepository(pool);
  const learners = await repository.listApprovedLearners(GUARDIAN_ID, "CH-2026-000001");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [GUARDIAN_ID, "CH-2026-000001"]);
  assert.match(calls[0].sql, /access\.access_status = 'approved'/);
  assert.match(calls[0].sql, /access\.approved_at IS NOT NULL/);
  assert.match(calls[0].sql, /access\.revoked_at IS NULL/);
  assert.match(calls[0].sql, /access\.guardian_account_id = \$1::uuid/);
  assert.match(calls[0].sql, /upper\(l\.pupil_code\) = upper\(\$2::text\)/);
  assert.equal(learners[0].pupilCode, "CH-2026-000001");
});

test("guardian repository refuses malformed guardian identifiers", async () => {
  const repository = createPostgresGuardianPortalRepository({ async query() { throw new Error("must not query"); } });
  await assert.rejects(repository.listApprovedLearners("not-a-uuid"), /UUID/);
});

test("guardian repository requires a PostgreSQL query pool", () => {
  assert.throws(() => createPostgresGuardianPortalRepository({}), /pool/);
});

test("guardian profile query does not select finance, marks, staff or contact secrets", async () => {
  let sql = "";
  const repository = createPostgresGuardianPortalRepository({ async query(statement) { sql = statement; return { rows: [] }; } });
  await repository.listApprovedLearners(GUARDIAN_ID, "CH-2026-000001");
  assert.doesNotMatch(sql, /fee|payment|receipt|salary|password|pin_hash|staff_account/i);
});

test("guardian identity precheck matches learner code to active registered guardian contact only", async () => {
  const calls = [];
  const repo = createPostgresGuardianPortalRepository({
    async query(sql, params) { calls.push({ sql, params }); return { rows: [{ matched: true }] }; }
  });
  assert.equal(await repo.verifyRegisteredLearnerGuardian("CH-2026-000001", "+256700000001"), true);
  assert.deepEqual(calls[0].params, ["CH-2026-000001", "+256700000001"]);
  assert.match(calls[0].sql, /gc\.is_active=true/);
  assert.match(calls[0].sql, /gc\.phone_e164=\$2::text/);
  assert.match(calls[0].sql, /upper\(l\.pupil_code\)=upper\(\$1::text\)/);
  assert.doesNotMatch(calls[0].sql, /password|pin_hash|SELECT \*/i);
});

test("no approved learner can be read without explicitly supplying a valid code", async () => {
  const repo = createPostgresGuardianPortalRepository({
    async query() { throw new Error("Must not access database"); }
  });
  await assert.rejects(repo.listApprovedLearners(GUARDIAN_ID, ""), /permanent code/);
  await assert.rejects(repo.listApprovedLearners(GUARDIAN_ID, "INVALID!"), /permanent code/);
  await assert.rejects(repo.verifyRegisteredLearnerGuardian("BAD!", "+256700000001"), /code/);
});
