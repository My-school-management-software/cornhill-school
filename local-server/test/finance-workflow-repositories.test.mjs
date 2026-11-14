import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresFinanceRepositories } from "../src/db/finance-repositories.mjs";

const ACTOR="11111111-1111-4111-8111-111111111111";
const STAFF="22222222-2222-4222-8222-222222222222";
const CATEGORY="33333333-3333-4333-8333-333333333333";
const RECORD="44444444-4444-4444-8444-444444444444";
const EVIDENCE="55555555-5555-4555-8555-555555555555";

function fixture(){
 const calls=[];
 const pool={async query(sql,values){calls.push({sql,values});return {rows:[{id:RECORD,status:"Approved",ledger_id:RECORD,evidence_request_id:EVIDENCE}]};}};
 return {repo:createPostgresFinanceRepositories(pool),calls};
}

test("expense and banking repository methods call only guarded SQL workflow functions",async()=>{
 const {repo,calls}=fixture();
 assert.equal(await repo.setLocalExpenseOperatorLimit({actorStaffId:ACTOR,staffId:STAFF,dailyLimitUgx:100000}),RECORD);
 assert.equal(await repo.createLocalBankAccount({actorStaffId:ACTOR,accountName:"School account",bankName:"Example Bank",last4:"1234",openingBalanceUgx:500000}),RECORD);
 assert.equal(await repo.createLocalExpenseRequest({actorStaffId:ACTOR,requestNumber:"EXP-2026-001",categoryId:CATEGORY,description:"Kitchen supplies",amountUgx:25000}),RECORD);
 assert.equal(await repo.reviewLocalExpenseRequest({actorStaffId:ACTOR,requestId:RECORD,decision:"Approved"}),"Approved");
 assert.equal(await repo.postLocalExpense({actorStaffId:ACTOR,requestId:RECORD}),RECORD);
 assert.equal(await repo.createLocalBankTransaction({actorStaffId:ACTOR,accountId:RECORD,transactionType:"Deposit",amountUgx:100000,description:"Term fees deposit"}),RECORD);
 assert.equal(await repo.reviewLocalBankTransaction({actorStaffId:ACTOR,transactionId:RECORD,decision:"Approved"}),"Approved");
 assert.equal(await repo.verifyLocalBankTransaction({actorStaffId:ACTOR,transactionId:RECORD}),RECORD);
 assert.equal(await repo.attachLocalFinanceEvidence({actorStaffId:ACTOR,contextType:"expense_request",recordId:RECORD,evidenceRequestId:EVIDENCE}),EVIDENCE);
 assert.equal(calls.length,9);
 for(const call of calls) assert.match(call.sql,/SELECT cornhill_school[.]([a-z_]+)\(/);
 assert.deepEqual(calls.map(c=>c.values[0]),Array(9).fill(ACTOR));
});

test("expense and banking repository rejects malformed UUIDs and invalid limits before SQL",async()=>{
 const {repo,calls}=fixture();
 await assert.rejects(()=>repo.createLocalExpenseRequest({actorStaffId:"bad",requestNumber:"EXP-1",categoryId:CATEGORY,description:"Stationery",amountUgx:1000}),/valid UUID/);
 await assert.rejects(()=>repo.setLocalExpenseOperatorLimit({actorStaffId:ACTOR,staffId:STAFF,dailyLimitUgx:0}),/positive whole-UGX/);
 await assert.rejects(()=>repo.attachLocalFinanceEvidence({actorStaffId:ACTOR,contextType:"expense_request",recordId:RECORD,evidenceRequestId:"bad"}),/valid UUID/);
 assert.equal(calls.length,0);
});

test("finance workspace repositories load categories and active bank accounts through guarded routines",async()=>{
 const calls=[];
 const pool={async query(sql,values){
  calls.push({sql,values});
  if(sql.includes("finance_list_expense_categories"))return {rows:[{id:CATEGORY,category_code:"FOOD",category_name:"Food and kitchen"}]};
  return {rows:[{id:RECORD,account_name:"School account",bank_name:"Example Bank",account_number_last4:"1234",opening_balance_ugx:"1000"}]};
 }};
 const repo=createPostgresFinanceRepositories(pool);
 assert.deepEqual(await repo.listLocalExpenseCategories({actorStaffId:ACTOR}),[{id:CATEGORY,code:"FOOD",name:"Food and kitchen"}]);
 assert.deepEqual(await repo.listLocalBankAccounts({actorStaffId:ACTOR}),[{id:RECORD,accountName:"School account",bankName:"Example Bank",last4:"1234",openingBalanceUgx:1000}]);
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/finance_list_expense_categories/);
 assert.match(calls[1].sql,/finance_list_bank_accounts/);
 assert.deepEqual(calls.map(call=>call.values[0]),[ACTOR,ACTOR]);
});

test("finance review queue repositories map database rows without exposing account numbers",async()=>{
 const calls=[];
 const pool={async query(sql,values){
  calls.push({sql,values});
  if(sql.includes("finance_list_expense_review_queue"))return {rows:[{id:RECORD,request_number:"EXP-2026-ABCD1234",category_name:"Food and kitchen",description:"Food supplies",amount_ugx:"25000",expense_date:"2026-11-14",status:"Pending",requested_by_staff_id:STAFF,evidence_request_id:null,review_note:null}]};
  return {rows:[{id:RECORD,bank_account_id:CATEGORY,account_name:"School account",bank_name:"Example Bank",account_number_last4:"1234",transaction_type:"Deposit",amount_ugx:"50000",description:"School deposit",external_reference:null,transaction_date:"2026-11-14",status:"Approved",requested_by_staff_id:STAFF,evidence_request_id:EVIDENCE,review_note:null}]};
 }};
 const repo=createPostgresFinanceRepositories(pool);
 const expenses=await repo.listLocalExpenseReviewQueue({actorStaffId:ACTOR});
 const bank=await repo.listLocalBankReviewQueue({actorStaffId:ACTOR});
 assert.equal(expenses[0].amountUgx,25000);assert.equal(expenses[0].categoryName,"Food and kitchen");
 assert.equal(bank[0].amountUgx,50000);assert.equal(bank[0].last4,"1234");
 assert.equal(Object.hasOwn(bank[0],"accountNumber"),false);
 assert.equal(calls.length,2);assert.deepEqual(calls.map(call=>call.values[0]),[ACTOR,ACTOR]);
});


test("expense limit staff repository maps active staff and configured limit without exposing extra account data",async()=>{
 const calls=[];const pool={async query(sql,values){calls.push({sql,values});return {rows:[{staff_account_id:STAFF,staff_number:"ST-001",legal_name:"Staff Member",job_title:"Bursar",daily_limit_ugx:"150000",limit_is_active:true}]};}};
 const repo=createPostgresFinanceRepositories(pool);
 assert.deepEqual(await repo.listLocalExpenseLimitStaff({actorStaffId:ACTOR}),[{staffId:STAFF,staffNumber:"ST-001",legalName:"Staff Member",jobTitle:"Bursar",dailyLimitUgx:150000,limitIsActive:true}]);
 assert.match(calls[0].sql,/finance_list_expense_limit_staff/);assert.deepEqual(calls[0].values,[ACTOR]);
});

test("finance repository returns only exact-record evidence request choices",async()=>{
 const calls=[];const pool={async query(sql,values){calls.push({sql,values});return {rows:[{request_id:EVIDENCE,purpose:"Expense receipt",context_label:"Kitchen supplies",amount_ugx:"25000",status:"Approved",created_at:"2026-11-14T10:00:00Z",assigned_staff_id:STAFF,requested_by_staff_id:ACTOR}]};}};
 const repo=createPostgresFinanceRepositories(pool);
 assert.deepEqual(await repo.listRecordEvidenceRequests({actorStaffId:ACTOR,contextType:"expense_request",recordId:RECORD}),[
  {requestId:EVIDENCE,purpose:"Expense receipt",contextLabel:"Kitchen supplies",amountUgx:25000,status:"Approved",createdAt:"2026-11-14T10:00:00Z",assignedStaffId:STAFF,requestedByStaffId:ACTOR}
 ]);
 assert.match(calls[0].sql,/finance_list_record_evidence_requests/);
 assert.deepEqual(calls[0].values,[ACTOR,"expense_request",RECORD]);
 await assert.rejects(()=>repo.listRecordEvidenceRequests({actorStaffId:ACTOR,contextType:"other",recordId:RECORD}),/context is invalid/);
 assert.equal(calls.length,1);
});
