import test from "node:test";
import assert from "node:assert/strict";
import { createAttendanceImportHttpHandler } from "../src/security/attendance-import-http-handler.mjs";
import { AuthenticationError, CsrfValidationError } from "../src/security/auth-service.mjs";

const STAFF_ID="11111111-1111-4111-8111-111111111111";
const DEVICE_ID="22222222-2222-4222-8222-222222222222";
const MAP_ID="33333333-3333-4333-8333-333333333333";
const BATCH_ID="44444444-4444-4444-8444-444444444444";
const ORIGIN="https://localhost:4174";
const permission="staff.attendance_import";
function principal(permissions=[permission]){
 return {principalType:"staff",id:STAFF_ID,accountStatus:"active",roles:["director"],rolePermissions:{director:permissions},session:{revokedAt:null,expiresAt:Date.now()+60_000}};
}
function request({method="GET",path="/api/v1/staff/attendance/devices",body,encrypted=true,origin=ORIGIN,host="localhost:4174",headers={}}={}){
 return {method,url:path,headers:{host,origin,"content-type":"application/json","x-cornhill-csrf":"test-csrf",cookie:"",...headers},socket:{encrypted},async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}};
}
function response(){return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body?.toString()??"";}};}
function setup({permissions=[permission],authError,overrides={}}={}){
 const calls={auth:[],repository:[]};
 const authService={async authenticate(input){calls.auth.push(input);if(authError)throw authError;return principal(permissions);}};
 const repository={
  async listDevices(){calls.repository.push(["listDevices"]);return [{id:DEVICE_ID,deviceCode:"TERM-01"}];},
  async listStaffOptions(){calls.repository.push(["listStaffOptions"]);return [{id:STAFF_ID,staffNumber:"DIR-001"}];},
  async listMappings(input){calls.repository.push(["listMappings",input]);return [];},
  async createDevice(input){calls.repository.push(["createDevice",input]);return {id:DEVICE_ID,...input,status:"Planned"};},
  async setDeviceStatus(input){calls.repository.push(["setDeviceStatus",input]);return input;},
  async createMapping(input){calls.repository.push(["createMapping",input]);return input;},
  async closeMapping(input){calls.repository.push(["closeMapping",input]);return input;},
  async listImports(){calls.repository.push(["listImports"]);return [];},
  async listRejections(input){calls.repository.push(["listRejections",input]);return [];},
  async importCsv(input){calls.repository.push(["importCsv",input]);return {batch:{id:BATCH_ID,rowsAccepted:1,rowsRejected:0},rejections:[]};}
 };
 return {handler:createAttendanceImportHttpHandler({authService,repository,...overrides,expectedOrigin:ORIGIN}),calls};
}
const deviceBody={deviceCode:"TERM-01",deviceName:"Main office terminal",connectionType:"USB"};
const csvBody={sourceName:"terminal.csv",csvText:"User ID,Punch Time\nA,2026-11-15 08:00",columns:{staffIdentifier:"User ID",occurredAt:"Punch Time"}};

test("lists devices and authenticates the local staff session",async()=>{
 const {handler,calls}=setup(),res=response();
 assert.equal(await handler(request(),res),true);assert.equal(res.status,200);
 assert.equal(JSON.parse(res.body).devices[0].deviceCode,"TERM-01");
 assert.equal(calls.auth.length,1);
});

test("lists active staff options and recent import batches behind the same permission",async()=>{
 const {handler}=setup();
 for(const path of ["/api/v1/staff/attendance/staff-options","/api/v1/staff/attendance/imports"]){
  const res=response();await handler(request({path}),res);assert.equal(res.status,200);
 }
});

test("denies staff without the explicit attendance import permission",async()=>{
 const {handler,calls}=setup({permissions:[]}),res=response();
 await handler(request(),res);assert.equal(res.status,403);assert.equal(calls.repository.length,0);
});

test("denies guardian principals even if their payload contains the permission code",async()=>{
 const repositoryCalls=[];
 const repository={listDevices:async()=>{repositoryCalls.push("listDevices");return [];},listStaffOptions:async()=>[],listMappings:async()=>[],createDevice:async()=>{},setDeviceStatus:async()=>{},createMapping:async()=>{},closeMapping:async()=>{},listImports:async()=>[],listRejections:async()=>[],importCsv:async()=>{}};
 const guardianAuth={async authenticate(){return {principalType:"guardian",id:STAFF_ID,roles:["director"],rolePermissions:{director:[permission]},session:{revokedAt:null,expiresAt:Date.now()+60_000}};}};
 const guarded=createAttendanceImportHttpHandler({authService:guardianAuth,repository,expectedOrigin:ORIGIN});
 const res=response();await guarded(request(),res);assert.equal(res.status,403);assert.equal(repositoryCalls.length,0);
});

test("requires encrypted HTTPS and the exact local origin for GET and writes",async()=>{
 const {handler}=setup();
 const insecure=response();await handler(request({encrypted:false}),insecure);assert.equal(insecure.status,426);
 const wrongHost=response();await handler(request({host:"evil.invalid"}),wrongHost);assert.equal(wrongHost.status,421);
 const wrongOrigin=response();await handler(request({method:"POST",origin:"https://evil.invalid",body:deviceBody}),wrongOrigin);assert.equal(wrongOrigin.status,421);
});

test("rejects unsupported methods and leaves unrelated paths untouched",async()=>{
 const {handler}=setup();
 const unsupported=response();await handler(request({method:"DELETE"}),unsupported);assert.equal(unsupported.status,405);
 assert.equal(await handler(request({path:"/api/v1/staff/attendance/unknown"}),response()),false);
});

test("validates device code and connection type before writing",async()=>{
 const {handler,calls}=setup();
 for(const body of [{...deviceBody,deviceCode:"bad code"},{...deviceBody,connectionType:"Bluetooth"}]){
  const res=response();await handler(request({method:"POST",body}),res);assert.equal(res.status,400);
 }
 assert.equal(calls.repository.length,0);
});

test("creates a planned attendance device with bounded optional fields",async()=>{
 const {handler,calls}=setup(),res=response();
 await handler(request({method:"POST",body:deviceBody}),res);
 assert.equal(res.status,201);assert.equal(calls.repository[0][0],"createDevice");
 assert.equal(calls.repository[0][1].deviceCode,"TERM-01");
});

test("rejects oversized and empty CSV content before reaching repository",async()=>{
 const {handler,calls}=setup();
 for(const csvText of ["","x".repeat(2*1024*1024+1)]){
  const res=response();await handler(request({method:"POST",path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/imports",body:{...csvBody,csvText}}),res);assert.equal(res.status,400);
 }
 assert.equal(calls.repository.length,0);
});

test("imports CSV only for a valid device path and binds uploader to session identity",async()=>{
 const {handler,calls}=setup(),res=response();
 await handler(request({method:"POST",path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/imports",body:csvBody}),res);
 assert.equal(res.status,201);const input=calls.repository[0][1];
 assert.equal(input.deviceId,DEVICE_ID);assert.equal(input.importedByStaffId,STAFF_ID);
 assert.equal(input.csvText,csvBody.csvText);
});

test("rejects invalid UUIDs, unsafe filenames and malformed column selections",async()=>{
 const {handler,calls}=setup();
 const cases=[
  {path:"/api/v1/staff/attendance/devices/000000000000000000000000000000000000/imports",body:csvBody},
  {path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/imports",body:{...csvBody,sourceName:"../secret.csv"}},
  {path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/imports",body:{...csvBody,columns:{staffIdentifier:"",occurredAt:"Punch Time"}}}
 ];
 for(const item of cases){const res=response();await handler(request({method:"POST",...item}),res);assert.equal(res.status,400);}
 assert.equal(calls.repository.length,0);
});

test("supports GET and POST for a device mapping endpoint",async()=>{
 const {handler,calls}=setup();
 const get=response();await handler(request({path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/mappings"}),get);assert.equal(get.status,200);
 const post=response();await handler(request({method:"POST",path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/mappings",body:{staffId:STAFF_ID,deviceStaffIdentifier:"F-100",effectiveFrom:"2026-11-01"}}),post);
 assert.equal(post.status,201);assert.equal(calls.repository.at(-1)[1].createdByStaffId,STAFF_ID);
});

test("validates mapping dates and terminal identifiers",async()=>{
 const {handler,calls}=setup();
 for(const body of [{staffId:STAFF_ID,deviceStaffIdentifier:" ",effectiveFrom:"2026-11-01"},{staffId:STAFF_ID,deviceStaffIdentifier:"F-100",effectiveFrom:"2026-02-30"}]){
  const res=response();await handler(request({method:"POST",path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/mappings",body}),res);assert.equal(res.status,400);
 }
 assert.equal(calls.repository.length,0);
});

test("closes a mapping using a validated date and reads rejection details",async()=>{
 const {handler,calls}=setup();
 const close=response();await handler(request({method:"POST",path:"/api/v1/staff/attendance/mappings/"+MAP_ID+"/close",body:{effectiveTo:"2026-11-14"}}),close);assert.equal(close.status,200);
 const rejects=response();await handler(request({path:"/api/v1/staff/attendance/imports/"+BATCH_ID+"/rejections"}),rejects);assert.equal(rejects.status,200);
 assert.equal(calls.repository.some(call=>call[0]==="closeMapping"),true);
 assert.equal(calls.repository.some(call=>call[0]==="listRejections"),true);
});

test("rejects invalid close dates and device statuses",async()=>{
 const {handler,calls}=setup();
 const close=response();await handler(request({method:"POST",path:"/api/v1/staff/attendance/mappings/"+MAP_ID+"/close",body:{effectiveTo:"2026-02-30"}}),close);assert.equal(close.status,400);
 const status=response();await handler(request({method:"POST",path:"/api/v1/staff/attendance/devices/"+DEVICE_ID+"/status",body:{status:"Hacked"}}),status);assert.equal(status.status,400);
 assert.equal(calls.repository.length,0);
});

test("maps expired authentication, CSRF and service failures to safe responses",async()=>{
 for(const [error,status] of [[new AuthenticationError(),401],[new CsrfValidationError(),403],[Object.assign(new Error("db down"),{code:"08006"}),503]]){
  const {handler}=setup({authError:error});const res=response();
  await handler(request(),res);assert.equal(res.status,status);
  assert.doesNotMatch(res.body,/db down/);
 }
});

test("requires the exact HTTPS origin at handler construction",()=>{
 const {handler}=setup();
 assert.equal(typeof handler,"function");
 const repository={listDevices(){},listStaffOptions(){},listMappings(){},createDevice(){},setDeviceStatus(){},createMapping(){},closeMapping(){},listImports(){},listRejections(){},importCsv(){}};
 assert.throws(()=>createAttendanceImportHttpHandler({authService:{authenticate(){}},repository,expectedOrigin:"http://localhost:4174"}),/HTTPS origin/);
});
