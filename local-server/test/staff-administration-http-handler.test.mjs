import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";
import { CsrfValidationError } from "../src/security/auth-service.mjs";
import { createStaffAdministrationHttpHandler } from "../src/security/staff-administration-http-handler.mjs";
const ORIGIN="https://cornhill.local",ACTOR="11111111-1111-4111-8111-111111111111";
const secrets=createOpaqueSessionSecrets();
const director={id:ACTOR,principalType:"staff",accountStatus:"active",roles:["director"],
 rolePermissions:{director:["system.roles_manage"]},session:{revokedAt:null,expiresAt:new Date(Date.now()+60000)}};
const teacher={...director,roles:["teacher"],rolePermissions:{teacher:["academics.marks_enter"]}};
function response(){return {statusCode:0,headers:{},body:"",writeHead(status,headers={}){this.statusCode=status;this.headers=headers;},end(body=""){this.body=Buffer.isBuffer(body)?body.toString():String(body);},json(){return this.body?JSON.parse(this.body):null;}};}
function setup({principal=director,repositoryOverrides={},hash="$argon2id$test"}={}){
 const calls={workspace:0,permissions:0,staff:0,hash:0};
 const repository={
  async getAdministrationWorkspace(){calls.workspace++;return {roles:[],permissions:[],grants:[],staff:[]};},
  async setRolePermissions(input){calls.permissions++;calls.permissionInput=input;return {roleCode:input.roleCode,permissionCount:input.permissionCodes.length};},
  async createStaffAccount(input){calls.staff++;calls.staffInput=input;return {username:input.username,roleCode:input.roleCode};},
  ...repositoryOverrides
 };
 const passwordHasher={async hash(value){calls.hash++;calls.rawPassword=value;return hash;},isArgon2idHash(value){return value.startsWith("$argon2id$");}};
 const handler=createStaffAdministrationHttpHandler({
  authService:{async authenticate({method,csrfToken}={}){if(method!=="GET"&&csrfToken!==secrets.csrfToken)throw new CsrfValidationError();return principal;}},
  repository,passwordHasher,expectedOrigin:ORIGIN,onError(error){calls.error=error;}
 });
 return {handler,calls};
}
async function invoke(handler,{path="/api/v1/security/role-management",method="GET",body,headers={},encrypted=true}={}){
 const request=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body),"utf8")]);
 request.url=path;request.method=method;
 request.headers={host:"cornhill.local",cookie:SESSION_COOKIE_NAME+"="+secrets.sessionToken,...headers};
 if(method!=="GET"){request.headers.origin??=ORIGIN;request.headers["content-type"]??="application/json";request.headers["x-cornhill-csrf"]??=secrets.csrfToken;}
 request.socket={encrypted};
 const res=response();await handler(request,res);return res;
}
const newStaff={username:"teacher.one",email:"teacher@cornhill.ug",password:"A-Very-Long-Private-Password-2026",
 staffNumber:"TCH-001",legalName:"Teacher One",preferredName:"Teacher",jobTitle:"Class Teacher",
 department:"Primary",phoneE164:"+256700000001",roleCode:"class_teacher",hiredOn:"2026-01-12"};
test("Director can load the role and staff management workspace",async()=>{
 const {handler,calls}=setup();const res=await invoke(handler);
 assert.equal(res.statusCode,200);assert.equal(calls.workspace,1);
});
test("non-Director staff and guardians cannot administer accounts or role grants",async()=>{
 for(const principal of [teacher,{...director,principalType:"guardian",roles:[],rolePermissions:{}}]){
  const {handler,calls}=setup({principal});
  const res=await invoke(handler,{path:"/api/v1/security/staff-accounts",method:"POST",body:newStaff});
  assert.equal(res.statusCode,403);assert.equal(calls.staff,0);
 }
});
test("Director role permissions are updated with actor attribution and CSRF",async()=>{
 const {handler,calls}=setup();
 const denied=await invoke(handler,{path:"/api/v1/security/roles/class_teacher/permissions",method:"POST",
  headers:{"x-cornhill-csrf":"wrong"},body:{permissionCodes:["academics.marks_enter"]}});
 assert.equal(denied.statusCode,403);assert.equal(calls.permissions,0);
 const ok=await invoke(handler,{path:"/api/v1/security/roles/class_teacher/permissions",method:"POST",
  body:{permissionCodes:["academics.marks_enter","learners.read"]}});
 assert.equal(ok.statusCode,200);assert.equal(calls.permissionInput.actorStaffId,ACTOR);
 assert.deepEqual(calls.permissionInput.permissionCodes,["academics.marks_enter","learners.read"]);
});
test("invalid, duplicate and Director-reserved permissions are rejected",async()=>{
 const {handler,calls}=setup();
 for(const permissionCodes of [["system.roles_manage"],["academics.marks_enter","academics.marks_enter"],["not valid"]]){
  const res=await invoke(handler,{path:"/api/v1/security/roles/class_teacher/permissions",method:"POST",body:{permissionCodes}});
  assert.equal(res.statusCode,400);
 }
 const protectedRole=await invoke(handler,{path:"/api/v1/security/roles/director/permissions",method:"POST",body:{permissionCodes:[]}});
 assert.equal(protectedRole.statusCode,403);assert.equal(calls.permissions,0);
});
test("new staff credentials are Argon2id-hashed before repository insertion",async()=>{
 const {handler,calls}=setup();
 const res=await invoke(handler,{path:"/api/v1/security/staff-accounts",method:"POST",body:newStaff});
 assert.equal(res.statusCode,201);assert.equal(calls.staff,1);
 assert.equal(calls.staffInput.passwordHash,"$argon2id$test");
 assert.equal(Object.hasOwn(calls.staffInput,"password"),false);
 assert.equal(calls.rawPassword,newStaff.password);
 assert.equal(res.json().staff.username,"teacher.one");
});
test("invalid hire date and weak password fail as client errors",async()=>{
 const {handler,calls}=setup();
 const weak=await invoke(handler,{path:"/api/v1/security/staff-accounts",method:"POST",body:{...newStaff,password:"weak"}});
 assert.equal(weak.statusCode,400);
 const invalidDate=await invoke(handler,{path:"/api/v1/security/staff-accounts",method:"POST",body:{...newStaff,hiredOn:"2026-02-30"}});
 assert.equal(invalidDate.statusCode,400);assert.equal(calls.staff,0);
});
test("administration endpoints require HTTPS and reject unsupported methods",async()=>{
 const {handler}=setup();
 assert.equal((await invoke(handler,{path:"/api/v1/security/role-management",encrypted:false})).statusCode,426);
 assert.equal((await invoke(handler,{method:"DELETE"})).statusCode,405);
});
