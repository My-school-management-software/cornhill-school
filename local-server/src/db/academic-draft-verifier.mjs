// CORNHILL V2.1: trusted local PostgreSQL source/assessment mapping verifier.
// Read-only. No public HTTP route, marks writes, hosted calls or finance access.
// assessmentSourceId / subjectSourceId are LOCAL UUIDs until cross-system
// academic identity mapping is independently accepted.
import { createHmac } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SQL = [
  'SELECT l.source_record_id::text AS "learnerSourceId",',
  'a.id::text AS "assessmentSourceId",',
  's.id::text AS "subjectSourceId",',
  'a.class_id::text AS "classId", a.status AS "recordStatus",',
  'a.max_score::text AS "maxScore",',
  'm.offline_sync_revision::text AS "baselineRevision",',
  'm.score::text AS "savedScore",',
  'm.max_score::text AS "savedMaxScore",',
  'm.teacher_comment AS "savedComment", m.id IS NOT NULL AS "existingMark"',
  'FROM cornhill_school.learners l',
  'JOIN cornhill_school.assessments a ON a.id=$2::uuid',
  'JOIN cornhill_school.academic_terms t',
  " ON t.id=a.academic_term_id AND t.status='Active'",
  'JOIN cornhill_school.class_subjects cs',
  ' ON cs.class_id=a.class_id AND cs.subject_id=$3::uuid AND cs.is_active=true',
  'JOIN cornhill_school.subjects s ON s.id=cs.subject_id AND s.is_active=true',
  'JOIN cornhill_school.enrolment_periods ep',
  ' ON ep.learner_id=l.id AND ep.class_id=a.class_id',
  " AND ep.status='Active' AND ep.exit_date IS NULL",
  " AND ep.admission_date<=COALESCE(a.assessment_date,(a.created_at AT TIME ZONE 'Africa/Kampala')::date)",
  'LEFT JOIN cornhill_school.learner_marks m',
  ' ON m.assessment_id=a.id AND m.learner_id=l.id AND m.subject_id=s.id',
  'WHERE l.source_record_id=$1::uuid',
  " AND l.status='Active' AND a.status='Open'",
  'LIMIT 2'
].join('\n');

function requireUuid(value, name) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new TypeError(name + " must be a lowercase UUID");
  }
}
function readRevision(value, exists) {
  if (!exists) {
    if (value !== null) throw new TypeError("Unexpected revision on missing mark");
    return 1;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new TypeError("Invalid database mark revision");
  }
  const rev = Number(value);
  if (!Number.isSafeInteger(rev)) throw new TypeError("Unsafe mark revision");
  return rev;
}
function requireScore(value, name) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number) ||
      number < 0 || number > 10000) throw new TypeError("Invalid " + name);
  return number;
}
export function createPostgresAcademicDraftVerifier({ pool, fingerprintSecret } = {}) {
  if (!pool || typeof pool.connect !== "function" ||
      typeof fingerprintSecret !== "string" ||
      Buffer.byteLength(fingerprintSecret,"utf8") < 32) {
    throw new TypeError("Verified PostgreSQL pool and private fingerprint key required");
  }
  const key = fingerprintSecret;
  async function verifyDraftSourceMapping({ learnerSourceId, assessmentSourceId, subjectSourceId } = {}) {
    requireUuid(learnerSourceId,"learnerSourceId");
    requireUuid(assessmentSourceId,"assessmentSourceId");
    requireUuid(subjectSourceId,"subjectSourceId");
    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      inTransaction = true;
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const response = await client.query(SQL, [
        learnerSourceId,assessmentSourceId,subjectSourceId
      ]);
      if (!Array.isArray(response?.rows) || response.rows.length > 1) {
        throw new Error("Invalid source identity mapping result");
      }
      const row = response.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        inTransaction=false;
        return null;
      }
      if (row.learnerSourceId!==learnerSourceId ||
          row.assessmentSourceId!==assessmentSourceId ||
          row.subjectSourceId!==subjectSourceId ||
          !UUID.test(row.classId) || row.recordStatus!=="Open" ||
          typeof row.existingMark!=="boolean") {
        throw new Error("Source identity mapping could not be verified");
      }
      const maxScore=requireScore(row.maxScore,"assessment maximum");
      const baselineRevision=readRevision(row.baselineRevision,row.existingMark);
      const score=row.existingMark ? requireScore(row.savedScore,"saved score") : null;
      const savedMax=row.existingMark ? requireScore(row.savedMaxScore,"saved maximum") : null;
      if(row.existingMark && (score>savedMax || savedMax<=0)){
        throw new Error("Stored mark is inconsistent");
      }
      if (row.savedComment!==null &&
          (typeof row.savedComment!=="string" || row.savedComment.length>600)) {
        throw new Error("Stored teacher comment is invalid");
      }
      const digest=createHmac("sha256",key)
        .update(JSON.stringify([
          "cornhill:academic-mark-baseline:v21",
          learnerSourceId,assessmentSourceId,subjectSourceId,
          row.existingMark,baselineRevision,score,savedMax,row.savedComment
        ]))
        .digest("hex");
      await client.query("ROLLBACK");
      inTransaction=false;
      // Do not return raw marks, comments, learner names or receipt data.
      return Object.freeze({
        mappingVerified:true, recordStatus:"Open",
        learnerSourceId,assessmentSourceId,subjectSourceId,
        classId:row.classId,maxScore,
        baselineRevision,baselineFingerprint:digest
      });
    } catch(error) {
      if(inTransaction){try{await client.query("ROLLBACK")}catch{}}
      throw error;
    } finally {client.release()}
  }
  return Object.freeze({verifyDraftSourceMapping});
}
