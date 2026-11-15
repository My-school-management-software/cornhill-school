import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresStaffLeaveReviewRepository } from "../src/db/staff-leave-review-repositories.mjs";
const REQUEST="22222222-2222-4222-8222-222222222222";
const REVIEWER="11111111-1111-4111-8111-111111111111";

test("leave review commits one conditional transition and uses the signed-in reviewer",async()=>{
 const calls=[];const client={async query(sql,params){calls.push({sql,params});return sql.startsWith("UPDATE")?{rowCount:1,rows:[{id:REQUEST,status:"Approved"}]}:{rowCount:0,rows:[]};},release(){calls.push({release:true});}};
 const result=await createPostgresStaffLeaveReviewRepository({connect:async()=>client}).reviewRequest({requestId:REQUEST,reviewerStaffId:REVIEWER,decision:"Approved",note:"Reviewed"});
 assert.equal(result.status,"Approved");assert.equal(calls[0].sql,"BEGIN");assert.match(calls[1].sql,/status='Submitted'/);assert.deepEqual(calls[1].params,[REQUEST,"Approved",REVIEWER,"Reviewed"]);assert.equal(calls[2].sql,"COMMIT");
});

test("leave review rolls back if the request is no longer pending",async()=>{
 const calls=[];const client={async query(sql){calls.push(sql);return sql.startsWith("UPDATE")?{rowCount:0,rows:[]}:{rowCount:0,rows:[]};},release(){}};
 await assert.rejects(createPostgresStaffLeaveReviewRepository({connect:async()=>client}).reviewRequest({requestId:REQUEST,reviewerStaffId:REVIEWER,decision:"Approved"}),/no longer awaiting review/);
 assert.ok(calls.includes("ROLLBACK"));
});

test("invalid decisions, rejection notes and identifiers fail before opening a transaction",async()=>{
 let connects=0;const repository=createPostgresStaffLeaveReviewRepository({connect:async()=>{connects++;throw Error("unexpected");}});
 for(const input of [{decision:"Cancelled"},{decision:"Rejected",note:"no"},{decision:"Approved",requestId:"bad"}]){
  await assert.rejects(repository.reviewRequest({requestId:REQUEST,reviewerStaffId:REVIEWER,...input}));
 }
 assert.equal(connects,0);
});
