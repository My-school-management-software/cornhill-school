import test from "node:test";
import assert from "node:assert/strict";
import { getLocalSchoolInventory } from "../src/sync/local-school-inventory.mjs";

const okCounts = Object.freeze({
  learners: "484", learners_with_source_links: "484", learners_without_source_links: "0",
  classes: "10", academic_terms: "3", assessments: "169", learner_marks: "1991",
  guardian_contacts: "6", payment_records: "8"
});

function makePool(result = { rows: [okCounts] }, failAt = null) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (failAt && sql.includes(failAt)) throw new Error("Synthetic test failure");
      if (sql.includes("SELECT")) return result;
      return { rows: [] };
    },
    release() { released = true; }
  };
  return { pool: { connect: async () => client }, calls, wasReleased: () => released };
}

test("local inventory reads only aggregate counts and never selects school identifiers", async () => {
  const fake = makePool();
  const result = await getLocalSchoolInventory(fake.pool);
  assert.equal(result.status, "read_only_complete");
  assert.equal(result.counts.learners, 484);
  assert.equal(result.counts.learners_with_source_links, 484);
  assert.equal(result.counts.learner_marks, 1991);
  assert.equal(result.schoolRecordWrites, 0);
  assert.equal(result.financeReplicationEnabled, false);
  assert.equal(result.sourceLinksVerified, false);
  assert.equal(result.cloudComparisonAccepted, false);
  assert.deepEqual(fake.calls.map(sql => sql.startsWith("SELECT") ? "SELECT" : sql), [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "SET LOCAL statement_timeout = '5000ms'",
    "SELECT", "ROLLBACK"
  ]);
  assert.match(fake.calls[2], /count\(\*\)/);
  assert.doesNotMatch(fake.calls[2], /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|COPY|ALTER)\b/i);
  assert.doesNotMatch(fake.calls[2], /SELECT\s+\*/i);
  assert.equal(fake.wasReleased(), true);
});

test("report contains only aggregate counts, no school record fields", async () => {
  const result = await getLocalSchoolInventory(makePool().pool);
  assert.doesNotMatch(JSON.stringify(result), /student_id|learner_name|pupil_code|lin|guardian_phone|password|secret|receipt_no|uuid/i);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.counts));
});

test("zero records are allowed but never treated as a successful data transfer", async () => {
  const zero = Object.fromEntries(Object.keys(okCounts).map(key => [key, "0"]));
  const result = await getLocalSchoolInventory(makePool({ rows: [zero] }).pool);
  assert.equal(result.counts.learners, 0);
  assert.equal(result.cloudComparisonAccepted, false);
  assert.equal(result.schoolRecordWrites, 0);
});

test("count reconciliation mismatch is rejected in a rolled-back transaction", async () => {
  const fake = makePool({ rows: [{ ...okCounts, learners_with_source_links: "483" }] });
  await assert.rejects(getLocalSchoolInventory(fake.pool), /reconciliation failed/);
  assert.equal(fake.calls.at(-1), "ROLLBACK");
  assert.equal(fake.wasReleased(), true);
});

test("query failure rolls back and releases the local connection", async () => {
  const fake = makePool({ rows: [okCounts] }, "SELECT");
  await assert.rejects(getLocalSchoolInventory(fake.pool), /Synthetic test failure/);
  assert.equal(fake.calls.at(-1), "ROLLBACK");
  assert.equal(fake.wasReleased(), true);
});

test("invalid row count rejects report and rolls back", async () => {
  const fake = makePool({ rows: [] });
  await assert.rejects(getLocalSchoolInventory(fake.pool), /exactly one row/);
  assert.equal(fake.calls.at(-1), "ROLLBACK");
  assert.equal(fake.wasReleased(), true);
});

test("unsafe count values do not appear in output", async () => {
  for (const bad of ["-1", "NaN", "999999999999999999999999999", null]) {
    const fake = makePool({ rows: [{ ...okCounts, learners: bad }] });
    await assert.rejects(getLocalSchoolInventory(fake.pool));
    assert.equal(fake.calls.at(-1), "ROLLBACK");
    assert.equal(fake.wasReleased(), true);
  }
});

test("non-pool is rejected", async () => {
  await assert.rejects(getLocalSchoolInventory(null), /connection pool is required/);
  await assert.rejects(getLocalSchoolInventory({ query() {} }), /connection pool is required/);
});

test("includes source-record-link counts but never infers links are valid", async () => {
  const report = await getLocalSchoolInventory(makePool({ rows: [{ ...okCounts, learners_with_source_links: "0", learners_without_source_links: "484" }] }).pool);
  assert.equal(report.counts.learners_without_source_links, 484);
  assert.equal(report.sourceLinksVerified, false);
  assert.equal(report.financeReplicationEnabled, false);
});
