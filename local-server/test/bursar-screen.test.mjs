import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html=await readFile(new URL("../public/bursar.html",import.meta.url),"utf8");
const js=await readFile(new URL("../public/bursar.js",import.meta.url),"utf8");
const css=await readFile(new URL("../public/bursar.css",import.meta.url),"utf8");
const httpsSource=await readFile(new URL("../src/https-server.mjs",import.meta.url),"utf8");
const launcher=await readFile(new URL("../scripts/start-local-auth.mjs",import.meta.url),"utf8");

test("Bursar page uses only same-origin local assets and has no third-party scripts",()=>{
  assert.match(html,/<title>CORNHILL \| Bursar Desk<\/title>/);
  assert.match(html,/<link rel="stylesheet" href="\/bursar\.css">/);
  assert.match(html,/<script src="\/bursar\.js" defer><\/script>/);
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(html,/<link[^>]+href=["']https?:\/\//i);
});
test("Bursar page contains staff sign-in, learner search, fee account and payment receipt panels",()=>{
  for(const id of ["login-form","search-form","learner-panel","fee-obligations","payment-form","receipt-panel","print-receipt"]) {
    assert.ok(html.includes('id="'+id+'"'),"Missing Bursar component "+id);
  }
  assert.match(html,/Previous-term balances are optional/);
  assert.match(html,/Amount received \(UGX\)/);
});
test("Bursar client uses secure same-origin APIs, CSRF and stable idempotency keys",()=>{
  for(const route of ["/api/v1/health","/auth/staff/login","/auth/session","/auth/logout","/finance/learners","/finance/payments"]) {
    assert.ok(js.includes(route),"Missing local API route "+route);
  }
  assert.match(js,/X-Cornhill-CSRF/);
  assert.match(js,/Idempotency-Key/);
  assert.match(js,/crypto\.randomUUID\(\)/);
  assert.match(js,/credentials: "same-origin"/);
  assert.match(js,/cache: "no-store"/);
});
test("Bursar client never writes server-provided strings with innerHTML",()=>{
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.doesNotMatch(js,/\.style\.[A-Za-z]+\s*=/);
  assert.match(js,/textContent\s*=/);
  assert.match(js,/finance\.payments_record/);
});
test("Bursar UI makes prior term balances optional and displays unallocated remainder",()=>{
  assert.match(js,/PREVIOUS \/ OTHER TERM/);
  assert.match(js,/CURRENT TERM/);
  assert.match(js,/unallocated_amount_ugx/);
  assert.match(js,/PENDING_KEY_STORAGE/);
  assert.match(js,/sessionStorage\.setItem/);
  assert.match(js,/setPaymentFormLocked/);
  assert.match(js,/will be retained as unallocated learner credit/);
});
test("Bursar print stylesheet includes a narrow receipt layout",()=>{
  assert.match(css,/@media print/);
  assert.match(css,/max-width: 76mm/);
  assert.match(css,/#receipt-panel\s*\{\s*display: block !important/);
});
test("HTTPS server serves only the allow-listed Bursar assets with a restrictive same-origin CSP",()=>{
  assert.match(httpsSource,/PUBLIC_ASSETS = new Map/);
  for(const route of ["/","/bursar","/bursar.html","/bursar.js","/bursar.css"]) assert.ok(httpsSource.includes('"'+route+'"'));
  assert.match(httpsSource,/servePublicAsset/);
  assert.match(httpsSource,/STATIC_CONTENT_SECURITY_POLICY/);
  assert.match(httpsSource,/request\.headers\.host !== origin\.host/);
});
test("HTTPS health response exposes finance activation state from runtime configuration",()=>{
  assert.match(httpsSource,/financeApiEnabled: financeApiEnabled === true/);
  assert.match(launcher,/financeApiEnabled: runtime\.financeEnabled/);
  assert.match(launcher,/Bursar finance API enabled:/);
});
