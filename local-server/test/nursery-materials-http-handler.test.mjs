import test from "node:test";
import assert from "node:assert/strict";
import {createNurseryMaterialsHttpHandler} from "../src/security/nursery-materials-http-handler.mjs";
import {AuthenticationError, CsrfValidationError} from "../src/security/auth-service.mjs";
const STAFF="11111111-1111-4111-8111-111111111111";
const LEARNER="22222222-2222-4222-8222-222222222222";
const CLASS="33333333-3333-4333-8333-333333333333";
const REQUEST="44444444-4444-4444-8444-444444444444";
const ORIGIN="https://localhost:4174";
const PATH="/api/v1/school/learners/"+LEARNER+"/nursery-materials";
const body={requestId:REQUEST,materialName:"Crayons",quantityReceived:2,receivedDate:"2026-11-28",notes:"Office received"};

function principal(roles=["director"],permissionCodes=["learners.read","learners.manage"]){
 return {id:STAFF,principalType:"staff",accountStatus:"active",roles,
   rolePermissions:Object.fromEntries(roles.map(role=>[role,permissionCodes])),
   classIds:[CLASS],session:{revokedAt:null,expiresAt:Date.now()+60000}};
}
function req({method="GET",path=PATH,origin=ORIGIN,host="localhost:4174",encrypted=true,body:payload,headers={}}={}){
 return {method,url:path,headers:{host,origin,cookie:"", "x-cornhill-csrf":"valid-csrf",
   "content-type":"application/json",...headers},socket:{encrypted},
   async *[Symbol.asyncIterator](){if(payload!==undefined)yield Buffer.from(JSON.stringify(payload));}};
}
function response(){return {status:null,headers:{},body:"",writeHead(status,headers={}){this.status=status;this.headers=headers;},end(b=""){this.body=b?.toString()??"";},json(){return this.body?JSON.parse(this.body):null;}};}
function setup({staff=principal(),scope={classId:CLASS,status:"Active",classSection:"Nursery"},
   authError, overrides={}}={}){
 const calls={authentication:[],scope:[],list:[],record:[]};
 const handler=createNurseryMaterialsHttpHandler({
   expectedOrigin:ORIGIN,
   authService:{async authenticate(arg){calls.authentication.push(arg);if(authError)throw authError;return staff;}},
   repository:{
      async getLearnerScope(id){calls.scope.push(id);return scope;},
      async listCollections(id){calls.list.push(id);return [];},
      async summarizeAllCollections(id){return {learnerId:id,collectionEvents:0,materials:[]};},
      async recordCollection(arg){calls.record.push(arg);return {created:true,receipt:{id:REQUEST,...arg.collection}};}
   },
   ...overrides
 });
 return {handler,calls};
}
async function invoke(handler,options={}) {const res=response();const handled=await handler(req(options),res);return {...res,handled};}

test("GET requires HTTPS and exact local host",async()=>{
 const {handler,calls}=setup();
 assert.equal((await invoke(handler,{encrypted:false})).status,426);
 assert.equal((await invoke(handler,{host:"other.invalid"})).status,421);
 assert.equal(calls.authentication.length,0);
});
test("staff may read one Nursery learner's collection summary only",async()=>{
 const {handler,calls}=setup();
 const result=await invoke(handler);
 assert.equal(result.status,200);
 assert.deepEqual(result.json().receipts,[]);
 assert.equal(result.json().summary.learnerId,LEARNER);
 assert.deepEqual(calls.list,[LEARNER]);
 assert.equal(result.headers["Cache-Control"],"no-store");
});
test("guardian cannot read even if permissions are spoofed",async()=>{
 const staff={...principal(),principalType:"guardian"};
 const {handler,calls}=setup({staff});
 assert.equal((await invoke(handler)).status,403);
 assert.equal(calls.scope.length,0);
});
test("staff lacking learner permission denied",async()=>{
 const {handler,calls}=setup({staff:principal(["teacher"],[])});
 assert.equal((await invoke(handler)).status,403);
 assert.equal(calls.scope.length,0);
});
test("unassigned class teachers cannot read another learner",async()=>{
 const staff={...principal(["class_teacher"]),classIds:["99999999-9999-4999-8999-999999999999"]};
 const {handler,calls}=setup({staff});
 assert.equal((await invoke(handler)).status,403);
 assert.equal(calls.list.length,0);
});
test("authorized assigned teachers may GET but may not POST without learners.manage",async()=>{
 const {handler,calls}=setup({staff:principal(["class_teacher"],["learners.read"])});
 assert.equal((await invoke(handler)).status,200);
 assert.equal((await invoke(handler,{method:"POST",body})).status,403);
 assert.equal(calls.record.length,0);
});
test("non-Nursery or missing learner cannot be accessed through this route",async()=>{
 const {handler}=setup({scope:null});
 assert.equal((await invoke(handler)).status,404);
});
test("POST validates CSRF/origin and identity-bound staff author",async()=>{
 const {handler,calls}=setup();
 assert.equal((await invoke(handler,{method:"POST",origin:"https://evil.invalid",body})).status,421);
 const ok=await invoke(handler,{method:"POST",body});
 assert.equal(ok.status,201);
 assert.equal(calls.record.length,1);
 assert.equal(calls.record[0].actorStaffId,STAFF);
 assert.equal(calls.record[0].collection.learnerId,LEARNER);
 assert.equal(calls.authentication[0].method,"POST");
});
test("POST refuses bulk class receipt and browser actor impersonation",async()=>{
 const {handler,calls}=setup();
 for (const change of [{classId:CLASS},{actorStaffId:STAFF},{learnerIds:[LEARNER]},{learnerId:LEARNER}]) {
   const res=await invoke(handler,{method:"POST",body:{...body,...change}});
   assert.equal(res.status,400,res.body);
 }
 assert.equal(calls.record.length,0);
});
test("POST rejects invalid dates and noninteger quantities",async()=>{
 const {handler,calls}=setup();
 for (const change of [{receivedDate:"2026-11-31"},{quantityReceived:-1},{quantityReceived:2.5},{requestId:"not-uuid"}]){
  assert.equal((await invoke(handler,{method:"POST",body:{...body,...change}})).status,400);
 }
 assert.equal(calls.record.length,0);
});
test("POST refuses inactive learner",async()=>{
 const {handler,calls}=setup({scope:{classId:CLASS,status:"Withdrawn",classSection:"Nursery"}});
 assert.equal((await invoke(handler,{method:"POST",body})).status,409);
 assert.equal(calls.record.length,0);
});
test("idempotent previous receipt response is 200, not duplicate 201",async()=>{
 const {handler}=setup({overrides:{repository:{
   async getLearnerScope(){return {classId:CLASS,status:"Active"};},
   async listCollections(){return [];},
   async summarizeAllCollections(id){return {learnerId:id,collectionEvents:0,materials:[]};},
   async recordCollection(){return {created:false,receipt:{id:REQUEST}};}
 }}});
 const res=await invoke(handler,{method:"POST",body});
 assert.equal(res.status,200);
 assert.equal(res.json().alreadyRecorded,true);
});
test("HTTP error mapping does not expose database secrets",async()=>{
 const {handler}=setup({overrides:{repository:{
  async getLearnerScope(){throw new Error("db password=secret");},
  async listCollections(){return [];},async summarizeAllCollections(id){return {learnerId:id,collectionEvents:0,materials:[]};},async recordCollection(){return {};}
 }}});
 const res=await invoke(handler);
 assert.equal(res.status,503);
 assert.doesNotMatch(res.body,/secret/);
});
test("authentication error and invalid CSRF deny request",async()=>{
 for(const [error,status] of [[new AuthenticationError(),401],[new CsrfValidationError(),403]]) {
  const {handler}=setup({authError:error});
  const res=await invoke(handler,{method:"POST",body});
  assert.equal(res.status,status);
 }
});
test("POST rejects other methods and unrelated routes",async()=>{
 const {handler}=setup();
 assert.equal((await invoke(handler,{method:"DELETE"})).status,405);
 assert.equal((await invoke(handler,{path:"/api/v1/school/catalog"})).handled,false);
});
test("GET reports all-time totals when 1000-row visible history is incomplete",async()=>{
 const {handler}=setup({overrides:{repository:{
  async getLearnerScope(){return {classId:CLASS,status:"Active",classSection:"Nursery"};},
  async listCollections(){return [];},
  async summarizeAllCollections(id){return {learnerId:id,collectionEvents:1001,
    materials:[{materialName:"Crayons",quantityReceived:2002,collectionEvents:1001}]};},
  async recordCollection(){return {};}
 }}});
 const res=await invoke(handler);
 assert.equal(res.status,200);
 assert.equal(res.json().summary.collectionEvents,1001);
 assert.equal(res.json().historyLimited,true);
});
test("HEAD contains no personal rows in response body",async()=>{
 const {handler}=setup();
 const res=await invoke(handler,{method:"HEAD"});
 assert.equal(res.status,200);
 assert.equal(res.body,"");
});
