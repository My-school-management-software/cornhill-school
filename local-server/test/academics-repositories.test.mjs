import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresAcademicsRepository } from "../src/db/academics-repositories.mjs";

function fixturePool({ queryResults = [], failMarkInsert = false, markInsertError = new Error("mark insert failed") } = {}) {
  const calls = [];
  let resultIndex = 0;
  async function execute(sql, values = [], transaction = false) {
    calls.push({ sql, values, transaction });
    if (sql === "ROLLBACK" || sql === "COMMIT" || sql === "BEGIN") return { rows: [], rowCount: 0 };
    if (failMarkInsert && sql.startsWith("INSERT INTO cornhill_school.learner_marks ")) throw markInsertError;
    return queryResults[resultIndex++] || { rows: [], rowCount: 0 };
  }
  const client = {
    query(sql, values) { return execute(sql, values, true); },
    release() { calls.push({ release: true }); }
  };
  return {
    calls,
    query(sql, values) { return execute(sql, values, false); },
    async connect() { return client; }
  };
}
const ID = "11111111-1111-4111-8111-111111111111";
const CLASS = "22222222-2222-4222-8222-222222222222";
const TERM = "33333333-3333-4333-8333-333333333333";
const SUBJECT = "44444444-4444-4444-8444-444444444444";

test("workspace queries enforce supplied class scope and return class, term and assessment catalogues", async () => {
  const pool = fixturePool({
    queryResults: [
      { rows: [{ id: CLASS, classCode: "P1", displayName: "P.1", subjects: [] }] },
      { rows: [{ id: TERM, yearLabel: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "Active" }] },
      { rows: [{ id: TERM, termNumber: 1, termName: "Term 1", academicYear: "2026" }] },
      { rows: [] }
    ]
  });
  const data = await createPostgresAcademicsRepository(pool).listWorkspace({ classIds: [CLASS] });
  assert.equal(data.classes[0].id, CLASS);
  assert.equal(data.years[0].yearLabel, "2026");
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

test("academic year creation is attributed to the authenticated staff account", async () => {
  const pool = fixturePool({ queryResults: [{ rows: [{
    id: ID, yearLabel: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "Active"
  }], rowCount: 1 }] });
  const result = await createPostgresAcademicsRepository(pool).createAcademicYear({
    yearLabel: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31", status: "Active", staffId: TERM
  });
  assert.equal(result.yearLabel, "2026");
  assert.match(pool.calls[0].sql, /created_by_staff_id/);
  assert.deepEqual(pool.calls[0].values, ["2026", "2026-01-01", "2026-12-31", "Active", TERM]);
});

test("academic term insert validates selected year date boundaries", async () => {
  const pool = fixturePool({ queryResults: [{ rows: [{
    id: SUBJECT, academicYearId: ID, termNumber: 1, termName: "Term 1",
    startsOn: "2026-01-01", endsOn: "2026-04-30", status: "Active"
  }], rowCount: 1 }] });
  const result = await createPostgresAcademicsRepository(pool).createAcademicTerm({
    academicYearId: ID, termNumber: 1, termName: "Term 1",
    startsOn: "2026-01-01", endsOn: "2026-04-30", status: "Active", staffId: TERM
  });
  assert.equal(result.termName, "Term 1");
  assert.match(pool.calls[0].sql, /y\.starts_on/);
  assert.match(pool.calls[0].sql, /created_by_staff_id/);
});

test("academic term creation rejects out-of-year date ranges", async () => {
  const pool = fixturePool({ queryResults: [{ rows: [], rowCount: 0 }] });
  await assert.rejects(
    createPostgresAcademicsRepository(pool).createAcademicTerm({
      academicYearId: ID, termNumber: 1, termName: "Term 1",
      startsOn: "2025-12-15", endsOn: "2026-04-30", status: "Planned", staffId: TERM
    }),
    /within the selected academic year/
  );
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
  const pool = fixturePool({
    queryResults: [{ rows: [{ classId: CLASS, maxScore: "100", status: "Open" }], rowCount: 1 }],
    failMarkInsert: true, markInsertError: error
  });
  await assert.rejects(
    createPostgresAcademicsRepository(pool).saveMarks({
      assessmentId: ID, classId: CLASS, staffId: TERM,
      marks: [{ learnerId: TERM, subjectId: SUBJECT, score: 75, comment: null }]
    }),
    /constraint/
  );
  assert.ok(pool.calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(pool.calls.at(-1).release, true);
});

test("published report-card generation is delegated to the permission-checked database operation", async () => {
  const pool = fixturePool({ queryResults: [{ rows: [{ generatedCount: 2 }], rowCount: 1 }] });
  const result = await createPostgresAcademicsRepository(pool).generateReportCards({
    assessmentId: ID, staffId: TERM
  });
  assert.deepEqual(result, { generatedCount: 2 });
  assert.match(pool.calls[0].sql, /generate_academic_report_cards/);
  assert.deepEqual(pool.calls[0].values, [ID, TERM]);
});

test("report-card history is read by stable learner ID, class scoped, and returns numeric result totals", async () => {
  const pool = fixturePool({ queryResults: [{ rows: [{
    learnerId: ID, classId: CLASS, totalScore: "279.00", totalPossible: "400.00",
    averagePercent: "69.75", aggregate: 16, division: null, position: 1, classSize: 2,
    subjects: [{ subjectCode: "ENGLISH", score: 87 }]
  }], rowCount: 1 }] });
  const rows = await createPostgresAcademicsRepository(pool).getLearnerReportCards(ID, [CLASS]);
  assert.equal(rows[0].learnerId, ID);
  assert.equal(rows[0].aggregate, 16);
  assert.equal(rows[0].averagePercent, 69.75);
  assert.equal(rows[0].position, 1);
  assert.deepEqual(rows[0].subjects, [{ subjectCode: "ENGLISH", score: 87 }]);
  assert.match(pool.calls[0].sql, /WHERE learner_id=\$1::uuid/);
  assert.match(pool.calls[0].sql, /class_id=ANY\(\$2::uuid\[\]\)/);
  assert.match(pool.calls[0].sql, /LIMIT 200/);
  assert.deepEqual(pool.calls[0].values, [ID, [CLASS]]);
});

test("new-year advancement shows old-class candidates separately from already advanced learners", async () => {
  const pool = fixturePool({ queryResults: [
    { rows: [{ termId: TERM, yearLabel: "2027", yearStart: "2027-01-20",
      classId: CLASS, classCode: "P6", className: "P.6",
      nextClassId: SUBJECT, nextClassName: "P.7",
      yearStatus: "Active", termStatus: "Active" }] },
    { rows: [{ id: ID, pupilCode: "CH10M0547JH",
      learnerName: "Test Learner", enrolledFrom: "2026-02-02" }] },
    { rows: [{ count: 3 }] }
  ] });
  const rows = await createPostgresAcademicsRepository(pool).listYearAdvancementCandidates({
    classId: CLASS, academicTermId: TERM
  });
  assert.equal(rows.canApprove, true);
  assert.equal(rows.candidates.length, 1);
  assert.equal(rows.newYearClassCount, 3);
  assert.match(pool.calls[1].sql, /ep\.admission_date<\$2::date/);
  assert.match(pool.calls[2].sql, /ep\.admission_date>=\$2::date/);
});

test("new-year advancement records only an explicitly selected learner via existing audited progression function", async () => {
  const pool = fixturePool({ queryResults: [
    { rows: [{ effectiveDate: "2027-01-20", yearStart: "2027-01-20",
      termStatus: "Active", yearStatus: "Active", classCode: "P6",
      nextClassId: SUBJECT, enrolledFrom: "2026-02-02" }] },
    { rows: [{ eventId: ID }] }
  ] });
  const result = await createPostgresAcademicsRepository(pool).recordYearAdvancementDecision({
    staffId: ID, learnerId: ID, fromClassId: CLASS,
    academicTermId: TERM, decision: "Repeat", reason: "Needs another year"
  });
  assert.equal(result.decision, "Repeat");
  assert.equal(result.toClassId, CLASS);
  assert.match(pool.calls[1].sql, /record_learner_progression/);
  assert.deepEqual(pool.calls[1].values,
    [ID, ID, CLASS, TERM, "2027-01-20", "Needs another year"]);
});

test("new-year advancement denies P7 promotion to a nonexistent secondary class and excludes old periods", async () => {
  const pool = fixturePool({ queryResults: [
    { rows: [{ effectiveDate: "2027-01-20", yearStart: "2027-01-20",
      termStatus: "Active", yearStatus: "Active", classCode: "P7",
      nextClassId: null, enrolledFrom: "2026-02-02" }] }
  ] });
  const repo = createPostgresAcademicsRepository(pool);
  await assert.rejects(repo.recordYearAdvancementDecision({
    staffId: ID, learnerId: ID, fromClassId: CLASS,
    academicTermId: TERM, decision: "Promote", reason: "Not a valid destination"
  }), /No next class/);
  assert.equal(pool.calls.length, 1);
});

test("new-year advancement cannot write decisions before Year and Term 1 are activated", async () => {
  const pool = fixturePool({ queryResults: [
    { rows: [{ effectiveDate: "2027-01-20", yearStart: "2027-01-20",
      termStatus: "Planned", yearStatus: "Planned", classCode: "P6",
      nextClassId: SUBJECT, enrolledFrom: "2026-02-02" }] }
  ] });
  await assert.rejects(createPostgresAcademicsRepository(pool).recordYearAdvancementDecision({
    staffId: ID, learnerId: ID, fromClassId: CLASS,
    academicTermId: TERM, decision: "Promote", reason: "Approved by Director"
  }), /Activate the new academic year/);
  assert.equal(pool.calls.length, 1);
});
