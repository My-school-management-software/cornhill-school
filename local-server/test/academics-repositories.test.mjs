import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresAcademicsRepository } from "../src/db/academics-repositories.mjs";

function fixturePool({ queryResults = [], errors = {} } = {}) {
  const calls = [];
  let resultIndex = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values, transaction: true });
      if (sql === "ROLLBACK" || sql === "COMMIT" || sql === "BEGIN") return { rows: [], rowCount: 0 };
      if (errors[sql]) throw errors[sql];
      return queryResults[resultIndex++] || { rows: [], rowCount: 0 };
    },
    release() { calls.push({ release: true }); }
  };
  const pool = {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values, transaction: false });
      if (errors[sql]) throw errors[sql];
      return queryResults[resultIndex++] || { rows: [], rowCount: 0 };
    },
    async connect() { return client; }
  };
  return pool;
}
const ID = "11111111-1111-4111-8111-111111111111";
const CLASS = "22222222-2222-4222-8222-222222222222";
const TERM = "33333333-3333-4333-8333-333333333333";
const SUBJECT = "44444444-4444-4444-8444-444444444444";

test("workspace queries enforce supplied class scope and return class, term and assessment catalogues", async () => {
  const pool = fixturePool({
    queryResults: [
      { rows: [{ id: CLASS, classCode: "P1", displayName: "P.1", subjects: [] }] },
      { rows: [{ id: TERM, termNumber: 1, termName: "Term 1", academicYear: "2026" }] },
      { rows: [] }
    ]
  });
  const data = await createPostgresAcademicsRepository(pool).listWorkspace({ classIds: [CLASS] });
  assert.equal(data.classes[0].id, CLASS);
  assert.equal(data.terms[0].academicYear, "2026");
  assert.match(pool.calls[0].sql, /c\.id = ANY\(\$1::uuid\[\]\)/);
  assert.deepEqual(pool.calls[0].values, [[CLASS], null]);
});

test("assessment mark register uses historical enrolment on the assessment date", async () => {
  const pool = fixturePool({
    queryResults: [
      { rows: [{ id: ID, classId: CLASS, className: "P.1", assessmentName: "Mid Term", maxScore: "100", status: "Open", effectiveDate: "2026-06-15" }] },
      { rows: [{ id: SUBJECT, subjectCode: "ENGLISH", subjectName: "English" }] },
      { rows: [{ id: ID, pupilCode: "CH-2026-000001", firstName: "Ada", lastName: "Lovelace" }] },
      { rows: [{ learnerId: ID, subjectId: SUBJECT, score: "82", maxScore: "100", comment: null }] }
    ]
  });
  const data = await createPostgresAcademicsRepository(pool).getAssessmentMarks(ID);
  assert.equal(data.learners[0].marks[0].score, 82);
  assert.equal(data.learners[0].marks[0].subjectName, "English");
  assert.match(pool.calls[2].sql, /FROM cornhill_school\.enrolment_periods ep/);
  assert.deepEqual(pool.calls[2].values, [CLASS, "2026-06-15"]);
});

test("mark saving locks the assessment and commits all rows in one transaction", async () => {
  const pool = fixturePool({ queryResults: [
    { rows: [{ classId: CLASS, maxScore: "100", status: "Open" }], rowCount: 1 },
    { rows: [], rowCount: 1 }
  ] });
  const result = await createPostgresAcademicsRepository(pool).saveMarks({
    assessmentId: ID, classId: CLASS, staffId: TERM,
    marks: [{ learnerId: TERM, subjectId: SUBJECT, score: 75, comment: null }]
  });
  assert.deepEqual(result, { savedCount: 1 });
  assert.equal(pool.calls[0].sql, "BEGIN");
  assert.match(pool.calls[1].sql, /FOR UPDATE/);
  assert.match(pool.calls[2].sql, /ON CONFLICT \(assessment_id, learner_id, subject_id\) DO UPDATE/);
  assert.equal(pool.calls[3].sql, "COMMIT");
  assert.equal(pool.calls.at(-1).release, true);
});

test("mark saving rolls back as a unit when any row fails", async () => {
  const error = new Error("constraint");
  const pool = fixturePool({ queryResults: [
    { rows: [{ classId: CLASS, maxScore: "100", status: "Open" }], rowCount: 1 }
  ], errors: { "INSERT INTO cornhill_school.learner_marks " +
    "(assessment_id, learner_id, class_id, subject_id, score, max_score, teacher_comment, " +
    "entered_by_staff_id, updated_by_staff_id) " +
    "VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid, $8::uuid) " +
    "ON CONFLICT (assessment_id, learner_id, subject_id) DO UPDATE SET " +
    "score = EXCLUDED.score, max_score = EXCLUDED.max_score, teacher_comment = EXCLUDED.teacher_comment, " +
    "updated_by_staff_id = EXCLUDED.updated_by_staff_id, updated_at = now()": error } });
  await assert.rejects(
    createPostgresAcademicsRepository(pool).saveMarks({
      assessmentId: ID, classId: CLASS, staffId: TERM,
      marks: [{ learnerId: TERM, subjectId: SUBJECT, score: 75, comment: null }]
    }),
    /constraint/
  );
  assert.ok(pool.calls.some(call => call.sql === "ROLLBACK"));
});