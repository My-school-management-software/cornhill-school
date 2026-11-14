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
