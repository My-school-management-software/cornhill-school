import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAdmissionsHttpHandler } from "../src/security/admissions-http-handler.mjs";

const ORIGIN="https://cornhill.local";
const STAFF={id:"11111111-1111-4111-8111-111111111111",principalType:"staff",accountStatus:"active",
 roles:["headteacher"],rolePermissions:{headteacher:["admissions.register_learner","learners.lin_manage","learners.guardians_manage"]},
 session:{revokedAt:null,expiresAt:new Date(Date.now()+60000)}};
const CLASS="22222222-2222-4222-8222-222222222222";
function response(){return{statusCode:0,headers:{},body:"",writeHead(s,h={}){this.statusCode=s;this.headers=h;},end(b=""){this.body=String(b);},json(){return JSON.parse(this.body);}};}
function setup({principal=STAFF,fail=false}={}){
 const calls={registered:[]};
 const handler=createAdmissionsHttpHandler({expectedOrigin:ORIGIN,
  authService:{async authenticate(){return principal;}},
  admissionsRepository:{async registerLearner(input){calls.registered.push(input);if(fail)throw new Error("private db error");return{id:"33333333-3333-4333-8333-333333333333",pupil_code:"CH-2026-000001",...input};}}});
 return{handler,calls};
}
async function invoke(handler,body,{headers={host:"cornhill.local",origin:ORIGIN,"content-type":"application/json"},encrypted=true,method="POST"}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url="/api/v1/school/admissions";req.method=method;req.headers=headers;req.socket={encrypted};
 const res=response();await handler(req,res);return res;
}
const valid={firstName:"Amina",lastName:"Nabirye",gender:"Female",classId:CLASS,admissionDate:"2026-01-12",isBursary:true,bursaryFeeUgx:50000};
test("admission API creates a learner with a database-issued permanent code",async()=>{
 const{handler,calls}=setup();const res=await invoke(handler,valid);
 assert.equal(res.statusCode,201);assert.equal(res.json().learner.pupil_code,"CH-2026-000001");
 assert.equal(calls.registered.length,1);assert.equal(calls.registered[0].bursaryFeeUgx,50000);
});
test("admission API refuses insecure transport and wrong origin before authentication",async()=>{
 const{handler,calls}=setup();assert.equal((await invoke(handler,valid,{encrypted:false})).statusCode,426);
 assert.equal((await invoke(handler,valid,{headers:{host:"cornhill.local",origin:"https://evil.local","content-type":"application/json"}})).statusCode,421);
 assert.equal(calls.registered.length,0);
});
test("admission API rejects malformed learner fields without writing",async()=>{
 const{handler,calls}=setup();assert.equal((await invoke(handler,{...valid,gender:"Unknown"})).statusCode,400);
 assert.equal((await invoke(handler,{...valid,admissionDate:"12/01/2026"})).statusCode,400);
 assert.equal((await invoke(handler,{...valid,isBursary:false,bursaryFeeUgx:40000})).statusCode,400);
 assert.equal(calls.registered.length,0);
});
test("LIN and guardian data require their separate high-risk permissions",async()=>{
 const noLin={...STAFF,rolePermissions:{headteacher:["admissions.register_learner","learners.guardians_manage"]}};
 const a=setup({principal:noLin});assert.equal((await invoke(a.handler,{...valid,lin:"LIN-123"})).statusCode,403);
 const noGuardian={...STAFF,rolePermissions:{headteacher:["admissions.register_learner","learners.lin_manage"]}};
 const b=setup({principal:noGuardian});assert.equal((await invoke(b.handler,{...valid,guardian:{name:"Parent One"}})).statusCode,403);
 assert.equal(a.calls.registered.length+b.calls.registered.length,0);
});
test("guardian messaging opt-ins are false unless explicitly selected",async()=>{
 const{handler,calls}=setup();const res=await invoke(handler,{...valid,guardian:{name:"Parent One",phone:"+256700000001"}});
 assert.equal(res.statusCode,201);assert.equal(calls.registered[0].guardian.smsOptIn,false);
 assert.equal(calls.registered[0].guardian.whatsappOptIn,false);
});
test("class teachers cannot admit learners outside their assigned class",async()=>{
 const teacher={...STAFF,roles:["class_teacher"],rolePermissions:{class_teacher:["admissions.register_learner"]},classIds:[]};
 const{handler,calls}=setup({principal:teacher});assert.equal((await invoke(handler,valid)).statusCode,403);
 assert.equal(calls.registered.length,0);
});
test("admission errors never expose database details",async()=>{
 const{handler}=setup({fail:true});const res=await invoke(handler,valid);
 assert.equal(res.statusCode,503);assert.doesNotMatch(res.body,/private db error/);
});
