import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createFinanceOperationsHttpHandler } from "../src/security/finance-operations-http-handler.mjs";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";

const ORIGIN="https://cornhill.local:4174";
const ACTOR="11111111-1111-4111-8111-111111111111";
const STAFF="22222222-2222-4222-8222-222222222222";
const CATEGORY="33333333-3333-4333-8333-333333333333";
const RECORD="44444444-4444-4444-8444-444444444444";
const EVIDENCE="55555555-5555-4555-8555-555555555555";
const TOKEN="A".repeat(43);
const allPermissions=["finance.expenses_manage","finance.expenses_request","finance.expenses_review","finance.expenses_post","finance.banking_manage","finance.banking_review","finance.banking_verify"];
const principal={id:ACTOR,principalType:"staff",accountStatus:"active",roles:["bursar"],rolePermissions:{bursar:allPermissions},session:{revokedAt:null,expiresAt:new Date(Date.now()+60000).toISOString()}};
const getHeaders={Host:"cornhill.local:4174",Cookie:SESSION_COOKIE_NAME+"="+TOKEN};
const postHeaders={...getHeaders,Origin:ORIGIN,"X-Cornhill-CSRF":"B".repeat(43),"Content-Type":"application/json"};

function response(){return {statusCode:null,headers:{},body:"",writeHead(code,headers={}){this.statusCode=code;this.headers=headers;},end(body=""){this.body=String(body);},json(){return this.body?JSON.parse(this.body):null;}};}
async function invoke(handler,{path,method="POST",headers=postHeaders,body={},encrypted=true}={}){
 const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.url=path;req.method=method;
 req.headers=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));req.socket={encrypted};
 const res=response();const handled=await handler(req,res);return {...res,handled};
}
function setup({permissions=allPermissions,authError,overrides={}}={}){
 const calls=[];
 const names=["listLocalExpenseCategories","listLocalBankAccounts","listLocalExpenseReviewQueue","listLocalBankReviewQueue","setLocalExpenseOperatorLimit","createLocalBankAccount","createLocalExpenseRequest","reviewLocalExpenseRequest","postLocalExpense","createLocalBankTransaction","reviewLocalBankTransaction","verifyLocalBankTransaction","attachLocalFinanceEvidence"];
 const financeRepository=Object.fromEntries(names.map(name=>[name,async input=>{calls.push({name,input});return RECORD;}]));
 Object.assign(financeRepository,overrides);
 const authService={async authenticate(input){if(authError)throw authError;return {...principal,rolePermissions:{bursar:permissions}};}};
 return {handler:createFinanceOperationsHttpHandler({authService,financeRepository,expectedOrigin:ORIGIN}),calls};
}

test("expense and banking routes require an HTTPS origin, host and staff permission",async()=>{
 const {handler,calls}=setup({permissions:[]});
 const denied=await invoke(handler,{path:"/api/v1/finance/expenses",body:{categoryId:CATEGORY,description:"Kitchen food",amountUgx:20000}});
 assert.equal(denied.statusCode,403);assert.equal(calls.length,0);
 const wrongOrigin=await invoke(setup().handler,{path:"/api/v1/finance/expenses",headers:{...postHeaders,Origin:"https://bad.example"}});
 assert.equal(wrongOrigin.statusCode,403);
 const clear=await invoke(setup().handler,{path:"/api/v1/finance/expenses",encrypted:false});
 assert.equal(clear.statusCode,426);
});

test("expense limit and request routes pass authenticated staff and validated UGX amounts",async()=>{
 const {handler,calls}=setup();
 const limit=await invoke(handler,{path:"/api/v1/finance/expenses/limits",body:{staffId:STAFF,dailyLimitUgx:150000}});
 const request=await invoke(handler,{path:"/api/v1/finance/expenses",body:{categoryId:CATEGORY,description:"Kitchen food supplies",amountUgx:25000}});
 assert.equal(limit.statusCode,201);assert.equal(request.statusCode,201);
 assert.equal(calls[0].input.actorStaffId,ACTOR);assert.equal(calls[0].input.dailyLimitUgx,150000);
 assert.equal(calls[1].input.actorStaffId,ACTOR);assert.equal(calls[1].input.amountUgx,25000);
 assert.match(calls[1].input.requestNumber,/^EXP-[0-9]{4}-[A-F0-9]{8}$/);
});

test("expense review, posting and evidence attachment use their separate permissions",async()=>{
 const {handler,calls}=setup();
 const review=await invoke(handler,{path:"/api/v1/finance/expenses/"+RECORD+"/review",body:{decision:"Rejected",note:"Missing supplier invoice"}});
 const post=await invoke(handler,{path:"/api/v1/finance/expenses/"+RECORD+"/post",body:{}});
 const evidence=await invoke(handler,{path:"/api/v1/finance/expenses/"+RECORD+"/evidence",body:{evidenceRequestId:EVIDENCE}});
 assert.deepEqual([review.statusCode,post.statusCode,evidence.statusCode],[200,200,200]);
 assert.deepEqual(calls.map(c=>c.name),["reviewLocalExpenseRequest","postLocalExpense","attachLocalFinanceEvidence"]);
 assert.equal(calls[2].input.contextType,"expense_request");
});

test("bank account creation accepts only last four account digits",async()=>{
 const {handler,calls}=setup();
 const bad=await invoke(handler,{path:"/api/v1/finance/bank-accounts",body:{accountName:"School",bankName:"Bank",last4:"12345678",openingBalanceUgx:1000}});
 assert.equal(bad.statusCode,400);assert.equal(calls.length,0);
 const good=await invoke(handler,{path:"/api/v1/finance/bank-accounts",body:{accountName:"School account",bankName:"Example Bank",last4:"1234",openingBalanceUgx:1000}});
 assert.equal(good.statusCode,201);assert.equal(calls[0].input.last4,"1234");
});

test("bank deposits and withdrawals are created with validated account and amount",async()=>{
 const {handler,calls}=setup();
 const result=await invoke(handler,{path:"/api/v1/finance/bank-transactions",body:{accountId:RECORD,transactionType:"Withdrawal",amountUgx:30000,description:"Supplier payment"}});
 assert.equal(result.statusCode,201);assert.equal(calls[0].input.transactionType,"Withdrawal");
 const invalid=await invoke(handler,{path:"/api/v1/finance/bank-transactions",body:{accountId:"bad",transactionType:"Deposit",amountUgx:1,description:"Valid detail"}});
 assert.equal(invalid.statusCode,400);assert.equal(calls.length,1);
});

test("bank review, verification and evidence attachment remain distinct actions",async()=>{
 const {handler,calls}=setup();
 const review=await invoke(handler,{path:"/api/v1/finance/bank-transactions/"+RECORD+"/review",body:{decision:"Approved"}});
 const verify=await invoke(handler,{path:"/api/v1/finance/bank-transactions/"+RECORD+"/verify",body:{}});
 const evidence=await invoke(handler,{path:"/api/v1/finance/bank-transactions/"+RECORD+"/evidence",body:{evidenceRequestId:EVIDENCE}});
 assert.deepEqual([review.statusCode,verify.statusCode,evidence.statusCode],[200,200,200]);
 assert.deepEqual(calls.map(c=>c.name),["reviewLocalBankTransaction","verifyLocalBankTransaction","attachLocalFinanceEvidence"]);
 assert.equal(calls[2].input.contextType,"bank_transaction");
});

test("expense and bank review reject invalid decisions and require rejection reasons",async()=>{
 const {handler,calls}=setup();
 const badDecision=await invoke(handler,{path:"/api/v1/finance/expenses/"+RECORD+"/review",body:{decision:"Maybe"}});
 const noReason=await invoke(handler,{path:"/api/v1/finance/bank-transactions/"+RECORD+"/review",body:{decision:"Rejected",note:"no"}});
 assert.deepEqual([badDecision.statusCode,noReason.statusCode],[400,400]);assert.equal(calls.length,0);
});

test("operations handler leaves unrelated routes for other handlers and rejects unsupported methods",async()=>{
 const {handler}=setup();
 const other=await invoke(handler,{path:"/api/v1/health"});
 assert.equal(other.handled,false);
 const method=await invoke(handler,{path:"/api/v1/finance/expenses",method:"GET",headers:getHeaders});
 assert.equal(method.statusCode,405);
});

test("authenticated finance workspace lookups return category and bank-account picklists",async()=>{
 const {handler,calls}=setup({overrides:{
  listLocalExpenseCategories:async input=>{calls.push({name:"listLocalExpenseCategories",input});return [{id:CATEGORY,code:"FOOD",name:"Food and kitchen"}];},
  listLocalBankAccounts:async input=>{calls.push({name:"listLocalBankAccounts",input});return [{id:RECORD,accountName:"School account",bankName:"Example Bank",last4:"1234",openingBalanceUgx:1000}];}
 }});
 const categories=await invoke(handler,{path:"/api/v1/finance/expense-categories",method:"GET",headers:getHeaders});
 const accounts=await invoke(handler,{path:"/api/v1/finance/bank-accounts",method:"GET",headers:getHeaders});
 assert.equal(categories.statusCode,200);assert.equal(accounts.statusCode,200);
 assert.equal(categories.json().items[0].id,CATEGORY);assert.equal(accounts.json().items[0].last4,"1234");
 assert.equal(calls.length,2);
});

test("expense and bank review queue endpoints require their respective reviewer or verifier permissions",async()=>{
 const {handler,calls}=setup({permissions:["finance.expenses_review","finance.banking_verify"],overrides:{
  listLocalExpenseReviewQueue:async input=>{calls.push({name:"listLocalExpenseReviewQueue",input});return [{id:RECORD,status:"Pending",amountUgx:5000}];},
  listLocalBankReviewQueue:async input=>{calls.push({name:"listLocalBankReviewQueue",input});return [{id:RECORD,status:"Approved",amountUgx:7000}];}
 }});
 const expenses=await invoke(handler,{path:"/api/v1/finance/expense-review-queue",method:"GET",headers:getHeaders});
 const bank=await invoke(handler,{path:"/api/v1/finance/bank-review-queue",method:"GET",headers:getHeaders});
 assert.equal(expenses.statusCode,200);assert.equal(bank.statusCode,200);
 assert.equal(expenses.json().items[0].id,RECORD);assert.equal(bank.json().items[0].status,"Approved");
 assert.deepEqual(calls.map(call=>call.name),["listLocalExpenseReviewQueue","listLocalBankReviewQueue"]);
});
test("finance review queue endpoints deny users without review or posting permissions",async()=>{
 const {handler}=setup({permissions:["finance.expenses_request","finance.banking_manage"]});
 const expenses=await invoke(handler,{path:"/api/v1/finance/expense-review-queue",method:"GET",headers:getHeaders});
 const bank=await invoke(handler,{path:"/api/v1/finance/bank-review-queue",method:"GET",headers:getHeaders});
 assert.equal(expenses.statusCode,403);assert.equal(bank.statusCode,403);
});
