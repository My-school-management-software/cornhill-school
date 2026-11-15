import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";
import { CsrfValidationError } from "../src/security/auth-service.mjs";
import { createStaffLeadershipHttpHandler } from "../src/security/staff-leadership-http-handler.mjs";
const ORIGIN="https://cornhill.local";
const STAFF="11111111-1111-4111-8111-111111111111";
const INCIDENT="22222222-2222-4222-8222-222222222222";
const secrets=createOpaqueSessionSecrets();
const base={id:STAFF,principalType:"staff",accountStatus:"active",roles:["headteacher"],classIds:[],session:{revokedAt:null,expiresAt:new Date(Date.now()+60000)},rolePermissions:{headteacher:["staff.attendance_statement_submit"]}};
function response(){return {statusCode:0,headers:{},body:"",writeHead(code,h={}){this.statusCode=code;this.headers=h;},end(body=""){this.body=Buffer.isBuffer(body)?body.toString():String(body);},json(){return this.body?JSON.parse(this.body):null;}};}
function setup({principal=base,overrides={}}={}){
 const calls={workspace:0,statement:0,decision:0};
 const repository={
  async getWorkspace(options){calls.workspace++;calls.options=options;return {summary:{},staff:[],attendance:[],incidents:[],prepSessions:[]};},
  async submitIncidentStatement(input){calls.statement++;calls.statementInput=input;return {id:INCIDENT,statement:input.statement};},
  async decideIncident(input){calls.decision++;calls.decisionInput=input;return {id:INCIDENT,status:input.decision==="excused"?"Excused":"Deduction Approved"};},
  ...overrides
 };
 const handler=createStaffLeadershipHttpHandler({authService:{async authenticate({method,csrfToken}={}){if(method!=="GET"&&csrfToken!==secrets.csrfToken)throw new CsrfValidationError();return principal;}},repository,expectedOrigin:ORIGIN,onError(error){calls.lastError=error;}});
 return {handler,calls};
}
async function invoke(handler,{path="/api/v1/staff/leadership/workspace",method="GET",body,encrypted=true,headers={}}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body),"utf8")]);req.url=path;req.method=method;
 req.headers={host:"cornhill.local",cookie:SESSION_COOKIE_NAME+"="+secrets.sessionToken,...headers};
 if(method!=="GET"){req.headers.origin??=ORIGIN;req.headers["content-type"]??="application/json";req.headers["x-cornhill-csrf"]??=secrets.csrfToken;}
 req.socket={encrypted};
 const res=response();await handler(req,res);return res;
}
test("workspace requires at least one recognised staff permission and only loads permitted sections",async()=>{
 const {handler,calls}=setup();const r=await invoke(handler);
 assert.equal(r.statusCode,200);assert.equal(calls.options.includeIncidents,true);assert.equal(calls.options.includeStaff,false);assert.equal(calls.options.includeAttendance,false);
});
test("guardian and unprivileged staff cannot access leadership workspace",async()=>{
 const guardian=setup({principal:{...base,principalType:"guardian",roles:[],rolePermissions:{}}});
 assert.equal((await invoke(guardian.handler)).statusCode,403);
 const empty=setup({principal:{...base,rolePermissions:{headteacher:[]}}});
 assert.equal((await invoke(empty.handler)).statusCode,403);
});
test("Headteacher or DOS statement writes require statement permission, CSRF and valid text",async()=>{
 const {handler,calls}=setup();
 const denied=await invoke(handler,{path:"/api/v1/staff/attendance/incidents/"+INCIDENT+"/statement",method:"POST",headers:{"x-cornhill-csrf":"wrong"},body:{statement:"I have reviewed this issue."}});
 assert.equal(denied.statusCode,403);assert.equal(calls.statement,0);
 const valid=await invoke(handler,{path:"/api/v1/staff/attendance/incidents/"+INCIDENT+"/statement",method:"POST",body:{statement:"I have reviewed this issue."}});
 assert.equal(valid.statusCode,201);assert.equal(calls.statementInput.staffId,STAFF);
});
test("a Director-only decision permission is separate from the Headteacher statement permission",async()=>{
 const director={...base,roles:["director"],rolePermissions:{director:["staff.attendance_incident_decide"]}};
 const {handler,calls}=setup({principal:director});
 const result=await invoke(handler,{path:"/api/v1/staff/attendance/incidents/"+INCIDENT+"/decision",method:"POST",body:{decision:"excused",deductionUgx:0}});
 assert.equal(result.statusCode,200);assert.equal(calls.decisionInput.staffId,STAFF);
});
test("invalid deduction amounts and unsupported request methods are rejected",async()=>{
 const director={...base,roles:["director"],rolePermissions:{director:["staff.attendance_incident_decide"]}};
 const {handler}=setup({principal:director});
 const invalid=await invoke(handler,{path:"/api/v1/staff/attendance/incidents/"+INCIDENT+"/decision",method:"POST",body:{decision:"deduct",deductionUgx:0}});
 assert.equal(invalid.statusCode,400);
 assert.equal((await invoke(handler,{method:"DELETE"})).statusCode,405);
});
test("Director decisions are not exposed to a principal with only statement permission",async()=>{
 const {handler,calls}=setup();
 const result=await invoke(handler,{path:"/api/v1/staff/attendance/incidents/"+INCIDENT+"/decision",method:"POST",body:{decision:"excused"}});
 assert.equal(result.statusCode,403);assert.equal(calls.decision,0);
});
