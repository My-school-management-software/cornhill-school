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
  for(const id of ["login-form","search-form","learner-panel","fee-obligations","payment-form","receipt-panel","print-receipt","reprint-panel","reprint-form"]) {
    assert.ok(html.includes('id="'+id+'"'),"Missing Bursar component "+id);
  }
  assert.match(html,/Previous-term balances are optional/);
  assert.match(html,/Amount received \(UGX\)/);
});
test("Bursar client uses secure same-origin APIs, CSRF and stable idempotency keys",()=>{
  for(const route of ["/api/v1/health","/auth/staff/login","/auth/session","/auth/logout","/finance/learners","/finance/payments","/finance/receipts/"]) {
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
  assert.match(css,/\.reprint-panel \{ display: none !important; \}/);
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

test("Bursar receipt reprint requires permission, a reason and an audited API route",()=>{
  assert.match(js,/finance\.receipts_reprint/);
  assert.match(js,/reprint-reason/);
  assert.match(js,/reprint_local_payment_receipt|\/finance\/receipts\//);
  assert.match(js,/Reprint Copy/);
  assert.match(js,/REVERSED — ORIGINAL RECEIPT COPY/);
});
test("receipt reprint action is hidden unless the staff session grants the separate permission",()=>{
  assert.match(js,/canReprintReceipts/);
  assert.match(js,/reprint-panel/);
});

test("Bursar screen exposes retained-credit sources and a separate allocation form",()=>{
  for(const id of ["credit-section","credit-sources","credit-allocation-form","credit-source-select","credit-allocation-lines","credit-reason","credit-allocation-button","credit-message"]) {
    assert.ok(html.includes('id="'+id+'"'),"Missing retained-credit component "+id);
  }
  assert.match(html,/The original receipt will remain unchanged/);
});
test("Bursar retained-credit workflow loads permission-scoped sources and posts idempotently",()=>{
  assert.match(js,/finance\.credit_allocate/);
  assert.match(js,/\/finance\/learners\//);
  assert.match(js,/\/credits/);
  assert.match(js,/\/finance\/credits\/allocate/);
  assert.match(js,/pendingCreditSubmission/);
  assert.match(js,/crypto\.randomUUID\(\)/);
  assert.match(js,/Retry will reuse the exact same request safely/);
  assert.match(js,/original payment and receipt remain unchanged/);
});
test("Bursar retained-credit controls are excluded from printed receipts",()=>{
  assert.match(css,/#credit-section \{ display: none !important; \}/);
});

test("Bursar retained-credit retry survives a page refresh with its original learner, body and idempotency key",()=>{
  assert.match(js,/PENDING_CREDIT_STORAGE/);
  assert.match(js,/readPendingCreditSubmission/);
  assert.match(js,/savePendingCreditSubmission\(pendingCreditSubmission\)/);
  assert.match(js,/learnerId: activeLearnerId/);
  assert.match(js,/restorePendingCreditForm/);
  assert.match(js,/Retry pending credit allocation/);
  assert.match(js,/savePendingCreditSubmission\(null\)/);
});
test("Bursar blocks switching learners while a retained-credit request is unresolved",()=>{
  assert.match(js,/pendingCreditSubmission && learnerId !== pendingCreditSubmission\.learnerId/);
  assert.match(js,/Open the same learner and retry that exact request/);
});

test("Bursar persists only an actor-scoped opaque credit request key across tabs",()=>{
  assert.match(js,/localStorage\.setItem/);
  assert.match(js,/PENDING_CREDIT_KEY_STORAGE/);
  assert.match(js,/getCreditAllocationByKey|finance\/credits\/allocations/);
  assert.match(js,/body: null/);
  assert.match(js,/[Rr]e-enter the same source receipt, fee amounts and reason/);
});

test("Bursar payment recovery persists only the actor-scoped key and learner reference",()=>{
  assert.match(js,/PENDING_PAYMENT_RECOVERY_STORAGE/);
  assert.match(js,/localStorage\.setItem/);
  assert.match(js,/finance\/payments\/requests/);
  assert.match(js,/paymentLookup|status\.payment/);
  assert.match(js,/body: value\.body/);
  assert.match(js,/Re-enter the exact same payment details/);
});
