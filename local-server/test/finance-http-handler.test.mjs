import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createFinanceHttpHandler } from "../src/security/finance-http-handler.mjs";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import { AuthenticationError, CsrfValidationError } from "../src/security/auth-service.mjs";

const ORIGIN="https://cornhill.local:4174";
const STAFF_ID="11111111-1111-4111-8111-111111111111";
const LEARNER_ID="22222222-2222-4222-8222-222222222222";
const FEE_OLD="33333333-3333-4333-8333-333333333333";
const FEE_NOW="44444444-4444-4444-8444-444444444444";
const SOURCE_PAYMENT="55555555-5555-4555-8555-555555555555";
const TOKEN="A".repeat(43);
const principal={
  id:STAFF_ID,principalType:"staff",accountStatus:"active",
  roles:["bursar"],rolePermissions:{bursar:["finance.payments_record"]},
  session:{revokedAt:null,expiresAt:new Date(Date.now()+60_000).toISOString()}
};

function responseFixture(){
  return {
    statusCode:null,headers:{},body:"",
    writeHead(code,headers={}){this.statusCode=code;this.headers=headers;},
    end(body=""){this.body=String(body);},
    json(){return this.body?JSON.parse(this.body):null;}
  };
}
async function invoke(handler,{path,method="GET",headers={},body,encrypted=true}={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(body)]);
  req.url=path;req.method=method;
  req.headers=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  req.socket={encrypted,remoteAddress:"127.0.0.1"};
  const res=responseFixture();
  const handled=await handler(req,res);
  return {...res,handled};
}
function setup({principalValue=principal,authError,repoOverrides={}}={}){
  const calls={auth:[],search:[],account:[],post:[],reprints:[],credits:[],creditLists:[]};
  const authService={
    async authenticate(input){
      calls.auth.push(input);
      if(authError)throw authError;
      return principalValue;
    }
  };
  const financeRepository={
    async searchLearners(input){calls.search.push(input);return [{learnerId:LEARNER_ID,pupilCode:"CRN-F-001",learnerName:"CI Learner",className:"P.4",isBursary:false}];},
    async getLearnerAccount(input){calls.account.push(input);return {learner:{id:LEARNER_ID,pupil_code:"CRN-F-001"},totals:{charged_ugx:150000,paid_ugx:25000,balance_ugx:125000},fee_obligations:[]};},
    async postPayment(input){calls.post.push(input);return {paymentId:"55555555-5555-4555-8555-555555555555",receiptNumber:"CR-2026-0000001",status:"Posted",allocatedAmountUgx:75000,unallocatedAmountUgx:10000,receipt:{amount_ugx:85000}};},
    async reprintReceipt(input){calls.reprints.push(input);return {receipt_number:input.receiptNumber,payment_status:"Posted",print_count:2,receipt_data_snapshot:{amount_ugx:85000}};},
    async allocateCredit(input){calls.credits.push(input);return {batch_id:"77777777-7777-4777-8777-777777777777",source_payment_id:input.sourcePaymentId,total_allocated_ugx:6000,remaining_credit_ugx:4000,replayed:false};},
    async listLearnerCredits(input){calls.creditLists.push(input);return [{paymentId:SOURCE_PAYMENT,receiptNumber:"CR-2026-0000001",amountUgx:85000,originalUnallocatedUgx:10000,allocatedCreditUgx:6000,remainingCreditUgx:4000}];},
    ...repoOverrides
  };
  return {handler:createFinanceHttpHandler({authService,financeRepository,expectedOrigin:ORIGIN}),calls};
}
const getHeaders={Host:"cornhill.local:4174",Cookie:SESSION_COOKIE_NAME+"="+TOKEN};
const postHeaders={
  Host:"cornhill.local:4174",Origin:ORIGIN,Cookie:SESSION_COOKIE_NAME+"="+TOKEN,
  "X-Cornhill-CSRF":"B".repeat(43),"Content-Type":"application/json",
  "Idempotency-Key":"66666666-6666-4666-8666-666666666666"
};
const validBody={
  learnerId:LEARNER_ID,amountUgx:85000,paymentMethod:"cash",
  allocations:[{feeObligationId:FEE_OLD,amountUgx:50000},{feeObligationId:FEE_NOW,amountUgx:25000}],
  payerName:"CI Parent",collectionItem:"School fees"
};

test("finance handler requires a complete auth service and repository",()=>{
  assert.throws(()=>createFinanceHttpHandler({expectedOrigin:ORIGIN}),/authentication service/);
});
test("unrelated routes are not claimed by finance handler",async()=>{
  const {handler}=setup();
  const result=await invoke(handler,{path:"/api/v1/health"});
  assert.equal(result.handled,false);
});
test("learner lookup authenticates staff and returns bounded learner summaries",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{path:"/api/v1/finance/learners?search=CRN",headers:getHeaders});
  assert.equal(result.statusCode,200);
  assert.equal(result.json().learners[0].pupilCode,"CRN-F-001");
  assert.equal(calls.search[0].actorStaffId,STAFF_ID);
  assert.equal(calls.search[0].search,"CRN");
  assert.equal(calls.auth[0].method,"GET");
  assert.equal(result.headers["Cache-Control"],"no-store");
});
test("finance lookup rejects unauthenticated sessions before database access",async()=>{
  const {handler,calls}=setup({authError:new AuthenticationError()});
  const result=await invoke(handler,{path:"/api/v1/finance/learners?search=CR",headers:getHeaders});
  assert.equal(result.statusCode,401);assert.equal(calls.search.length,0);
});
test("finance lookup rejects principals without the finance permission",async()=>{
  const {handler,calls}=setup({principalValue:{...principal,rolePermissions:{bursar:[]}}});
  const result=await invoke(handler,{path:"/api/v1/finance/learners?search=CR",headers:getHeaders});
  assert.equal(result.statusCode,403);assert.equal(calls.search.length,0);
});
test("finance handler refuses non-HTTPS requests and mismatched hosts",async()=>{
  const {handler,calls}=setup();
  const clear=await invoke(handler,{path:"/api/v1/finance/learners?search=CR",headers:getHeaders,encrypted:false});
  assert.equal(clear.statusCode,426);assert.equal(calls.auth.length,0);
  const wrongHost=await invoke(handler,{path:"/api/v1/finance/learners?search=CR",headers:{...getHeaders,Host:"attacker.example"}});
  assert.equal(wrongHost.statusCode,421);assert.equal(calls.auth.length,0);
});
test("learner search requires at least two characters",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{path:"/api/v1/finance/learners?search=A",headers:getHeaders});
  assert.equal(result.statusCode,400);assert.equal(calls.search.length,0);
});
test("learner account route passes only the authenticated staff and path learner ID",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{path:"/api/v1/finance/learners/"+LEARNER_ID+"/account",headers:getHeaders});
  assert.equal(result.statusCode,200);
  assert.equal(calls.account[0].actorStaffId,STAFF_ID);
  assert.equal(calls.account[0].learnerId,LEARNER_ID);
});
test("learner account returns 404 when the active learner is absent",async()=>{
  const {handler}=setup({repoOverrides:{async getLearnerAccount(){return null;}}});
  const result=await invoke(handler,{path:"/api/v1/finance/learners/"+LEARNER_ID+"/account",headers:getHeaders});
  assert.equal(result.statusCode,404);
});
test("payment posting requires same-origin POST, CSRF and a valid idempotency key",async()=>{
  const {handler,calls}=setup();
  const noOrigin=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:{...postHeaders,Origin:"https://other.example"},body:JSON.stringify(validBody)});
  assert.equal(noOrigin.statusCode,403);assert.equal(calls.post.length,0);
  const noKey=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:{...postHeaders,"Idempotency-Key":"invalid"},body:JSON.stringify(validBody)});
  assert.equal(noKey.statusCode,400);assert.equal(calls.post.length,0);
});
test("payment posting passes authenticated actor, split allocations and idempotency to repository",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify(validBody)});
  assert.equal(result.statusCode,201);
  assert.equal(result.json().payment.receiptNumber,"CR-2026-0000001");
  assert.equal(calls.post[0].actorStaffId,STAFF_ID);
  assert.equal(calls.post[0].learnerId,LEARNER_ID);
  assert.equal(calls.post[0].idempotencyKey,postHeaders["Idempotency-Key"]);
  assert.deepEqual(calls.post[0].allocations,[
    {fee_obligation_id:FEE_OLD,amount_ugx:50000},
    {fee_obligation_id:FEE_NOW,amount_ugx:25000}
  ]);
});
test("mobile-money payments require an MTN or Airtel provider",async()=>{
  const {handler,calls}=setup();
  const invalid=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify({...validBody,paymentMethod:"mobile_money"})});
  assert.equal(invalid.statusCode,400);assert.equal(calls.post.length,0);
  const valid=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify({...validBody,paymentMethod:"mobile_money",mobileMoneyProvider:"MTN"})});
  assert.equal(valid.statusCode,201);assert.equal(calls.post[0].mobileMoneyProvider,"MTN");
});
test("duplicate fee allocation and over-allocation payloads are rejected",async()=>{
  const {handler,calls}=setup();
  const duplicate=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify({...validBody,allocations:[{feeObligationId:FEE_OLD,amountUgx:100},{feeObligationId:FEE_OLD,amountUgx:100}]})});
  assert.equal(duplicate.statusCode,400);
  const exceeds=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify({...validBody,amountUgx:100,allocations:[{feeObligationId:FEE_OLD,amountUgx:101}]})});
  assert.equal(exceeds.statusCode,400);assert.equal(calls.post.length,0);
});
test("payment handler rejects invalid methods, amounts, large body and malformed JSON",async()=>{
  const {handler,calls}=setup();
  for(const body of [
    {...validBody,amountUgx:0},
    {...validBody,amountUgx:1.2},
    {...validBody,paymentMethod:"bitcoin"}
  ]){
    const r=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify(body)});
    assert.equal(r.statusCode,400);
  }
  const malformed=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:"{bad"});
  assert.equal(malformed.statusCode,400);
  const tooLarge=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify({notes:"x".repeat(18000)})});
  assert.equal(tooLarge.statusCode,413);
  assert.equal(calls.post.length,0);
});
test("CSRF and database errors are mapped without leaking server details",async()=>{
  const {handler}=setup({authError:new CsrfValidationError()});
  const csrf=await invoke(handler,{path:"/api/v1/finance/payments",method:"POST",headers:postHeaders,body:JSON.stringify(validBody)});
  assert.equal(csrf.statusCode,403);
  const db=setup({repoOverrides:{async searchLearners(){throw new Error("private SQL password");}}});
  const failed=await invoke(db.handler,{path:"/api/v1/finance/learners?search=CR",headers:getHeaders});
  assert.equal(failed.statusCode,503);assert.doesNotMatch(failed.body,/private SQL password/);
});
test("finance handler allows only GET and POST methods",async()=>{
  const {handler}=setup();
  const result=await invoke(handler,{path:"/api/v1/finance/learners",method:"DELETE",headers:getHeaders});
  assert.equal(result.statusCode,405);
});

test("receipt reprint requires its separate permission, a reason and a matching receipt number",async()=>{
  const receiptPrincipal={
    ...principal,
    rolePermissions:{bursar:["finance.receipts_reprint"]}
  };
  const {handler,calls}=setup({principalValue:receiptPrincipal});
  const path="/api/v1/finance/receipts/CR-2026-0000001/reprint";
  const result=await invoke(handler,{path,method:"POST",headers:postHeaders,body:JSON.stringify({reason:"Parent requested another copy"})});
  assert.equal(result.statusCode,200);
  assert.equal(result.json().receipt.receipt_number,"CR-2026-0000001");
  assert.equal(calls.reprints.length,1);
  assert.equal(calls.reprints[0].actorStaffId,STAFF_ID);
  assert.equal(calls.reprints[0].receiptNumber,"CR-2026-0000001");
  assert.equal(calls.reprints[0].reason,"Parent requested another copy");
  assert.equal(calls.post.length,0);
});
test("receipt reprint rejects a staff user without the separate reprint permission",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{
    path:"/api/v1/finance/receipts/CR-2026-0000001/reprint",
    method:"POST",headers:postHeaders,body:JSON.stringify({reason:"Parent requested another copy"})
  });
  assert.equal(result.statusCode,403);
  assert.equal(calls.reprints.length,0);
});
test("receipt reprint requires a valid explanatory reason",async()=>{
  const {handler,calls}=setup({
    principalValue:{...principal,rolePermissions:{bursar:["finance.receipts_reprint"]}}
  });
  const result=await invoke(handler,{
    path:"/api/v1/finance/receipts/CR-2026-0000001/reprint",
    method:"POST",headers:postHeaders,body:JSON.stringify({reason:"bad"})
  });
  assert.equal(result.statusCode,400);
  assert.equal(calls.reprints.length,0);
});

test("receipt reprint maps an unknown original receipt to 404",async()=>{
  const {handler,calls}=setup({
    principalValue:{...principal,rolePermissions:{bursar:["finance.receipts_reprint"]}},
    repoOverrides:{async reprintReceipt(input){calls.reprints.push(input);const error=new Error("not found");error.code="P0002";throw error;}}
  });
  const result=await invoke(handler,{
    path:"/api/v1/finance/receipts/CR-2026-0000001/reprint",
    method:"POST",headers:postHeaders,body:JSON.stringify({reason:"Parent requested another copy"})
  });
  assert.equal(result.statusCode,404);
  assert.equal(calls.reprints.length,1);
});

const creditPrincipal={...principal,rolePermissions:{bursar:["finance.credit_allocate"]}};
test("retained-credit allocation requires its independent permission and records authenticated actor",async()=>{
  const {handler,calls}=setup({principalValue:creditPrincipal});
  const result=await invoke(handler,{
    path:"/api/v1/finance/credits/allocate",method:"POST",headers:postHeaders,
    body:JSON.stringify({
      sourcePaymentId:SOURCE_PAYMENT,
      allocations:[{feeObligationId:FEE_NOW,amountUgx:6000}],
      reason:"Apply retained credit to current term"
    })
  });
  assert.equal(result.statusCode,200);
  assert.equal(result.json().allocation.remaining_credit_ugx,4000);
  assert.equal(calls.credits.length,1);
  assert.equal(calls.credits[0].actorStaffId,STAFF_ID);
  assert.equal(calls.credits[0].sourcePaymentId,SOURCE_PAYMENT);
  assert.equal(calls.credits[0].idempotencyKey,postHeaders["Idempotency-Key"]);
  assert.deepEqual(calls.credits[0].allocations,[{fee_obligation_id:FEE_NOW,amount_ugx:6000}]);
  assert.equal(calls.credits[0].reason,"Apply retained credit to current term");
});
test("retained-credit allocation rejects staff without the separate permission",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{
    path:"/api/v1/finance/credits/allocate",method:"POST",headers:postHeaders,
    body:JSON.stringify({sourcePaymentId:SOURCE_PAYMENT,allocations:[{feeObligationId:FEE_NOW,amountUgx:6000}],reason:"Apply retained credit"})
  });
  assert.equal(result.statusCode,403);
  assert.equal(calls.credits.length,0);
});
test("retained-credit allocation validates idempotency, reason, duplicate fees and whole-UGX amounts",async()=>{
  const {handler,calls}=setup({principalValue:creditPrincipal});
  const path="/api/v1/finance/credits/allocate";
  const valid={sourcePaymentId:SOURCE_PAYMENT,allocations:[{feeObligationId:FEE_NOW,amountUgx:6000}],reason:"Apply retained credit"};
  const badKey=await invoke(handler,{path,method:"POST",headers:{...postHeaders,"Idempotency-Key":"bad"},body:JSON.stringify(valid)});
  const badReason=await invoke(handler,{path,method:"POST",headers:postHeaders,body:JSON.stringify({...valid,reason:"no"})});
  const duplicate=await invoke(handler,{path,method:"POST",headers:postHeaders,body:JSON.stringify({...valid,allocations:[{feeObligationId:FEE_NOW,amountUgx:1},{feeObligationId:FEE_NOW,amountUgx:2}]})});
  const fraction=await invoke(handler,{path,method:"POST",headers:postHeaders,body:JSON.stringify({...valid,allocations:[{feeObligationId:FEE_NOW,amountUgx:1.5}]})});
  assert.deepEqual([badKey.statusCode,badReason.statusCode,duplicate.statusCode,fraction.statusCode],[400,400,400,400]);
  assert.equal(calls.credits.length,0);
});

test("retained-credit source lookup requires the independent permission and scopes the learner",async()=>{
  const {handler,calls}=setup({principalValue:creditPrincipal});
  const result=await invoke(handler,{path:"/api/v1/finance/learners/"+LEARNER_ID+"/credits",headers:getHeaders});
  assert.equal(result.statusCode,200);
  assert.equal(result.json().credits[0].remainingCreditUgx,4000);
  assert.equal(calls.creditLists.length,1);
  assert.equal(calls.creditLists[0].actorStaffId,STAFF_ID);
  assert.equal(calls.creditLists[0].learnerId,LEARNER_ID);
});
test("retained-credit source lookup is denied without its independent permission",async()=>{
  const {handler,calls}=setup();
  const result=await invoke(handler,{path:"/api/v1/finance/learners/"+LEARNER_ID+"/credits",headers:getHeaders});
  assert.equal(result.statusCode,403);
  assert.equal(calls.creditLists.length,0);
});
