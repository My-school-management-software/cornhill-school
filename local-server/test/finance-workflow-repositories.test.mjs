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
 const {repo,calls}=fixture();
 assert.deepEqual(await repo.listLocalExpenseCategories({actorStaffId:ACTOR}),[{id:RECORD,code:undefined,name:undefined}]);
 assert.deepEqual(await repo.listLocalBankAccounts({actorStaffId:ACTOR}),[{id:RECORD,accountName:undefined,bankName:undefined,last4:undefined,openingBalanceUgx:NaN}]);
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/finance_list_expense_categories/);
 assert.match(calls[1].sql,/finance_list_bank_accounts/);
});
