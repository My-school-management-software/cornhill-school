import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {createPupilBalancesReportHttpHandler, parsePupilBalanceFilters} from "../src/security/pupil-balances-report-http-handler.mjs";
import {SESSION_COOKIE_NAME} from "../src/security/session-cookies.mjs";

const ORIGIN="https://cornhill.local:4174";
const ID="11111111-1111-4111-8111-111111111111";
function principal(roles, permissions) {
  return {id:ID,principalType:"staff",accountStatus:"active",roles,
    rolePermissions:Object.fromEntries(roles.map(role=>[role,permissions[role]??[]])),
    session:{revokedAt:null,expiresAt:Date.now()+60000}};
}
const director=principal(["director"],{director:["finance.reports_read"]});
const bursar=principal(["bursar"],{bursar:["finance.reports_read"]});
const deputy=principal(["deputy_bursar"],{deputy_bursar:["finance.reports_read"]});
function fixture(user=director){
  const calls=[];
  const handler=createPupilBalancesReportHttpHandler({
    authService:{async authenticate(){return user;}},
    reportRepository:{async getPupilBalances(arg){calls.push(arg);return {asOf:"2026-11-23T11:00:00Z",rows:[],totals:{rowCount:0,totalOutstandingUgx:0,previousTermOutstandingUgx:0,currentTermOutstandingUgx:0}};}},
    expectedOrigin:ORIGIN
  });
  return {handler,calls};
}
async function send(handler,{path="/api/v1/finance/reports/pupil-balances",method="GET",host="cornhill.local:4174",encrypted=true}={}){
  const req=Readable.from([]);
  req.url=path;req.method=method;req.headers={host,cookie:SESSION_COOKIE_NAME+"="+"A".repeat(43)};req.socket={encrypted};
  const res={status:0,body:"",headers:{},writeHead(code,headers){this.status=code;this.headers=headers;},end(body){this.body=String(body??"");}};
  const handled=await handler(req,res);
  return {handled,...res};
}
test("Director, Bursar and delegated Deputy Bursar may read reporting only",async()=>{
  for(const who of [director,bursar,deputy]){
    const {handler,calls}=fixture(who);
    const r=await send(handler);
    assert.equal(r.status,200);assert.equal(calls.length,1);
    assert.equal(calls[0].actorStaffId,ID);
    assert.equal(r.headers["Cache-Control"],"no-store");
  }
});
test("Finance payment-posting permission alone does not unlock pupil reports",async()=>{
  const {handler,calls}=fixture(principal(["bursar"],{bursar:["finance.payments_record"]}));
  assert.equal((await send(handler)).status,403);assert.equal(calls.length,0);
});
test("Teacher, guardian and unknown roles cannot enumerate report rows",async()=>{
  for(const who of [principal(["teacher"],{teacher:["finance.reports_read"]}),
    {id:ID,principalType:"guardian",roles:["guardian"],accountStatus:"active",session:{expiresAt:Date.now()+60000},rolePermissions:{}},
    principal(["headteacher"],{headteacher:["finance.reports_read"]})]){
    const {handler,calls}=fixture(who);
    assert.equal((await send(handler)).status,403);assert.equal(calls.length,0);
  }
});
test("Report endpoint rejects mutation methods before repository access",async()=>{
  const {handler,calls}=fixture();
  const r=await send(handler,{method:"POST"});
  assert.equal(r.status,405);assert.equal(calls.length,0);
});
test("HTTPS and expected host are enforced",async()=>{
  const {handler,calls}=fixture();
  assert.equal((await send(handler,{encrypted:false})).status,426);
  assert.equal((await send(handler,{host:"other.example"})).status,421);
  assert.equal(calls.length,0);
});
test("Allowed report filters are bounded and delivered to read-only repository",async()=>{
  const {handler,calls}=fixture();
  const r=await send(handler,{path:"/api/v1/finance/reports/pupil-balances?year=2026&term=3&page=2&pageSize=20&class=P.4&status=partly_paid&query=CH25"});
  assert.equal(r.status,200);
  assert.deepEqual(calls[0].filters,{year:2026,term:3,page:2,pageSize:20,className:"P.4",status:"partly_paid",query:"CH25"});
});
test("Duplicated, invalid and unrecognised filters never reach the repository",async()=>{
  for(const suffix of ["?page=0","?pageSize=101","?term=4","?year=1900","?status=other","?query=abc%0Adef","?page=1&page=2","?admin=true"]){
    const {handler,calls}=fixture();
    assert.equal((await send(handler,{path:"/api/v1/finance/reports/pupil-balances"+suffix})).status,400,suffix);
    assert.equal(calls.length,0);
  }
  assert.equal(parsePupilBalanceFilters(new URLSearchParams()).pageSize,25);
});
test("Unrelated routes are left to their own handler",async()=>{
  const {handler}=fixture();
  assert.equal((await send(handler,{path:"/api/v1/finance/payments"})).handled,false);
});
