import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOfflineChange } from '../src/sync/offline-conflict-core.mjs';
const id = '01234567-89ab-cdef-0123-456789abcdef';
const id2 = '11234567-89ab-cdef-0123-456789abcdef';
const v = (revision, chr='a', sourceId=id) => ({sourceId, revision, fingerprint:chr.repeat(64)});
const base = v(1);
const inp = (x={}) => ({scope:'learner_profile', permissionsVerified:true, snapshotConsistent:true, baseline:base, local:base, cloud:base, ...x});
const checkReadonly = result => {
  assert.equal(result.writesAllowed,false);
  assert.equal(result.automaticMergeAllowed,false);
  assert.equal(result.paymentSyncAllowed,false);
  assert.equal(result.recordIdentifiersDisclosed,false);
  assert.ok(Object.isFrozen(result));
  assert.doesNotMatch(JSON.stringify(result), /01234567-89ab|11234567-89ab|first_name|pupil_code/);
};
test('unchanged accepted baseline is in sync but does not enable writes',()=>{
  const r=classifyOfflineChange(inp());assert.equal(r.status,'in_sync');checkReadonly(r);
});
test('academic score uses same strict conflict classifier',()=>{
  const r=classifyOfflineChange(inp({scope:'assessment_score'}));assert.equal(r.status,'in_sync');checkReadonly(r);
});
test('cloud-only change requires review',()=>{
  const r=classifyOfflineChange(inp({cloud:v(2,'b')}));assert.equal(r.reason,'cloud_changed_since_baseline');checkReadonly(r);
});
test('local-only change requires review',()=>{
  const r=classifyOfflineChange(inp({local:v(2,'b')}));assert.equal(r.reason,'local_changed_since_baseline');checkReadonly(r);
});
test('same revision divergent fingerprints require manual conflict',()=>{
  const r=classifyOfflineChange(inp({local:v(2,'b'),cloud:v(2,'c')}));assert.equal(r.reason,'same_revision_different_content');checkReadonly(r);
});
test('both sides diverge even with different revisions: no last-write-wins',()=>{
  const r=classifyOfflineChange(inp({local:v(4,'b'),cloud:v(2,'c')}));assert.equal(r.reason,'both_sides_differ_from_baseline');checkReadonly(r);
});
test('identical newer versions require acceptance before use',()=>{
  const r=classifyOfflineChange(inp({local:v(2,'b'),cloud:v(2,'b')}));assert.equal(r.status,'review_required');checkReadonly(r);
});
test('missing local record cannot trigger deletion or recreation',()=>{
  const r=classifyOfflineChange(inp({local:null}));assert.equal(r.reason,'missing_record_no_automatic_delete_or_create');checkReadonly(r);
});
test('missing remote record cannot trigger deletion or upload',()=>{
  const r=classifyOfflineChange(inp({cloud:null}));assert.equal(r.status,'manual_review');checkReadonly(r);
});
test('missing baseline cannot infer origin ownership',()=>{
  const r=classifyOfflineChange(inp({baseline:null}));assert.equal(r.reason,'no_accepted_common_baseline');checkReadonly(r);
});
test('permissions must be exact boolean true',()=>{
  for(const x of [false,'true',1,null,undefined]){const r=classifyOfflineChange(inp({permissionsVerified:x}));assert.equal(r.status,'blocked');checkReadonly(r);}
});
test('snapshot consistency must be exact boolean true',()=>{
  for(const x of [false,'true',1,null,undefined]){const r=classifyOfflineChange(inp({snapshotConsistent:x}));assert.equal(r.status,'blocked');checkReadonly(r);}
});
test('source identifier mismatch blocks sync even when contents identical',()=>{
  const r=classifyOfflineChange(inp({cloud:v(1,'a',id2)}));assert.equal(r.reason,'source_identity_mismatch');checkReadonly(r);
});
test('revision rollback is blocked',()=>{
  const r=classifyOfflineChange(inp({baseline:v(5),local:v(4),cloud:v(6)}));assert.equal(r.reason,'revision_rollback_detected');checkReadonly(r);
});
test('rejects finance/guardian/payroll/school-payment scopes',()=>{
  for(const s of ['school_payments','finance','receipt','guardian','payroll','attendance','other',null]){
    assert.throws(()=>classifyOfflineChange(inp({scope:s})),/Scope not enabled/);
  }
});
test('rejects raw learner personal information as metadata',()=>{
  assert.throws(()=>classifyOfflineChange(inp({local:{...base,first_name:'Jane'}})),/unsupported field/);
  assert.throws(()=>classifyOfflineChange(inp({cloud:{...base,guardian_phone:'+256...'}})),/unsupported field/);
});
test('rejects malformed uuid, revision and fingerprint',()=>{
  for(const bad of [{...base,sourceId:'123'}, {...base,revision:0},{...base,revision:1.2},{...base,fingerprint:'a'}, {...base,fingerprint:'A'.repeat(64)}]){
    assert.throws(()=>classifyOfflineChange(inp({local:bad})),/requires sourceId/);
  }
});
test('rejects unexpected top-level fields and untrusted object types',()=>{
  assert.throws(()=>classifyOfflineChange({...inp(),payment_amount:5000}),/unsupported field/);
  assert.throws(()=>classifyOfflineChange([]),/plain object/);
  assert.throws(()=>classifyOfflineChange(null),/plain object/);
});
