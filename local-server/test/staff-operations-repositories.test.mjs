import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresStaffOperationsRepository } from "../src/db/staff-operations-repositories.mjs";

const STAFF_ID="11111111-1111-4111-8111-111111111111";

test("Staff Operations workspace queries are read-only and scope personal leave to the signed-in staff ID",async()=>{
  const calls=[];
  const pool={
    async query(sql,params){calls.push({sql,params});return {rows:[],rowCount:0};},
    async connect(){throw new Error("connect should not be used for a read-only workspace");}
  };
  const repository=createPostgresStaffOperationsRepository(pool);
  const result=await repository.getWorkspace({
    staffId:STAFF_ID,includeAttendance:true,includeOwnLeave:true,
    includeLeaveReview:true,includeAllLeaveBalances:true,includePayroll:true
  });
  assert.equal(result.capabilities.attendance,true);
  assert.equal(result.capabilities.ownLeave,true);
  assert.equal(result.capabilities.leaveReview,true);
  assert.equal(result.capabilities.allLeaveBalances,true);
  assert.equal(result.capabilities.payroll,true);
  const ownRequest=calls.find(call=>call.sql.includes("FROM cornhill_school.staff_leave_requests WHERE staff_account_id"));
  const ownBalance=calls.find(call=>call.sql.includes("staff_leave_balance_summary WHERE staff_account_id"));
  assert.deepEqual(ownRequest.params,[STAFF_ID]);
  assert.deepEqual(ownBalance.params,[STAFF_ID]);
  assert.ok(calls.some(call=>call.sql.includes("FROM cornhill_school.staff_leave_review_queue")));
  assert.ok(calls.some(call=>call.sql.includes("FROM cornhill_school.payroll_disbursement_summary")));
  assert.ok(calls.every(call=>!/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/i.test(call.sql)));
});

test("personal and all-staff leave balances are returned in separate collections",async()=>{
  const pool={async query(sql){return {rows:sql.includes("JOIN cornhill_school.staff_profiles")?[{staffNumber:"TCH-001"}]:[{leaveType:"Annual"}]};},async connect(){throw new Error("not used");}};
  const result=await createPostgresStaffOperationsRepository(pool).getWorkspace({
    staffId:STAFF_ID,includeOwnLeave:true,includeAllLeaveBalances:true
  });
  assert.deepEqual(result.leave.balances,[{leaveType:"Annual"}]);
  assert.deepEqual(result.leave.allBalances,[{staffNumber:"TCH-001"}]);
});


test("payroll run summary groups the period start date used for ordering",async()=>{
  let payrollSql="";
  const pool={
    async query(sql){if(sql.includes("FROM cornhill_school.payroll_runs pr"))payrollSql=sql;return {rows:[]};},
    async connect(){throw new Error("not used");}
  };
  await createPostgresStaffOperationsRepository(pool).getWorkspace({includePayroll:true});
  assert.match(payrollSql,/GROUP BY pr\.id,pp\.period_code,pp\.starts_on ORDER BY pp\.starts_on DESC/);
});

test("leave submission creates a draft and submits it in one database transaction",async()=>{
  const calls=[];
  const client={
    async query(sql,params){calls.push({sql,params});if(sql.includes("RETURNING id::text AS id"))return {rows:[{id:"22222222-2222-4222-8222-222222222222"}],rowCount:1};if(sql.includes("UPDATE cornhill_school.staff_leave_requests"))return {rows:[{id:"22222222-2222-4222-8222-222222222222",status:"Submitted"}],rowCount:1};return {rows:[],rowCount:0};},
    release(){calls.push({released:true});}
  };
  const pool={query:async()=>({rows:[]}),connect:async()=>client};
  const result=await createPostgresStaffOperationsRepository(pool).submitLeaveRequest({
    staffId:STAFF_ID,leaveType:"Annual",startsOn:"2026-12-01",endsOn:"2026-12-03",
    requestedDays:3,reason:"Family responsibilities"
  });
  assert.equal(result.status,"Submitted");
  assert.equal(calls[0].sql,"BEGIN");
  assert.ok(calls[1].sql.includes("INSERT INTO cornhill_school.staff_leave_requests"));
  assert.ok(!calls[1].sql.includes("reason,status"),"status is assigned by the database default");
  assert.ok(calls[2].sql.includes("SET status='Submitted'"));
  assert.equal(calls[3].sql,"COMMIT");
  assert.deepEqual(calls[4],{released:true});
});

test("failed leave submit rolls back before releasing the transaction client",async()=>{
  const calls=[];
  const client={
    async query(sql){calls.push(sql);if(sql==="BEGIN")return {rows:[]};if(sql.includes("INSERT INTO"))throw Object.assign(new Error("policy rejection"),{code:"23514"});return {rows:[],rowCount:0};},
    release(){calls.push("RELEASE");}
  };
  const repository=createPostgresStaffOperationsRepository({query:async()=>({rows:[]}),connect:async()=>client});
  await assert.rejects(repository.submitLeaveRequest({
    staffId:STAFF_ID,leaveType:"Annual",startsOn:"2026-12-01",endsOn:"2026-12-03",
    requestedDays:3,reason:"Family responsibilities"
  }),/policy rejection/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.at(-1),"RELEASE");
});

test("invalid dates and unsupported leave types are rejected before opening a transaction",async()=>{
  let connections=0;
  const repository=createPostgresStaffOperationsRepository({query:async()=>({rows:[]}),connect:async()=>{connections++;throw new Error("not expected");}});
  for(const input of [
    {leaveType:"Holiday",startsOn:"2026-12-01",endsOn:"2026-12-03"},
    {leaveType:"Annual",startsOn:"2026-02-30",endsOn:"2026-03-03"},
    {leaveType:"Annual",startsOn:"2026-12-04",endsOn:"2026-12-03"}
  ]){
    await assert.rejects(repository.submitLeaveRequest({
      staffId:STAFF_ID,...input,requestedDays:2,reason:"Family responsibilities"
    }));
  }
  assert.equal(connections,0);
});
