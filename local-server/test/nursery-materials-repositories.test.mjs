import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresNurseryMaterialsRepository} from "../src/db/nursery-materials-repositories.mjs";
import {summarizeNurseryMaterialCollections} from "../src/security/nursery-materials-contract.mjs";
const STAFF="11111111-1111-4111-8111-111111111111";
const LEARNER="22222222-2222-4222-8222-222222222222";
const REQUEST="44444444-4444-4444-8444-444444444444";
const collection={learnerId:LEARNER,requestId:REQUEST,materialName:"Crayons",quantityReceived:2,receivedDate:"2026-11-28",notes:null};
const row={id:"55555555-5555-4555-8555-555555555555",requestId:REQUEST,learnerId:LEARNER,materialName:"Crayons",quantityReceived:2,receivedDate:"2026-11-28",notes:null,recordedByStaffId:STAFF,createdAt:new Date()};
const input={actorStaffId:STAFF,collection};
function fake(steps){const calls=[];return {calls,pool:{async query(sql,values){calls.push({sql,values});const x=steps[calls.length-1];if(x instanceof Error)throw x;return x??{rows:[]};}}};}

test("single Nursery learner scope uses a parameter and class join",async()=>{
 const {pool,calls}=fake([{rows:[{id:LEARNER,classId:STAFF,status:"Active",classSection:"Nursery"}]}]);
 const repo=createPostgresNurseryMaterialsRepository(pool);
 const value=await repo.getLearnerScope(LEARNER);
 assert.equal(value.classSection,"Nursery");
 assert.deepEqual(calls[0].values,[LEARNER]);
 assert.match(calls[0].sql,/JOIN cornhill_school\.classes/);
});
test("non-Nursery scope never appears as an eligible material learner",async()=>{
 const {pool}=fake([{rows:[{id:LEARNER,classSection:"Primary"}]}]);
 assert.equal(await createPostgresNurseryMaterialsRepository(pool).getLearnerScope(LEARNER),null);
});
test("receipt list bound to selected learner only",async()=>{
 const {pool,calls}=fake([{rows:[row]}]);
 const items=await createPostgresNurseryMaterialsRepository(pool).listCollections(LEARNER);
 assert.equal(items.length,1);assert.deepEqual(calls[0].values,[LEARNER]);
 assert.match(calls[0].sql,/WHERE learner_id=\$1::uuid/);
 assert.match(calls[0].sql,/LIMIT 1000/);
});
test("all-time material summary uses a separate aggregated learner-scoped SQL query",async()=>{
 const {pool,calls}=fake([{rows:[{materialName:"Crayons",collectionEvents:"1001",
   quantityReceived:"2002"}]}]);
 const summary=await createPostgresNurseryMaterialsRepository(pool).summarizeAllCollections(LEARNER);
 assert.equal(summary.collectionEvents,1001);
 assert.equal(summary.materials[0].quantityReceived,2002);
 assert.deepEqual(calls[0].values,[LEARNER]);
 assert.match(calls[0].sql,/SUM\(quantity_received\)/);
 assert.match(calls[0].sql,/WHERE learner_id=\$1::uuid/);
 assert.doesNotMatch(calls[0].sql,/LIMIT 1000/);
});
test("all-time summary rejects overflow and unsafe quantities",async()=>{
 const {pool}=fake([{rows:[{materialName:"Crayons",collectionEvents:"9007199254740993",
   quantityReceived:"100"}]}]);
 await assert.rejects(()=>createPostgresNurseryMaterialsRepository(pool).summarizeAllCollections(LEARNER),RangeError);
});
test("new collection binds staff identity to server-side parameter",async()=>{
 const {pool,calls}=fake([{rows:[row]}]);
 const r=await createPostgresNurseryMaterialsRepository(pool).recordCollection(input);
 assert.equal(r.created,true);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].values,[LEARNER,REQUEST,"Crayons",2,"2026-11-28",null,STAFF]);
 assert.match(calls[0].sql,/c\.section='Nursery'/);
 assert.match(calls[0].sql,/l\.status='Active'/);
 assert.match(calls[0].sql,/ON CONFLICT \(request_id\) DO NOTHING/);
});
test("same request id and identical details is idempotent without second insertion",async()=>{
 const {pool,calls}=fake([{rows:[]},{rows:[row]}]);
 const result=await createPostgresNurseryMaterialsRepository(pool).recordCollection(input);
 assert.equal(result.created,false);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[1].values,[REQUEST]);
});
test("same key with changed quantity refuses receipt substitution",async()=>{
 const {pool}=fake([{rows:[]},{rows:[{...row,quantityReceived:5}]}]);
 await assert.rejects(()=>createPostgresNurseryMaterialsRepository(pool).recordCollection(input),{code:"COLLECTION_CONFLICT"});
});
test("same key attached to different learner refuses cross-learner data access",async()=>{
 const {pool}=fake([{rows:[]},{rows:[{...row,learnerId:"66666666-6666-4666-8666-666666666666"}]}]);
 await assert.rejects(()=>createPostgresNurseryMaterialsRepository(pool).recordCollection(input),{code:"COLLECTION_CONFLICT"});
});
test("same key attached to different staff cannot be replayed across accounts",async()=>{
 const {pool}=fake([{rows:[]},{rows:[{...row,recordedByStaffId:"66666666-6666-4666-8666-666666666666"}]}]);
 await assert.rejects(()=>createPostgresNurseryMaterialsRepository(pool).recordCollection(input),{code:"COLLECTION_CONFLICT"});
});
test("ineligible learner cannot receive school materials even with valid request id",async()=>{
 const {pool}=fake([{rows:[]},{rows:[]}]);
 await assert.rejects(()=>createPostgresNurseryMaterialsRepository(pool).recordCollection(input),{code:"COLLECTION_CONFLICT"});
});
test("database receipt row includes audit fields but per-learner summary only counts quantity",()=>{
 const result=summarizeNurseryMaterialCollections(LEARNER,[row]);
 assert.equal(result.collectionEvents,1);
 assert.equal(result.materials[0].quantityReceived,2);
});
test("repository has no delete or update API",()=>{
 const {pool}=fake([]);
 const repository=createPostgresNurseryMaterialsRepository(pool);
 assert.deepEqual(Object.keys(repository).sort(),["getLearnerScope","listCollections","recordCollection","summarizeAllCollections"]);
});
test("rejects malformed UUID before sending database queries",async()=>{
 const {pool,calls}=fake([]);
 await assert.rejects(()=>createPostgresNurseryMaterialsRepository(pool).getLearnerScope("not-a-uuid"),/invalid/);
 assert.equal(calls.length,0);
});
