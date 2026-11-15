import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresAdmissionsRepository } from "../src/db/admissions-repositories.mjs";

const LEARNER_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const CLASS_ID = "33333333-3333-4333-8333-333333333333";
const LEARNER = { id: LEARNER_ID, pupil_code: "CH-2026-000001", class_id: CLASS_ID };
const INPUT = {
  actorStaffId: STAFF_ID, classId: CLASS_ID, firstName: "Amina", middleName: null,
  lastName: "Nabirye", gender: "Female", dateOfBirth: null, lin: "UG-001",
  admissionDate: "2026-01-12", learnerType: "Day", previousSchool: null,
  p7IndexNumber: null, isBursary: true, bursaryFeeUgx: 50000,
  bursaryCategory: "Need-based", bursaryReason: "Approved support",
  takesBreakfast: false, takesLunch: true, reason: "New admission",
  guardian: { name: "Parent One", relationship: "Mother", phone: "+256700000001",
    whatsapp: null, email: null, smsOptIn: false, whatsappOptIn: false }
};
function mockPool({ failAt = null, failRollback = false, connectError = null, learnerRows = [LEARNER] } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "ROLLBACK" && failRollback) throw new Error("rollback failure");
      if (failAt && sql.includes(failAt)) throw new Error("injected query failure: " + failAt);
      if (sql.startsWith("INSERT INTO cornhill_school.learners")) return { rows: learnerRows };
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", params: [] }); }
  };
  return {
    calls, client,
    pool: { async connect() { if (connectError) throw connectError; return client; } }
  };
}
function inserts(calls) { return calls.filter(x => x.sql.startsWith("INSERT INTO")); }

test("repository factory rejects a missing pool", () => {
  assert.throws(() => createPostgresAdmissionsRepository(), /PostgreSQL pool is required/);
});
test("repository factory rejects a pool without connect", () => {
  assert.throws(() => createPostgresAdmissionsRepository({}), /PostgreSQL pool is required/);
});
test("repository begins transaction before learner write", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  assert.equal(m.calls[0].sql, "BEGIN");
  assert.ok(m.calls.findIndex(x => x.sql.startsWith("INSERT INTO cornhill_school.learners")) > 0);
});
test("repository commits before releasing client", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  assert.equal(m.calls.at(-2).sql, "COMMIT");
  assert.equal(m.calls.at(-1).sql, "RELEASE");
});
test("repository returns database-issued learner row", async () => {
  const m = mockPool(); const result = await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  assert.deepEqual(result, LEARNER);
});
test("pupil code is omitted from insert so database generates it", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const sql = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.learners")).sql;
  const insertColumns = sql.split(") VALUES")[0].split("(").at(-1);
  assert.ok(insertColumns, "learner INSERT column list must be present");
  assert.doesNotMatch(insertColumns, /pupil_code/i);
  assert.match(sql, /RETURNING id,pupil_code/);
});
test("learner write uses parameterised values", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const write = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.learners"));
  assert.match(write.sql, /\$1/);
  assert.ok(write.params.includes("Amina"));
  assert.ok(write.params.includes("Nabirye"));
});
test("guardian write is included when guardian details are provided", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  assert.equal(m.calls.filter(x => x.sql.startsWith("INSERT INTO cornhill_school.guardian_contacts")).length, 1);
});
test("guardian write is skipped when guardian details are absent", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner({ ...INPUT, guardian: null });
  assert.equal(m.calls.some(x => x.sql.startsWith("INSERT INTO cornhill_school.guardian_contacts")), false);
  assert.equal(inserts(m.calls).length, 3);
});
test("provisional admission passes null class to learner insert", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner({ ...INPUT, classId: null });
  const write = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.learners"));
  assert.equal(write.params[6], null);
});
test("provisional admission passes null class to enrolment period", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner({ ...INPUT, classId: null });
  const write = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.enrolment_periods"));
  assert.equal(write.params[2], null);
});
test("assigned class is passed to learner and enrolment writes", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const learnerWrite = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.learners"));
  const enrolmentWrite = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.enrolment_periods"));
  assert.equal(learnerWrite.params[6], CLASS_ID);
  assert.equal(enrolmentWrite.params[2], CLASS_ID);
});
test("admission audit event is written after enrolment", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const enrolmentIndex = m.calls.findIndex(x => x.sql.startsWith("INSERT INTO cornhill_school.enrolment_periods"));
  const eventIndex = m.calls.findIndex(x => x.sql.startsWith("INSERT INTO cornhill_school.admission_events"));
  assert.ok(eventIndex > enrolmentIndex);
});
test("admission audit stores actor staff identity", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const event = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.admission_events"));
  assert.equal(event.params[1], STAFF_ID);
});
test("admission audit records bursary state and guardian presence", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const event = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.admission_events"));
  const details = JSON.parse(event.params[3]);
  assert.equal(details.bursary, true);
  assert.equal(details.guardianAdded, true);
});
test("bursary fee amount is persisted in learner write parameters", async () => {
  const m = mockPool(); await createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT);
  const write = m.calls.find(x => x.sql.startsWith("INSERT INTO cornhill_school.learners"));
  assert.ok(write.params.includes(50000));
});
test("learner insert failure triggers rollback and release", async () => {
  const m = mockPool({ failAt: "INSERT INTO cornhill_school.learners" });
  await assert.rejects(createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT), /injected query failure/);
  assert.equal(m.calls.some(x => x.sql === "ROLLBACK"), true);
  assert.equal(m.calls.at(-1).sql, "RELEASE");
});
test("guardian insert failure rolls back learner write", async () => {
  const m = mockPool({ failAt: "INSERT INTO cornhill_school.guardian_contacts" });
  await assert.rejects(createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT), /injected query failure/);
  assert.equal(m.calls.at(-2).sql, "ROLLBACK");
  assert.equal(m.calls.some(x => x.sql === "COMMIT"), false);
});
test("enrolment insert failure rolls back preceding learner and guardian writes", async () => {
  const m = mockPool({ failAt: "INSERT INTO cornhill_school.enrolment_periods" });
  await assert.rejects(createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT), /injected query failure/);
  assert.equal(m.calls.some(x => x.sql === "ROLLBACK"), true);
  assert.equal(m.calls.some(x => x.sql === "COMMIT"), false);
});
test("audit event failure rolls back all earlier admission writes", async () => {
  const m = mockPool({ failAt: "INSERT INTO cornhill_school.admission_events" });
  await assert.rejects(createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT), /injected query failure/);
  assert.equal(m.calls.some(x => x.sql === "ROLLBACK"), true);
  assert.equal(m.calls.some(x => x.sql === "COMMIT"), false);
});
test("connection acquisition failure is propagated without a release attempt", async () => {
  const m = mockPool({ connectError: new Error("pool unavailable") });
  await assert.rejects(createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT), /pool unavailable/);
  assert.equal(m.calls.length, 0);
});
test("rollback failure does not replace the original admission error", async () => {
  const m = mockPool({ failAt: "INSERT INTO cornhill_school.guardian_contacts", failRollback: true });
  await assert.rejects(createPostgresAdmissionsRepository(m.pool).registerLearner(INPUT), /injected query failure/);
  assert.equal(m.calls.at(-1).sql, "RELEASE");
});
