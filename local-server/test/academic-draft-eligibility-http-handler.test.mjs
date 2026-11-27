import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAcademicDraftEligibilityHttpHandler } from "../src/security/academic-draft-eligibility-http-handler.mjs";
import {
  AuthenticationError, AuthenticationRateLimitError, CsrfValidationError,
  AuthenticationServiceError
} from "../src/security/auth-service.mjs";

const ORIGIN="https://cornhill.local";
const PATH="/api/v1/academics/offline-drafts/eligibility";
const STAFF="11111111-1111-4111-8111-111111111111";
const CLASS="22222222-2222-4222-8222-222222222222";
const OTHER="44444444-4444-4444-8444-444444444444";
const values={learnerSourceId:STAFF,assessmentSourceId:"33333333-3333-4333-8333-333333333333",subjectSourceId:CLASS};
const teacher={
  id:STAFF,principalType:"staff",accountStatus:"active",roles:["class_teacher"],classIds:[CLASS],
  rolePermissions:{class_teacher:["academics.marks_enter"]},
  session:{revokedAt:null,expiresAt:new Date(Date.now()+60000)}
};
const verified=Object.freeze({
  mappingVerified:true,recordStatus:"Open",classId:CLASS,
  baselineRevision:1,baselineFingerprint:"a".repeat(64),maxScore:100,
  ...values
});
function make({actor=teacher, mapped=verified, authError=null, mapError=null}={}){
  const calls={auth:0,mapped:0};
  const handler=createAcademicDraftEligibilityHttpHandler({
    expectedOrigin:ORIGIN,
    authService:{async authenticate({method,csrfToken}){
      calls.auth++;
      assert.equal(method,"POST");
      if(authError)throw authError;
      if(csrfToken!=="valid-csrf")throw new CsrfValidationError();
      return actor;
    }},
    recordVerifier:{async verifyDraftSourceMapping(args){
      calls.mapped++;assert.deepEqual(args,values);
      if(mapError)throw mapError;
      return mapped;
    }}
  });
  return {handler,calls};
}
function response(){
  return {
    status:0,body:"",headers:{},
    writeHead(status,headers){this.status=status;this.headers=headers;},
    end(body=""){this.body=Buffer.isBuffer(body)?body.toString():String(body);},
    json(){return this.body?JSON.parse(this.body):null;}
  };
}
async function invoke(handler,{path=PATH,method="POST",body=values,contentType="application/json",encrypted=true,origin=ORIGIN,host="cornhill.local",csrf="valid-csrf",rawBody}={}){
  const chunks=rawBody===undefined?(body===null?[]:[Buffer.from(JSON.stringify(body))]):[Buffer.from(rawBody)];
  const req=Readable.from(chunks);
  req.url=path;req.method=method;
  req.socket={encrypted};
  req.headers={
    host,origin,"content-type":contentType,
    "x-cornhill-csrf":csrf,
    cookie:"__Host-cornhill_session=not-a-real-session"
  };
  const res=response();
  const handled=await handler(req,res);
  return {...res,handled};
}

test("1. valid teacher receives only a read-only eligibility response",async()=>{
  const h=make();const r=await invoke(h.handler);
  assert.equal(r.status,200);assert.equal(r.handled,true);
  assert.deepEqual(r.json(),{
    eligibleForLocalDraftReview:true,recordSaved:false,draftQueued:false,
    cloudSyncEnabled:false,automaticReplayEnabled:false
  });
  assert.equal(h.calls.auth,1);assert.equal(h.calls.mapped,1);
  assert.equal(r.headers["Cache-Control"],"no-store");
  assert.equal(r.headers["X-Frame-Options"],"DENY");
});

test("2. handler leaves unrelated academic routes untouched",async()=>{
  const h=make();const r=await invoke(h.handler,{path:"/api/v1/academics/marks"});
  assert.equal(r.handled,false);assert.equal(h.calls.auth,0);
});

test("3. unsupported method cannot authenticate or read records",async()=>{
  for(const method of ["GET","HEAD","PUT","DELETE"]){
    const h=make();const r=await invoke(h.handler,{method});
    assert.equal(r.status,405);assert.equal(r.headers.Allow,"POST");
    assert.equal(h.calls.mapped,0);assert.equal(h.calls.auth,0);
  }
});

test("4. plain HTTP is rejected before staff lookup",async()=>{
  const h=make();const r=await invoke(h.handler,{encrypted:false});
  assert.equal(r.status,426);assert.equal(h.calls.auth,0);
});

test("5. untrusted host and origin are rejected before staff lookup",async()=>{
  for(const extra of [{origin:"https://evil.example"},{host:"evil.example"}]){
    const h=make();const r=await invoke(h.handler,extra);
    assert.equal(r.status,421);assert.equal(h.calls.auth,0);
  }
});

test("6. query or fragment cannot carry academic identifiers",async()=>{
  for(const path of [PATH+"?id="+STAFF,PATH+"#frag"]){
    const h=make();const r=await invoke(h.handler,{path});
    assert.equal(r.status,400);assert.equal(h.calls.auth,0);
  }
});

test("7. anonymous and expired staff sessions are denied",async()=>{
  const anon=make({authError:new AuthenticationError()});
  assert.equal((await invoke(anon.handler)).status,401);
  const expired=make({actor:{...teacher,session:{...teacher.session,expiresAt:0}}});
  assert.equal((await invoke(expired.handler)).status,403);
  assert.equal(expired.calls.mapped,0);
});

test("8. CSRF protection is required even with staff session cookie",async()=>{
  const h=make();const r=await invoke(h.handler,{csrf:"incorrect"});
  assert.equal(r.status,403);assert.equal(h.calls.mapped,0);
});

test("9. guardian principal and non-marks staff cannot see eligible records",async()=>{
  for(const actor of [
    {...teacher,principalType:"guardian"},
    {...teacher,rolePermissions:{class_teacher:["academics.results_view"]}}
  ]){
    const h=make({actor});const r=await invoke(h.handler);
    assert.equal(r.status,403);assert.equal(h.calls.mapped,0);
  }
});

test("10. teacher outside the assigned class is denied after verifying source mapping",async()=>{
  const h=make({mapped:{...verified,classId:OTHER}});
  const r=await invoke(h.handler);
  assert.equal(r.status,403);assert.equal(h.calls.mapped,1);
});

test("11. missing, unverified or locked assessments fail closed",async()=>{
  for(const mapped of [null,{...verified,mappingVerified:false},{...verified,recordStatus:"Locked"}]){
    const h=make({mapped});const r=await invoke(h.handler);
    assert.equal(r.status,403);
    assert.equal(h.calls.mapped,1);
  }
});

test("12. wrong or extra fields cannot reach the local database",async()=>{
  for(const body of [
    {...values,score:99},{...values,paymentAmount:5000},
    {learnerSourceId:STAFF},{...values,learnerSourceId:"invalid"},
    [values],null
  ]){
    const h=make();const r=await invoke(h.handler,{body});
    assert.equal(r.status,400);
    assert.equal(h.calls.mapped,0);
  }
});

test("13. unsupported MIME or oversized request fails closed",async()=>{
  const a=make();const mime=await invoke(a.handler,{contentType:"text/plain"});
  assert.equal(mime.status,415);assert.equal(a.calls.mapped,0);
  const b=make();const large=await invoke(b.handler,{rawBody:"x".repeat(1100)});
  assert.equal(large.status,413);assert.equal(b.calls.mapped,0);
});

test("14. malformed JSON fails without revealing parser details",async()=>{
  const h=make();const r=await invoke(h.handler,{rawBody:"{bad"});
  assert.equal(r.status,400);assert.equal(h.calls.mapped,0);
});

test("15. generic database failures never leak SQL, secrets or learner details",async()=>{
  const h=make({mapError:new Error("SELECT secret_value WHERE student_id = "+STAFF)});
  const r=await invoke(h.handler);
  assert.equal(r.status,503);
  assert.doesNotMatch(r.body,/SELECT|secret_value|student_id|11111111/);
});

test("16. auth rate limiting stays a 429 and outages stay a 503",async()=>{
  const rate=make({authError:new AuthenticationRateLimitError()});
  assert.equal((await invoke(rate.handler)).status,429);
  const down=make({authError:new AuthenticationServiceError()});
  assert.equal((await invoke(down.handler)).status,503);
});

test("17. incomplete dependencies and invalid HTTPS origin are refused",()=>{
  assert.throws(()=>createAcademicDraftEligibilityHttpHandler(),/required/);
  assert.throws(()=>createAcademicDraftEligibilityHttpHandler({
    authService:{authenticate(){}},recordVerifier:{verifyDraftSourceMapping(){}},
    expectedOrigin:"http://localhost:4174"
  }),/HTTPS/);
});

test("18. eligibility response never contains IDs, scores or fingerprint",async()=>{
  const h=make();const r=await invoke(h.handler);
  assert.equal(r.status,200);
  const data=JSON.stringify(r.json());
  assert.doesNotMatch(data,/11111111|22222222|33333333|a{64}|score|firstName|pupilCode|receipt|password/i);
});
