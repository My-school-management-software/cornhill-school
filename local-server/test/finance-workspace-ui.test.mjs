import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html=await readFile(new URL("../public/bursar.html",import.meta.url),"utf8");
const js=await readFile(new URL("../public/bursar.js",import.meta.url),"utf8");
const css=await readFile(new URL("../public/bursar.css",import.meta.url),"utf8");

test("Bursar workspace exposes separate expense request and bank account/transaction forms",()=>{
 for(const id of ["expense-banking-workspace","expense-request-form","expense-category","expense-description","expense-amount",
  "bank-account-form","bank-account-name","bank-name","bank-last4","bank-opening-balance",
  "bank-transaction-form","bank-account-select","bank-transaction-type","bank-transaction-amount"]) {
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/last four digits only/);
 assert.match(html,/independent review/);
});

test("finance workspace uses permission-specific authenticated APIs and does not require payment-record permission",()=>{
 assert.match(js,/finance[.]expenses_request/);
 assert.match(js,/finance[.]banking_manage/);
 assert.match(js,/finance[.]expenses_request","finance[.]expenses_manage"/);
 assert.match(js,/\/finance\/expense-categories/);
 assert.match(js,/\/finance\/bank-accounts/);
 assert.match(js,/\/finance\/expenses/);
 assert.match(js,/\/finance\/bank-transactions/);
 assert.match(js,/credentials:\s*"same-origin"/);
});

test("operations forms have responsive layouts and retain the existing thermal receipt print styling",()=>{
 assert.match(css,/operations-grid/);
 assert.match(css,/grid-template-columns:\s*repeat\(auto-fit/);
 assert.match(css,/@media print/);
 assert.match(css,/max-width:\s*76mm/);
});

test("Bursar screen provides separate expense and bank approval queues",()=>{
 for(const id of ["finance-review-workspace","expense-review-panel","expense-review-queue","bank-review-panel","bank-review-queue","refresh-finance-queues"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/person who submits a request cannot approve their own request/);
});
test("finance review interface wires independent approval, rejection, evidence and posting controls",()=>{
 assert.match(js,/finance[.]expenses_review/);
 assert.match(js,/finance[.]expenses_post/);
 assert.match(js,/finance[.]banking_review/);
 assert.match(js,/finance[.]banking_verify/);
 assert.match(js,/\/finance\/expense-review-queue/);
 assert.match(js,/\/finance\/bank-review-queue/);
 assert.match(js,/decision:"Rejected"/);
 assert.match(js,/decision:"Approved"/);
 assert.match(js,/evidenceRequestId/);
 assert.match(js,/\/post/);
 assert.match(js,/\/verify/);
});
test("review queue UI uses text nodes for database content and responsive review controls",()=>{
 assert.match(js,/document[.]createElement\("article"\)/);
 assert.match(js,/heading[.]textContent/);
 assert.match(css,/finance-review-list/);
 assert.match(css,/finance-review-actions/);
 assert.match(css,/flex-wrap:\s*wrap/);
});

test("reviewers can attach matching evidence to pending and approved finance requests before final posting",()=>{
 assert.match(js,/if\(item[.]status==="Pending"\|\|item[.]status==="Approved"\)/);
 assert.match(js,/if\(item[.]status==="Approved"&&kind==="expense"/);
 assert.match(js,/if\(item[.]status==="Approved"&&kind==="bank"/);
});


test("Bursar workspace exposes permission-gated daily expense limit administration",()=>{
 for(const id of ["expense-limit-form","expense-limit-staff","expense-daily-limit","expense-limit-message"])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/finance[.]expenses_manage/);
 assert.match(js,/finance\/expenses\/limit-staff/);
 assert.match(js,/finance\/expenses\/limits/);
 assert.match(js,/Only active staff accounts are listed/);
 assert.match(js,/Number[.]isSafeInteger\(dailyLimitUgx\)/);
});
