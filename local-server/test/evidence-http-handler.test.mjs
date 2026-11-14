import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createEvidenceHttpHandler } from "../src/security/evidence-http-handler.mjs";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import { AuthenticationError, CsrfValidationError } from "../src/security/auth-service.mjs";
const ORIGIN="https://cornhill.local:4174",STAFF="11111111-1111-4111-8111-111111111111";
const REQUEST="22222222-2222-4222-8222-222222222222",FILE="33333333-3333-4333-8333-333333333333";
const OBJECT="44444444-4444-4444-8444-444444444444",TOKEN="A".repeat(43);
const PNG=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const principal={id:STAFF,principalType:"staff",accountStatus:"active",roles:["bursar"],
 rolePermissions:{bursar:["finance.evidence_manage","finance.evidence_review"]},
 session:{revokedAt:null,expiresAt:new Date(Date.now()+60000).toISOString()}};
function responseFixture(){return {statusCode:null,headers:{},body:null,writeHead(code,headers={}){this.statusCode=code;this.headers=headers;},end(body){this.body=body??null;},json(){return this.body?JSON.parse(String(this.body)):null;}};}
async function invoke(handler,{path,method="GET",headers={},body,encrypted=true}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.isBuffer(body)?body:Buffer.from(body)]);
 req.url=path;req.method=method;req.headers=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
 req.socket={encrypted};const res=responseFixture();const handled=await handler(req,res);return {...res,handled};
}
function setup({principalValue=principal,authError,repoOverrides={},storeOverrides={}}={}){
 const calls={auth:[],create:[],register:[],submit:[],review:[],get:[],find:[],put:[],getFile:[],remove:[]};
 const authService={async authenticate(input){calls.auth.push(input);if(authError)throw authError;return principalValue;}};
 const evidenceRepository={
  async createEvidenceRequest(input){calls.create.push(input);return REQUEST;},
  async registerEvidenceFile(input){calls.register.push(input);return FILE;},
  async submitEvidenceRequest(input){calls.submit.push(input);return REQUEST;},
  async reviewEvidenceRequest(input){calls.review.push(input);return "Approved";},
  async getEvidenceRequest(input){calls.get.push(input);return {request_id:REQUEST,status:"Submitted",files:[]};},
  async findEvidenceFile(input){calls.find.push(input);return {storageObjectKey:OBJECT,sha256:"a".repeat(64),contentType:"image/png",originalFileName:"slip.png"};},
  ...repoOverrides
 };
 const evidenceStore={
  async put(input){calls.put.push(input);return {objectKey:OBJECT,sha256:"a".repeat(64),sizeBytes:PNG.length,contentType:"image/png",originalFileName:"slip.png"};},
  async get(key,sha){calls.getFile.push({key,sha});return {bytes:PNG,sizeBytes:PNG.length};},
  async remove(key){calls.remove.push(key);return true;},...storeOverrides
 };
 return {handler:createEvidenceHttpHandler({authService,evidenceRepository,evidenceStore,expectedOrigin:ORIGIN}),calls};
}
const getHeaders={Host:"cornhill.local:4174",Cookie:SESSION_COOKIE_NAME+"="+TOKEN};
const postHeaders={...getHeaders,Origin:ORIGIN,"X-Cornhill-CSRF":"B".repeat(43),"Content-Type":"application/json"};
test("evidence handler validates required dependencies and HTTPS origin",()=>{
 assert.throws(()=>createEvidenceHttpHandler({expectedOrigin:ORIGIN}),/authentication service/);
 assert.throws(()=>createEvidenceHttpHandler({authService:{authenticate(){}},expectedOrigin:"http://cornhill.local"}),/HTTPS origin/);
});
test("unrelated paths are not claimed by evidence handler",async()=>{
 const {handler}=setup();assert.equal((await invoke(handler,{path:"/api/v1/health"})).handled,false);
});
test("evidence request creation requires finance evidence permission and records authenticated actor",async()=>{
 const {handler,calls}=setup();
 const result=await invoke(handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,
  body:JSON.stringify({assignedStaffId:STAFF,purpose:"Bank deposit slip",contextType:"other",contextLabel:"Bank deposit 14 November",amountUgx:500000})});
 assert.equal(result.statusCode,201);assert.equal(result.json().requestId,REQUEST);
 assert.equal(calls.create[0].actorStaffId,STAFF);assert.equal(calls.create[0].assignedStaffId,STAFF);
});
test("evidence creation rejects invalid assignment, purpose, context and amount before database access",async()=>{
 const {handler,calls}=setup();
 for(const body of [
  {assignedStaffId:"bad",purpose:"Bank deposit slip",contextLabel:"Deposit"},
  {assignedStaffId:STAFF,purpose:"Gun",contextLabel:"Deposit"},
  {assignedStaffId:STAFF,purpose:"Other",contextType:"bank_transaction",contextRecordId:"bad",contextLabel:"Deposit"},
  {assignedStaffId:STAFF,purpose:"Other",contextLabel:"Deposit",amountUgx:-1}
 ]){
  const r=await invoke(handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,body:JSON.stringify(body)});
  assert.equal(r.statusCode,400);
 }
 assert.equal(calls.create.length,0);
});
test("evidence creation rejects missing authentication, CSRF and permission",async()=>{
 const unauth=setup({authError:new AuthenticationError()});
 assert.equal((await invoke(unauth.handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,body:"{}"})).statusCode,401);
 const csrf=setup({authError:new CsrfValidationError()});
 assert.equal((await invoke(csrf.handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,body:"{}"})).statusCode,403);
 const denied=setup({principalValue:{...principal,rolePermissions:{bursar:[]}}});
 assert.equal((await invoke(denied.handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,body:"{}"})).statusCode,403);
 assert.equal(denied.calls.create.length,0);
});
test("evidence upload stores bytes privately then registers immutable metadata",async()=>{
 const {handler,calls}=setup();
 const result=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/files",method:"POST",
  headers:{...postHeaders,"Content-Type":"image/png","X-Evidence-Filename":"deposit.png"},body:PNG});
 assert.equal(result.statusCode,201);assert.equal(result.json().fileId,FILE);
 assert.equal(calls.put.length,1);assert.deepEqual(calls.put[0].bytes,PNG);
 assert.equal(calls.register[0].actorStaffId,STAFF);assert.equal(calls.register[0].requestId,REQUEST);
 assert.equal(calls.register[0].objectKey,OBJECT);
});
test("evidence upload rejects unsupported content and oversized body before writing",async()=>{
 const {handler,calls}=setup();
 const bad=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/files",method:"POST",
  headers:{...postHeaders,"Content-Type":"text/plain","X-Evidence-Filename":"x"},body:"no"});
 assert.equal(bad.statusCode,415);
 const big=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/files",method:"POST",
  headers:{...postHeaders,"Content-Type":"image/png","X-Evidence-Filename":"x.png"},body:Buffer.alloc(15*1024*1024+1)});
 assert.equal(big.statusCode,413);assert.equal(calls.put.length,0);
});
test("database metadata failure removes the unregistered private blob",async()=>{
 const {handler,calls}=setup({repoOverrides:{async registerEvidenceFile(){throw new Error("database unavailable");}}});
 const result=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/files",method:"POST",
  headers:{...postHeaders,"Content-Type":"image/png","X-Evidence-Filename":"slip.png"},body:PNG});
 assert.equal(result.statusCode,503);assert.deepEqual(calls.remove,[OBJECT]);
});
test("evidence submission and independent review use separate permissions and actor IDs",async()=>{
 const {handler,calls}=setup();
 const submitted=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/submit",method:"POST",headers:postHeaders,body:"{}"});
 assert.equal(submitted.statusCode,200);assert.equal(calls.submit[0].actorStaffId,STAFF);
 const reviewed=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/review",method:"POST",headers:postHeaders,
  body:JSON.stringify({action:"Approved",note:"Verified against bank statement"})});
 assert.equal(reviewed.statusCode,200);assert.equal(calls.review[0].actorStaffId,STAFF);
});
test("evidence review rejects invalid decision and note",async()=>{
 const {handler,calls}=setup();
 for(const body of [{action:"Maybe"},{action:"Rejected",note:"x".repeat(501)}]){
  const result=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST+"/review",method:"POST",headers:postHeaders,body:JSON.stringify(body)});
  assert.equal(result.statusCode,400);
 }
 assert.equal(calls.review.length,0);
});
test("evidence request details and private downloads are authenticated and no-store",async()=>{
 const {handler,calls}=setup();
 const record=await invoke(handler,{path:"/api/v1/finance/evidence/requests/"+REQUEST,headers:getHeaders});
 assert.equal(record.statusCode,200);assert.equal(record.json().request.request_id,REQUEST);
 assert.doesNotMatch(String(record.body),/storage_object_key|storageObjectKey/);
 const download=await invoke(handler,{path:"/api/v1/finance/evidence/files/"+FILE+"/download",headers:getHeaders});
 assert.equal(download.statusCode,200);assert.deepEqual(download.body,PNG);
 assert.equal(download.headers["Cache-Control"],"no-store");assert.equal(download.headers["X-Content-Type-Options"],"nosniff");
 assert.equal(calls.find[0].actorStaffId,STAFF);assert.equal(calls.getFile[0].key,OBJECT);
});
test("evidence download does not disclose storage keys when file is absent or unauthorized",async()=>{
 const {handler,calls}=setup({repoOverrides:{async findEvidenceFile(){return null;}}});
 const result=await invoke(handler,{path:"/api/v1/finance/evidence/files/"+FILE+"/download",headers:getHeaders});
 assert.equal(result.statusCode,404);assert.doesNotMatch(String(result.body),/storageObjectKey|objectKey/);
 assert.equal(calls.getFile.length,0);
});
test("evidence handler enforces same-origin, HTTPS, method and bounded JSON body",async()=>{
 const {handler}=setup();
 assert.equal((await invoke(handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:{...postHeaders,Origin:"https://evil.example"},body:"{}"})).statusCode,403);
 assert.equal((await invoke(handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,body:"{}",encrypted:false})).statusCode,426);
 assert.equal((await invoke(handler,{path:"/api/v1/finance/evidence/requests",method:"DELETE",headers:getHeaders})).statusCode,405);
 assert.equal((await invoke(handler,{path:"/api/v1/finance/evidence/requests",method:"POST",headers:postHeaders,body:"{bad"})).statusCode,400);
});
