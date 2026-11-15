import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresStaffLeadershipRepository } from "../src/db/staff-leadership-repositories.mjs";
const ID="11111111-1111-4111-8111-111111111111", STAFF="22222222-2222-4222-8222-222222222222";
function pool(results=[]){const calls=[];let i=0;return {calls,async query(sql,values=[]){calls.push({sql,values});return results[i++]||{rows:[],rowCount:0};}};}
test("workspace only queries requested sections and returns daily attendance summaries",async()=>{
 const db=pool([
  {rows:[{staffNumber:"CH01",displayName:"Teacher A",status:"Present"}],rowCount:1},
  {rows:[{total_staff:30}],rowCount:1}
 ]);
 const result=await createPostgresStaffLeadershipRepository(db).getWorkspace({includeAttendance:true});
 assert.equal(db.calls.length,2);assert.equal(result.attendance.length,1);assert.equal(result.summary.activeStaff,30);assert.equal(result.summary.presentToday,1);
 assert.match(db.calls[0].sql,/work_date = CURRENT_DATE/);
});
test("staff directory query is available only when repository option is enabled",async()=>{
 const db=pool([{rows:[{staffNumber:"CH01"}],rowCount:1}]);
 const result=await createPostgresStaffLeadershipRepository(db).getWorkspace({includeStaff:true});
 assert.equal(result.staff[0].staffNumber,"CH01");assert.match(db.calls[0].sql,/employment_status <> 'Exited'/);
});
test("incident statement is attributed to the Headteacher or DOS principal",async()=>{
 const db=pool([{rows:[{id:ID,statement:"Reviewed the attendance issue"}],rowCount:1}]);
 const result=await createPostgresStaffLeadershipRepository(db).submitIncidentStatement({incidentId:ID,staffId:STAFF,statement:"Reviewed the attendance issue"});
 assert.equal(result.id,ID);assert.equal(db.calls[0].values[2],STAFF);assert.match(db.calls[0].sql,/headteacher_statement IS NULL/);
});
test("Director decisions keep the review window and evidence requirements in the write predicate",async()=>{
 const db=pool([{rows:[{id:ID,status:"Excused"}],rowCount:1}]);
 const result=await createPostgresStaffLeadershipRepository(db).decideIncident({incidentId:ID,staffId:STAFF,decision:"excused",deductionUgx:0,reviewNote:null});
 assert.equal(result.status,"Excused");assert.match(db.calls[0].sql,/review_deadline_at <= now\(\)/);assert.match(db.calls[0].sql,/headteacher_statement IS NOT NULL/);
});
test("stale Director decisions are rejected without overwriting existing review",async()=>{
 const db=pool([{rows:[],rowCount:0}]);
 await assert.rejects(createPostgresStaffLeadershipRepository(db).decideIncident({incidentId:ID,staffId:STAFF,decision:"deduct",deductionUgx:5000,reviewNote:"Decision"}),/not yet eligible/);
});
