import test from "node:test";
import assert from "node:assert/strict";
import { createStaffOperationsHttpHandler } from "../src/security/staff-operations-http-handler.mjs";

const STAFF_ID="11111111-1111-4111-8111-111111111111";
const ORIGIN="https://localhost:4174";
function principal(permissions=[]){
  return {
    principalType:"staff",id:STAFF_ID,accountStatus:"active",roles:["director"],
    rolePermissions:{director:permissions},
    session:{revokedAt:null,expiresAt:Date.now()+60_000}
  };
}
function makeRequest({method="GET",path="/api/v1/staff/operations/workspace",body,encrypted=true,origin=ORIGIN,host="localhost:4174"}={}){
  return {
    method,url:path,headers:{
      host,origin,"content-type":"application/json","x-cornhill-csrf":"test-csrf",cookie:""
    },
    socket:{encrypted},
    async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));}
  };
}
function makeResponse(){
  return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body?.toString()??"";}};
}
function setup(permissions,overrides={}){
  const calls={auth:[],workspace:[],leave:[]};
  const authService={async authenticate(input){calls.auth.push(input);return principal(permissions);}};
  const repository={
    async getWorkspace(input){calls.workspace.push(input);return {capabilities:{attendance:input.includeAttendance,ownLeave:input.includeOwnLeave,leaveReview:input.includeLeaveReview,allLeaveBalances:input.includeAllLeaveBalances,payroll:input.includePayroll}};},
    async submitLeaveRequest(input){calls.leave.push(input);return {id:"22222222-2222-4222-8222-222222222222",...input,status:"Submitted"};}
  };
  return {handler:createStaffOperationsHttpHandler({authService,repository,expectedOrigin:ORIGIN,...overrides}),calls};
}

test("workspace exposes only sections supported by explicitly granted permissions",async()=>{
  const permissions=["staff.attendance_manage","staff.leave_manage","staff.leave_review","staff.payroll_read"];
  const {handler,calls}=setup(permissions),res=makeResponse();
  const handled=await handler(makeRequest(),res);
  assert.equal(handled,true);assert.equal(res.status,200);
  assert.deepEqual(calls.workspace[0],{
    staffId:STAFF_ID,includeAttendance:true,includeOwnLeave:true,
    includeLeaveReview:true,includeAllLeaveBalances:false,includePayroll:true
  });
});

test("staff without any Staff Operations permission is denied",async()=>{
  const {handler,calls}=setup([]),res=makeResponse();
  await handler(makeRequest(),res);
  assert.equal(res.status,403);assert.equal(calls.workspace.length,0);
});

test("leave submission uses the signed-in staff identity, not a client-supplied staff ID",async()=>{
  const {handler,calls}=setup(["staff.leave_manage"]),res=makeResponse();
  await handler(makeRequest({method:"POST",path:"/api/v1/staff/leave/requests",body:{
    staffId:"99999999-9999-4999-8999-999999999999",leaveType:"Annual",
    startsOn:"2026-12-01",endsOn:"2026-12-03",requestedDays:3,reason:"Family responsibilities"
  }}),res);
  assert.equal(res.status,201);
  assert.equal(calls.leave[0].staffId,STAFF_ID);
  assert.equal(calls.leave[0].leaveType,"Annual");
});

test("leave submissions require an explicit leave permission",async()=>{
  const {handler,calls}=setup(["staff.attendance_manage"]),res=makeResponse();
  await handler(makeRequest({method:"POST",path:"/api/v1/staff/leave/requests",body:{
    leaveType:"Annual",startsOn:"2026-12-01",endsOn:"2026-12-03",requestedDays:3,reason:"Family responsibilities"
  }}),res);
  assert.equal(res.status,403);assert.equal(calls.leave.length,0);
});

test("invalid leave values are rejected before the repository is called",async()=>{
  const {handler,calls}=setup(["staff.leave_manage"]),res=makeResponse();
  await handler(makeRequest({method:"POST",path:"/api/v1/staff/leave/requests",body:{
    leaveType:"Holiday",startsOn:"2026-02-30",endsOn:"2026-01-01",requestedDays:1.123,reason:"short"
  }}),res);
  assert.equal(res.status,400);assert.equal(calls.leave.length,0);
});

test("mutations require HTTPS and the exact local origin",async()=>{
  const {handler}=setup(["staff.leave_manage"]);
  const insecure=makeResponse();
  await handler(makeRequest({method:"POST",path:"/api/v1/staff/leave/requests",encrypted:false,body:{}}),insecure);
  assert.equal(insecure.status,426);
  const wrongOrigin=makeResponse();
  await handler(makeRequest({method:"POST",path:"/api/v1/staff/leave/requests",origin:"https://attacker.invalid",body:{}}),wrongOrigin);
  assert.equal(wrongOrigin.status,421);
});

test("unsupported methods are rejected and unknown paths are left for other handlers",async()=>{
  const {handler}=setup(["staff.leave_manage"]);
  const unsupported=makeResponse();
  await handler(makeRequest({method:"DELETE"}),unsupported);
  assert.equal(unsupported.status,405);
  const unknown=await handler(makeRequest({path:"/api/v1/staff/operations/unknown"}),makeResponse());
  assert.equal(unknown,false);
});
