import test from "node:test";
import assert from "node:assert/strict";
import {validateNurseryMaterialCollection, summarizeNurseryMaterialCollections} from "../src/security/nursery-materials-contract.mjs";

const learnerId = "11111111-1111-4111-8111-111111111111";
const otherLearnerId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
function sample(patch = {}) {
  return {learnerId, requestId, materialName:"Crayons",quantityReceived:2,
    receivedDate:"2026-11-28",notes:"Received at school office",...patch};
}

test("one learner's Nursery materials accepted", () => {
  const result = validateNurseryMaterialCollection(sample());
  assert.equal(result.quantityReceived, 2);
  assert.equal(result.materialName, "Crayons");
  assert.ok(Object.isFrozen(result));
});
test("does not accept class-wide or bulk collection", () => {
  for(const key of ["classId","learnerIds","bulk","receivedByStaffId"]) {
    assert.throws(() => validateNurseryMaterialCollection(sample({[key]:"value"})));
  }
});
test("received-by staff identity is never supplied by client", () => {
  assert.throws(() => validateNurseryMaterialCollection(sample({actorStaffId: learnerId})));
});
test("quantities must be positive safe whole numbers", () => {
  for (const quantityReceived of [-1, 0, 1.5, "2", NaN, Infinity, 1001]) {
    assert.throws(() => validateNurseryMaterialCollection(sample({quantityReceived})));
  }
});
test("real calendar dates only", () => {
  for (const receivedDate of ["2026-02-30","2026-11-31","28/11/2026","2026-13-01"]) {
    assert.throws(() => validateNurseryMaterialCollection(sample({receivedDate})));
  }
});
test("invalid or missing learner IDs and request IDs refused", () => {
  for (const field of ["learnerId", "requestId"]) {
    assert.throws(() => validateNurseryMaterialCollection(sample({[field]:"not-a-uuid"})));
    assert.throws(() => validateNurseryMaterialCollection(sample({[field]:null})));
  }
});
test("controls in material name or notes rejected", () => {
  assert.throws(() => validateNurseryMaterialCollection(sample({materialName:"A4\nream"})));
  assert.throws(() => validateNurseryMaterialCollection(sample({notes:"first\u0000second"})));
});
test("optional notes and normalized labels supported", () => {
  assert.equal(validateNurseryMaterialCollection(sample({notes:""})).notes, null);
  assert.equal(validateNurseryMaterialCollection(sample({materialName:"  A4 ream  "})).materialName,"A4 ream");
});
test("one learner's repeated collections aggregate correctly", () => {
  const receipts=[sample(),sample({requestId:"44444444-4444-4444-8444-444444444444",materialName:"crayons",quantityReceived:3})];
  const s=summarizeNurseryMaterialCollections(learnerId,receipts);
  assert.equal(s.collectionEvents,2);
  assert.equal(s.materials.length,1);
  assert.equal(s.materials[0].quantityReceived,5);
});
test("cannot silently mix learners' collected items", () => {
  assert.throws(() => summarizeNurseryMaterialCollections(learnerId,[sample(),sample({learnerId:otherLearnerId})]));
});
test("idempotency request duplicates cannot double count", () => {
  assert.throws(() => summarizeNurseryMaterialCollections(learnerId,[sample(),sample()]));
});
test("reject unexpected primitives/arrays", () => {
  for(const value of [null, [], 4, "record"]) assert.throws(()=>validateNurseryMaterialCollection(value));
});
