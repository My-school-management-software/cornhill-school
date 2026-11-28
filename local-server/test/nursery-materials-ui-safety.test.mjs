import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../public/school.js",import.meta.url),"utf8");
const html=await readFile(new URL("../public/school.html",import.meta.url),"utf8");

test("material receipt UI is per learner and never marks an entire class collected",()=>{
  assert.match(source,/openNurseryMaterials\(l\)/);
  assert.match(source,/selectedNurseryLearner=l/);
  assert.match(source,/encodeURIComponent\(learner\.id\)\+"\/nursery-materials"/);
  assert.doesNotMatch(source,/materialReceiptsByClass|markClassMaterialsReceived/);
});
test("uncertain receipts keep their request UUID even after dialog close and reopen",()=>{
  assert.match(source,/const nurseryUnresolvedRequestsByLearner=new Map\(\)/);
  assert.match(source,/nurseryPendingReceiptRequest=nurseryUnresolvedRequestsByLearner\.get\(l\.id\)\?\?null/);
  assert.match(source,/nurseryUnresolvedRequestsByLearner\.set\(learner\.id,nurseryPendingReceiptRequest\)/);
  assert.match(source,/nurseryUnresolvedRequestsByLearner\.delete\(learner\.id\)/);
  // Session logout MUST clear private pending receipts; dialog close must not.\n  assert.match(source,/nurseryUnresolvedRequestsByLearner\.clear\(\)/);\n  assert.doesNotMatch(source,/addEventListener\("close",[^;]*nurseryUnresolvedRequestsByLearner\.clear\(\)/);
});
test("reopening restores exact pending receipt details and warns office receiver",()=>{
  assert.match(source,/JSON\.parse\(nurseryPendingReceiptRequest\.serialized\)/);
  assert.match(source,/for\(const name of \["materialName","quantityReceived","receivedDate","notes"\]\)/);
  assert.match(source,/A previous receipt has an uncertain confirmation/);
  assert.match(source,/nurseryPendingReceiptRequest\.serialized!==serialized/);
});
test("summary warns when displayed history omits older receipt records",()=>{
  assert.match(source,/d\.historyLimited/);
  assert.match(source,/Totals cover all history/);
  assert.match(source,/d\.summary\?\.collectionEvents/);
});
test("form uses Uganda date and displays separate learner's pupil code",()=>{
  assert.match(source,/timeZone:"Africa\/Kampala"/);
  assert.match(source,/nurseryLearnerLabel\(l\)\+" · "\+l\.pupilCode/);
  assert.match(html,/id="nursery-materials-dialog"/);
});
test("signed-in outer V47C ribbon stays untouched in this PR",()=>{
  assert.doesNotMatch(source,/v47-back|v47-forward|v47-home|v47-school-ribbon/);
});
