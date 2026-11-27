import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfflineMarkDraftAdmissionService } from "../src/sync/mark-draft-admission-service.mjs";
import { openOfflineMarkDraftVault } from "../src/sync/offline-mark-draft-vault.mjs";

const STAFF = "11111111-1111-4111-8111-111111111111";
const CLASS = "22222222-2222-4222-8222-222222222222";
const OTHER = "44444444-4444-4444-8444-444444444444";
const principal = {
  id: STAFF, principalType: "staff", accountStatus: "active",
  roles: ["class_teacher"], classIds: [CLASS],
  rolePermissions: { class_teacher: ["academics.marks_enter"] },
  session: { revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) }
};
const input = () => ({
  operationId: randomUUID(), learnerSourceId: randomUUID(),
  assessmentSourceId: randomUUID(), subjectSourceId: randomUUID(), score: 75
});
const verified = i => ({
  mappingVerified: true, recordStatus: "Open",
  learnerSourceId: i.learnerSourceId,
  assessmentSourceId: i.assessmentSourceId,
  subjectSourceId: i.subjectSourceId,
  classId: CLASS, maxScore: 100,
  baselineRevision: 1, baselineFingerprint: "a".repeat(64)
});
function harness(i, { actor = principal, mapped = verified(i), vaultResult = "queued_locally" } = {}) {
  const calls = { verified: 0, queued: 0 };
  const service = createOfflineMarkDraftAdmissionService({
    recordVerifier: { async verifyDraftSourceMapping(q) {
      calls.verified++;
      assert.deepEqual(q, {
        learnerSourceId: i.learnerSourceId,
        assessmentSourceId: i.assessmentSourceId,
        subjectSourceId: i.subjectSourceId
      });
      return mapped;
    }},
    vault: { async enqueueDraft(draft) {
      calls.queued++;
      calls.draft = draft;
      return { status: vaultResult };
    }}
  });
  return { service, calls, stage: () => service.stage({ principal: actor, input: i }) };
}
test("1. properly authorised staff can stage verified local encrypted draft", async () => {
  const i=input(), h=harness(i);
  const result=await h.stage();
  assert.equal(h.calls.verified,1);
  assert.equal(h.calls.queued,1);
  assert.equal(result.status,"queued_locally");
  assert.equal(result.storedLocallyEncrypted,true);
  assert.equal(result.serverMarkPosted,false);
  assert.equal(result.cloudSyncEnabled,false);
  assert.equal(result.safeToPublishResults,false);
  assert.equal(result.automaticReplayEnabled,false);
  assert.ok(Object.isFrozen(result));
  assert.equal(h.calls.draft.actorStaffId, STAFF);
  assert.equal(h.calls.draft.scope,"assessment_score");
  assert.equal(h.calls.draft.baselineRevision,1);
});
test("2. eligible teacher can stage at 0 and assessment maximum 100", async () => {
  for(const score of [0,100]) {
    const i={...input(),score};
    assert.equal((await harness(i).stage()).status,"queued_locally");
  }
});
test("3. staff permission must come from a live verified session", async () => {
  const i=input(), h=harness(i,{actor:{...principal,session:{...principal.session,expiresAt:new Date(2000)}}});
  await assert.rejects(h.stage(), /Access denied/);
  assert.equal(h.calls.verified,0);
  assert.equal(h.calls.queued,0);
});
test("4. guardian principal cannot save mark drafts", async () => {
  const i=input(), h=harness(i,{actor:{...principal,principalType:"guardian"}});
  await assert.rejects(h.stage(),/Access denied/);
  assert.equal(h.calls.verified,0);
});
test("5. lack of marks-enter permission blocks before any record lookup", async () => {
  const i=input(), h=harness(i,{actor:{...principal,rolePermissions:{class_teacher:["academics.results_view"]}}});
  await assert.rejects(h.stage(),/Access denied/);
  assert.equal(h.calls.verified,0);
});
test("6. mapping lookup must prove class teacher assignment", async () => {
  const i=input(), h=harness(i,{mapped:{...verified(i),classId:OTHER}});
  await assert.rejects(h.stage(),/Access denied/);
  assert.equal(h.calls.queued,0);
});
test("7. unresolved or unverified student source mapping cannot stage", async () => {
  const i=input();
  for (const mapped of [null,{}, {...verified(i),mappingVerified:false}]) {
    const h=harness(i,{mapped});
    await assert.rejects(h.stage(),/Access denied/);
    assert.equal(h.calls.queued,0);
  }
});
test("8. closed, locked, published and archived assessments cannot create drafts", async () => {
  const i=input();
  for (const status of ["Draft","Locked","Published","Archived"]) {
    const h=harness(i,{mapped:{...verified(i),recordStatus:status}});
    await assert.rejects(h.stage(),/Access denied/);
    assert.equal(h.calls.queued,0);
  }
});
test("9. learner, assessment or subject mismatch blocks all writes", async () => {
  const i=input();
  for (const field of ["learnerSourceId","assessmentSourceId","subjectSourceId"]) {
    const h=harness(i,{mapped:{...verified(i),[field]:randomUUID()}});
    await assert.rejects(h.stage(),/Access denied/);
    assert.equal(h.calls.queued,0);
  }
});
test("10. score larger than verified maximum or unsupported high-scale assessment blocks", async () => {
  const i=input();
  for (const maxScore of [60,0,-1,101,1000,NaN]) {
    const h=harness(i,{mapped:{...verified(i),maxScore}});
    await assert.rejects(h.stage(),/Access denied/);
    assert.equal(h.calls.queued,0);
  }
});
test("11. missing or unsafe baseline prevents staging", async () => {
  const i=input();
  for (const props of [{baselineRevision:0},{baselineRevision:"1"},{baselineFingerprint:"a"},{baselineFingerprint:null}]) {
    const h=harness(i,{mapped:{...verified(i),...props}});
    await assert.rejects(h.stage(),/Access denied/);
    assert.equal(h.calls.queued,0);
  }
});
test("12. rejects injected finance, guardian or client claimed permissions", async () => {
  const i=input();
  for(const change of [{ paymentAmount:250000 },{guardianPhone:"+256"},{classId:CLASS},{actorStaffId:STAFF}]) {
    const h=harness({...i,...change});
    await assert.rejects(h.service.stage({principal,input:{...i,...change}}),/not permitted/);
    assert.equal(h.calls.verified,0);
  }
});
test("13. invalid source identifiers, score type and score range fail before lookup", async () => {
  const i=input();
  for(const change of [{ learnerSourceId:"bad" },{ operationId:"../foo" },{ score:-1 },{ score:101 },{ score:"75" },{ score:NaN }]) {
    const h=harness(i);
    await assert.rejects(h.service.stage({principal,input:{...i,...change}}));
    assert.equal(h.calls.verified,0);
  }
});
test("14. vault rejection is not treated as posted or queued", async () => {
  const i=input(),h=harness(i,{vaultResult:"failed"});
  await assert.rejects(h.stage(),/not confirmed/);
  assert.equal(h.calls.queued,1);
});
test("15. true duplicate operation receives clearly idempotent response", async () => {
  const i=input(),h=harness(i,{vaultResult:"already_queued"});
  const result=await h.stage();
  assert.equal(result.status,"already_queued");
  assert.equal(result.serverMarkPosted,false);
});
test("16. incomplete dependencies reject service configuration", () => {
  assert.throws(()=>createOfflineMarkDraftAdmissionService(),/required/);
  assert.throws(()=>createOfflineMarkDraftAdmissionService({recordVerifier:{},vault:{}}),/required/);
});
test("17. integration: accepted request actually encrypts on disk but is never uploaded", async () => {
  const dir=await mkdtemp(join(tmpdir(),"cornhill-v21-admit-"));
  const key=randomBytes(32);
  try {
    const i=input(),vault=await openOfflineMarkDraftVault({directory:dir,key});
    const service=createOfflineMarkDraftAdmissionService({
      recordVerifier:{async verifyDraftSourceMapping(){return verified(i)}},
      vault
    });
    const first=await service.stage({principal,input:i});
    const second=await service.stage({principal,input:i});
    assert.equal(first.status,"queued_locally");
    assert.equal(second.status,"already_queued");
    assert.equal(first.cloudSyncEnabled,false);
    const restored=await vault.readDraft(i.operationId);
    assert.equal(restored.score,75);
    assert.equal(restored.actorStaffId,STAFF);
    assert.equal((await vault.countPending()).pending,1);
  }finally{await rm(dir,{recursive:true,force:true});key.fill(0);}
});
