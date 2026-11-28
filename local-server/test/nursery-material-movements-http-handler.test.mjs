import test from "node:test";
import assert from "node:assert/strict";
import {createNurseryMaterialMovementsHttpHandler} from "../src/security/nursery-material-movements-http-handler.mjs";
import {AuthenticationError,CsrfValidationError} from "../src/security/auth-service.mjs";
const LEARNER="11111111-1111-4111-8111-111111111111";
const STAFF="22222222-2222-4222-8222-222222222222";
const TEACHER="33333333-3333-4333-8333-333333333333";
const CLASS="55555555-5555-4555-8555-555555555555";
const REQ="44444444-4444-4444-8444-444444444444";
const ORIGIN="https://localhost:4174";
const PATH="/api/v1/school/learners/"+LEARNER+"/nursery-material-movements";
const RECS="/api/v1/school/nursery-material-records-center";
const TEACHERS="/api/v1/school/nursery-material-teachers";
const body={requestId:REQ,materialName:"Crayons",movementType:"teacher_issue",
 quantity:2,movementDate:"2026-11-28",teacherStaffId:TEACHER,reason:"Daily lesson supplies"};
function principal(roles=["director"],codes=["learners.read","learners.manage","system.roles_manage"]){
 return {id:STAFF,principalType:"staff",accountStatus:"active",roles,classIds:[CLASS],
   rolePermissions:Object.fromEntries(roles.map(role=>[role,codes])),
   session:{expiresAt:Date.now()+3600000,revokedAt:null}};
}
function request({method="GET",path=PATH,headers={},encrypted=true,body:input}={}){
 return {method,url:path,headers:{host:"localhost:4174",origin:ORIGIN,
  "content-type":"application/json","x-cornhill-csrf":"test",cookie:"",...headers},
  socket:{encrypted},async *[Symbol.asyncIterator](){
   if(input!==undefined)yield Buffer.from(JSON.stringify(input));}};
}
function response(){return{status:null,body:"",headers:{},writeHead(s,h){this.status=s;this.headers=h;},end(b=""){this.body=b?.toString()??"";},json(){return this.body?JSON.parse(this.body):null;}};}
function setup({p=principal(),scope={classId:CLASS,status:"Active",classSection:"Nursery"},authError}={}){
 const calls={record:0,records:0,teachers:0,reads:0};
 const h=createNurseryMaterialMovementsHttpHandler({
   authService:{async authenticate(){if(authError)throw authError;return p;}},
   expectedOrigin:ORIGIN,
   learnerRepository:{async getLearnerScope(){return scope;}},
   repository:{
     async recordMovement({actorStaffId,movement}){calls.record++;return{created:true,movement:{...movement,recordedByStaffId:actorStaffId}};},
     async listMovements(){calls.reads++;return[];},
     async summary(){return[{materialName:"Crayons",officeRemaining:2,teacherOutstanding:0}];},
     async listTeachers(){calls.teachers++;return[{id:TEACHER,name:"Teacher 1"}];},
     async recordsCentre(){calls.records++;return{rows:[],limited:false};}
   }
 });
 return {h,calls};
}
async function invoke(h,opts={}){
 const res=response(),handled=await h(request(opts),res);
 return{handled,status:res.status,body:res.body,payload:res.json(),headers:res.headers};
}
test("movement API ignores unrelated paths and unsupported methods",async()=>{
 const {h}=setup();
 assert.equal((await invoke(h,{path:"/api/v1/unknown"})).handled,false);
 assert.equal((await invoke(h,{method:"DELETE"})).status,405);
});
test("HTTPS, host and POST origin are mandatory",async()=>{
 const {h,calls}=setup();
 assert.equal((await invoke(h,{encrypted:false})).status,426);
 assert.equal((await invoke(h,{headers:{host:"other.invalid"}})).status,421);
 assert.equal((await invoke(h,{method:"POST",body,headers:{origin:"https://other.invalid"}})).status,421);
 assert.equal(calls.record,0);
});
test("Director-only Records Centre GET excludes guardians and teachers",async()=>{
 const {h,calls}=setup();
 const ok=await invoke(h,{path:RECS});
 assert.equal(ok.status,200);assert.equal(calls.records,1);
 const no=setup({p:principal(["teacher"],["learners.read","learners.manage"])});
 assert.equal((await invoke(no.h,{path:RECS})).status,403);
 assert.equal(no.calls.records,0);
 const guardian=setup({p:{...principal(),principalType:"guardian"}});
 assert.equal((await invoke(guardian.h,{path:RECS})).status,403);
});
test("Director report requires privileged permission as well as role",async()=>{
 const {h}=setup({p:principal(["director"],["learners.read"])});
 assert.equal((await invoke(h,{path:RECS})).status,403);
});
test("office staff can find teacher directory only with manage permission",async()=>{
 const {h,calls}=setup({p:principal(["headteacher"],["learners.manage"])});
 assert.equal((await invoke(h,{path:TEACHERS})).status,200);assert.equal(calls.teachers,1);
 const limited=setup({p:principal(["teacher"],["learners.read"])});
 assert.equal((await invoke(limited.h,{path:TEACHERS})).status,403);
});
test("GET learner movements requires class assignment for class teacher",async()=>{
 const limited=setup({p:{...principal(["class_teacher"],["learners.read"]),classIds:[]}});
 assert.equal((await invoke(limited.h)).status,403);
 assert.equal(limited.calls.reads,0);
 const allowed=setup({p:principal(["class_teacher"],["learners.read"])});
 assert.equal((await invoke(allowed.h)).status,200);
 assert.equal(allowed.calls.reads,1);
});
test("guardian cannot read a learner's private materials",async()=>{
 const {h,calls}=setup({p:{...principal(),principalType:"guardian"}});
 assert.equal((await invoke(h)).status,403);assert.equal(calls.reads,0);
});
test("POST records only the authenticated staff actor and selected learner",async()=>{
 const {h,calls}=setup();
 const r=await invoke(h,{method:"POST",body});
 assert.equal(r.status,201);assert.equal(calls.record,1);
 assert.equal(r.payload.movement.recordedByStaffId,STAFF);
 assert.equal(r.payload.movement.learnerId,LEARNER);
});
test("POST rejects impersonated actor and class-level batch",async()=>{
 const {h,calls}=setup();
 for(const field of [{actorStaffId:TEACHER},{classId:CLASS},{learnerIds:[LEARNER]}]){
   assert.equal((await invoke(h,{method:"POST",body:{...body,...field}})).status,400);
 }
 assert.equal(calls.record,0);
});
test("teacher without learners.manage can view own class but cannot alter stock",async()=>{
 const {h,calls}=setup({p:principal(["teacher"],["learners.read"])});
 assert.equal((await invoke(h)).status,200);
 assert.equal((await invoke(h,{method:"POST",body})).status,403);
 assert.equal(calls.record,0);
});
test("only Director may approve leftover surplus transfers",async()=>{
 const surplus={...body,movementType:"director_surplus",teacherStaffId:null,surplusUnitValueUgx:2000};
 const office=setup({p:principal(["headteacher"],["learners.read","learners.manage"])});
 assert.equal((await invoke(office.h,{method:"POST",body:surplus})).status,403);
 const dir=setup();assert.equal((await invoke(dir.h,{method:"POST",body:surplus})).status,201);
});
test("no future dates may be used to disguise a teacher's handover",async()=>{
 const {h,calls}=setup();
 const r=await invoke(h,{method:"POST",body:{...body,movementDate:"2199-01-01"}});
 assert.equal(r.status,400);assert.equal(calls.record,0);
});
test("inactive or non-Nursery learner cannot receive movement",async()=>{
 for(const scope of [null,{classId:CLASS,status:"Archived",classSection:"Nursery"}]){
  const {h}=setup({scope});
  const r=await invoke(h,{method:"POST",body});
  assert.equal(r.status,scope?409:404);
 }
});
test("POST errors mask database detail and map conflicts",async()=>{
 const {h}=setup();
 const bad=createNurseryMaterialMovementsHttpHandler({
  authService:{async authenticate(){return principal();}},expectedOrigin:ORIGIN,
  learnerRepository:{async getLearnerScope(){return{classId:CLASS,status:"Active",classSection:"Nursery"};}},
  repository:{
   async recordMovement(){throw Object.assign(new Error("password=private"),{code:"MATERIAL_STOCK_CONFLICT"});},
   async listMovements(){return[];},async summary(){return[];},
   async listTeachers(){return[];},async recordsCentre(){return{rows:[],limited:false};}
  }
 });
 const r=await invoke(bad,{method:"POST",body});
 assert.equal(r.status,409);assert.doesNotMatch(r.body,/private/);
});
test("HEAD never reads record centre rows or private learner movements",async()=>{
 const {h,calls}=setup();
 assert.equal((await invoke(h,{path:RECS,method:"HEAD"})).body,"");
 assert.equal((await invoke(h,{method:"HEAD"})).body,"");
 assert.equal(calls.reads,0);assert.equal(calls.records,0);
});
test("invalid CSRF and missing auth session are denied",async()=>{
 for(const [err,status] of [[new AuthenticationError(),401],[new CsrfValidationError(),403]]){
  const {h}=setup({authError:err});
  assert.equal((await invoke(h,{method:"POST",body})).status,status);
 }
});
