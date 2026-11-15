import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createOpaqueSessionSecrets } from "../src/security/session-tokens.mjs";
import { SESSION_COOKIE_NAME } from "../src/security/session-cookies.mjs";
import { createSchoolCatalogHttpHandler } from "../src/security/school-catalog-http-handler.mjs";

const ORIGIN = "https://cornhill.local";
const secrets = createOpaqueSessionSecrets();
const staff = {
  id: "11111111-1111-4111-8111-111111111111",
  principalType: "staff",
  accountStatus: "active",
  roles: ["headteacher"],
  rolePermissions: { headteacher: ["learners.read"] },
  session: { revokedAt: null, expiresAt: new Date(Date.now() + 60000) }
};
function setup({ principal = staff, rows = [] } = {}) {
  const calls = { auth: [], repository: 0 };
  const handler = createSchoolCatalogHttpHandler({
    expectedOrigin: ORIGIN,
    authService: { async authenticate(input) { calls.auth.push(input); if (!principal) throw new Error("not authenticated"); return principal; } },
    schoolRepository: { async listActiveClassesAndSubjects() { calls.repository++; return rows; } }
  });
  return { handler, calls };
}
function response() {
  return { statusCode: 0, headers: {}, body: "", writeHead(code, headers={}) { this.statusCode=code; this.headers=headers; }, end(body="") { this.body=Buffer.isBuffer(body)?body.toString():String(body); }, json() { return this.body ? JSON.parse(this.body) : null; } };
}
async function invoke(handler,{path="/api/v1/school/catalog",method="GET",headers={},encrypted=true}={}) {
  const req=Readable.from([]); req.url=path; req.method=method;
  req.headers=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  req.socket={encrypted};
  const res=response(); const handled=await handler(req,res); return {...res,handled};
}
const cookie=SESSION_COOKIE_NAME+"="+secrets.sessionToken;

test("catalogue requires a secure, correctly addressed HTTPS request", async () => {
  const {handler,calls}=setup();
  assert.equal((await invoke(handler,{encrypted:false,headers:{host:"cornhill.local"}})).statusCode,426);
  assert.equal((await invoke(handler,{headers:{host:"attacker.local"}})).statusCode,421);
  assert.equal(calls.auth.length,0);
});

test("catalogue returns only repository class and subject data to an authorised staff session", async () => {
  const rows=[{id:"class-id",classCode:"P1",displayName:"P.1",subjects:[{subjectCode:"ENGLISH"}]}];
  const {handler,calls}=setup({rows});
  const res=await invoke(handler,{headers:{host:"cornhill.local",cookie}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.json(),{classes:rows});
  assert.equal(calls.auth.length,1);
  assert.equal(calls.auth[0].method,"GET");
  assert.equal(calls.repository,1);
  assert.equal(res.headers["cache-control"],"no-store");
});

test("catalogue refuses guardian principals", async () => {
  const guardian={...staff,principalType:"guardian"};
  const {handler,calls}=setup({principal:guardian});
  const res=await invoke(handler,{headers:{host:"cornhill.local",cookie}});
  assert.equal(res.statusCode,403);
  assert.equal(calls.repository,0);
});

test("catalogue refuses staff without learners.read permission", async () => {
  const noPermission={...staff,rolePermissions:{headteacher:[]}};
  const {handler,calls}=setup({principal:noPermission});
  const res=await invoke(handler,{headers:{host:"cornhill.local",cookie}});
  assert.equal(res.statusCode,403);
  assert.equal(calls.repository,0);
});

test("catalogue is read-only and rejects unsupported methods", async () => {
  const {handler,calls}=setup();
  const res=await invoke(handler,{method:"POST",headers:{host:"cornhill.local",cookie}});
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.Allow,"GET, HEAD");
  assert.equal(calls.auth.length,0);
});

test("catalogue returns a generic service error if authentication is unavailable", async () => {
  const {handler}=setup({principal:null});
  const res=await invoke(handler,{headers:{host:"cornhill.local",cookie}});
  assert.equal(res.statusCode,503);
  assert.doesNotMatch(res.body,/not authenticated/);
});

test("catalogue returns a generic error if the repository fails", async () => {
  const {handler}=setup();
  const badHandler=createSchoolCatalogHttpHandler({
    expectedOrigin:ORIGIN,
    authService:{async authenticate(){return staff;}},
    schoolRepository:{async listActiveClassesAndSubjects(){throw new Error("database password leaked");}}
  });
  const res=await invoke(badHandler,{headers:{host:"cornhill.local",cookie}});
  assert.equal(res.statusCode,503);
  assert.doesNotMatch(res.body,/database password/);
});
