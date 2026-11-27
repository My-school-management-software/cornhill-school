import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresAcademicDraftVerifier } from "../src/db/academic-draft-verifier.mjs";

const learner = "11111111-1111-4111-8111-111111111111";
const assessment = "22222222-2222-4222-8222-222222222222";
const subject = "33333333-3333-4333-8333-333333333333";
const klass = "44444444-4444-4444-8444-444444444444";
const args = { learnerSourceId: learner, assessmentSourceId: assessment, subjectSourceId: subject };
const noMarkRow = {
  learnerSourceId: learner, assessmentSourceId: assessment, subjectSourceId: subject,
  classId: klass, recordStatus: "Open", maxScore: "100",
  baselineRevision: null, savedScore: null, savedMaxScore: null,
  savedComment: null, existingMark: false
};
const markRow = {
  ...noMarkRow, baselineRevision: "5", savedScore: "77.25",
  savedMaxScore: "100", savedComment: "Progressing", existingMark: true
};
function fakePool(rows=[noMarkRow], failAt=null) {
  const queries=[];
  let released=0;
  const pool={async connect(){
    return {async query(sql,params){
      queries.push({sql,params});
      if(failAt && sql.includes(failAt)) throw new Error("Synthetic connection failure");
      return sql.includes("SELECT ") ? {rows} : {rows:[]};
    },release(){released++;}};
  }};
  const verifier=createPostgresAcademicDraftVerifier({
    pool, fingerprintSecret:"this-test-only-secret-never-used-in-production"
  });
  return {verifier,queries,get released(){return released;}};
}
test("1. only existing, active mark mapping is eligible for trusted baseline",async()=>{
  const f=fakePool([markRow]);
  const x=await f.verifier.verifyDraftSourceMapping(args);
  assert.equal(x.mappingVerified,true);
  assert.equal(x.recordStatus,"Open");
  assert.equal(x.maxScore,100);
  assert.equal(x.baselineRevision,5);
  assert.match(x.baselineFingerprint,/^[0-9a-f]{64}$/);
  assert.equal(x.classId,klass);
  assert.ok(Object.isFrozen(x));
});
test("2. absent initial mark has rev 1 but fingerprint distinct from existing mark",async()=>{
  const empty=await fakePool([noMarkRow]).verifier.verifyDraftSourceMapping(args);
  const filled=await fakePool([{...markRow,baselineRevision:"1"}]).verifier.verifyDraftSourceMapping(args);
  assert.equal(empty.baselineRevision,1);
  assert.notEqual(empty.baselineFingerprint,filled.baselineFingerprint);
});
test("3. fingerprint changes for saved score, teacher comment and revision",async()=>{
  const a=await fakePool([markRow]).verifier.verifyDraftSourceMapping(args);
  for(const newRow of [
    {...markRow,savedScore:"78"},
    {...markRow,savedComment:"Different"},
    {...markRow,baselineRevision:"6"},
    {...markRow,savedMaxScore:"90"}
  ]) {
    const b=await fakePool([newRow]).verifier.verifyDraftSourceMapping(args);
    assert.notEqual(a.baselineFingerprint,b.baselineFingerprint);
  }
});
test("4. mapping not found returns null and does not stage any mark",async()=>{
  const f=fakePool([]);
  assert.equal(await f.verifier.verifyDraftSourceMapping(args),null);
  assert.equal(f.queries.at(-1).sql,"ROLLBACK");
});
test("5. query occurs inside read only REPEATABLE READ with timeout and rollback",async()=>{
  const f=fakePool();
  await f.verifier.verifyDraftSourceMapping(args);
  assert.equal(f.queries[0].sql,"BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(f.queries[1].sql,"SET LOCAL statement_timeout = '5000ms'");
  assert.match(f.queries[2].sql,/FROM cornhill_school.learners l/);
  assert.match(f.queries[2].sql,/m\.offline_sync_revision/);
  assert.match(f.queries[2].sql,/ep\.status='Active'/);
  assert.match(f.queries[2].sql,/t\.status='Active'/);
  assert.match(f.queries[2].sql,/cs\.is_active=true/);
  assert.match(f.queries[2].sql,/a\.status='Open'/);
  assert.match(f.queries[2].sql,/LEFT JOIN cornhill_school.learner_marks/);
  assert.deepEqual(f.queries[2].params,[learner,assessment,subject]);
  assert.equal(f.queries[3].sql,"ROLLBACK");
  assert.equal(f.released,1);
});
test("6. database SELECT never accesses receipt, guardian or finance table",async()=>{
  const f=fakePool();
  await f.verifier.verifyDraftSourceMapping(args);
  const sql=f.queries[2].sql;
  assert.doesNotMatch(sql,/finance|payment_records|guardian_contacts|bank_accounts|receipt_no|payer_name/i);
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|COPY|DROP|TRUNCATE|ALTER)\b/i);
});
test("7. do not return a learner's name, code, marks, comment or private data",async()=>{
  const r=await fakePool([markRow]).verifier.verifyDraftSourceMapping(args);
  const s=JSON.stringify(r);
  assert.doesNotMatch(s,/Progressing|77.25|pupilCode|firstName|lastName|phone|payment|password|secret/);
});
test("8. invalid identifiers are rejected before opening database transaction",async()=>{
  const f=fakePool();
  for(const value of ["not-uuid",null,42,"../secret","aaaaaaaa-2222-4222-8222-222222222222".toUpperCase()]){
    await assert.rejects(f.verifier.verifyDraftSourceMapping({...args,learnerSourceId:value}));
  }
  assert.equal(f.queries.length,0);
});
test("9. mismatched source UUID or class mapping must fail closed",async()=>{
  for(const row of [
    {...noMarkRow,learnerSourceId:subject},
    {...noMarkRow,assessmentSourceId:subject},
    {...noMarkRow,subjectSourceId:assessment},
    {...noMarkRow,classId:"not-uuid"},
    {...noMarkRow,recordStatus:"Locked"}
  ]) {
    const f=fakePool([row]);
    await assert.rejects(f.verifier.verifyDraftSourceMapping(args));
    assert.equal(f.queries.at(-1).sql,"ROLLBACK");
  }
});
test("10. duplicate mapping rows fail closed without selecting an arbitrary student",async()=>{
  const f=fakePool([noMarkRow,noMarkRow]);
  await assert.rejects(f.verifier.verifyDraftSourceMapping(args),/Invalid source identity mapping/);
  assert.equal(f.released,1);
});
test("11. SQL read failure rolls back and releases connection",async()=>{
  const f=fakePool(undefined,"SELECT ");
  await assert.rejects(f.verifier.verifyDraftSourceMapping(args),/Synthetic connection failure/);
  assert.equal(f.queries.at(-1).sql,"ROLLBACK");
  assert.equal(f.released,1);
});
test("12. invalid baseline revision fails closed",async()=>{
  for(const revision of ["0","-1","x","9007199254740993",null]) {
    const f=fakePool([{...markRow,baselineRevision:revision}]);
    await assert.rejects(f.verifier.verifyDraftSourceMapping(args));
    assert.equal(f.queries.at(-1).sql,"ROLLBACK");
  }
});
test("13. impossible score or max score fails closed",async()=>{
  for(const r of [
    {...markRow,savedScore:"103"},
    {...markRow,savedMaxScore:"0"},
    {...markRow,maxScore:null},
    {...markRow,maxScore:"NaN"},
    {...markRow,savedScore:"-1"},
    {...markRow,savedScore:null}
  ]) {
    const f=fakePool([r]);
    if(r.savedScore==="103") continue; // 103/100 tested separately below
    await assert.rejects(f.verifier.verifyDraftSourceMapping(args));
  }
  await assert.rejects(fakePool([{...markRow,savedScore:"103"}]).verifier.verifyDraftSourceMapping(args));
});
test("14. maximum of 10,000 may be resolved, but higher-scale drafts remain gated upstream",async()=>{
  const row={...noMarkRow,maxScore:"10000"};
  const r=await fakePool([row]).verifier.verifyDraftSourceMapping(args);
  assert.equal(r.maxScore,10000);
});
test("15. changing fingerprint secret changes all resulting baselines",async()=>{
  const f=fakePool();
  const a=await f.verifier.verifyDraftSourceMapping(args);
  const p=fakePool();
  const original=p.verifier;
  const different=createPostgresAcademicDraftVerifier({
    pool:{connect:p.verifier ? async()=>(await ({
      query:async(sql)=>sql.includes("SELECT ")?{rows:[noMarkRow]}:{rows:[]},release(){}
    })) : null},
    fingerprintSecret:"different-test-secret-for-another-school-device"
  });
  const b=await different.verifyDraftSourceMapping(args);
  assert.notEqual(a.baselineFingerprint,b.baselineFingerprint);
});
test("16. constructor requires a restricted pool and private secret",()=>{
  assert.throws(()=>createPostgresAcademicDraftVerifier(),/required/);
  assert.throws(()=>createPostgresAcademicDraftVerifier({
    pool:{connect:async()=>{}},fingerprintSecret:"short"
  }),/required/);
});
test("17. missing initial mark must not have a revision",async()=>{
  const f=fakePool([{...noMarkRow,baselineRevision:"1"}]);
  await assert.rejects(f.verifier.verifyDraftSourceMapping(args),/Unexpected revision/);
});
test("18. mark comment beyond the database policy is rejected",async()=>{
  const f=fakePool([{...markRow,savedComment:"A".repeat(601)}]);
  await assert.rejects(f.verifier.verifyDraftSourceMapping(args),/comment is invalid/);
});
