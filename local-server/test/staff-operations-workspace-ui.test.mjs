import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const html=await readFile(new URL("../public/staff-operations.html",import.meta.url),"utf8");
const js=await readFile(new URL("../public/staff-operations.js",import.meta.url),"utf8");
const server=await readFile(new URL("../src/https-server.mjs",import.meta.url),"utf8");

test("Staff Operations page presents attendance, self-service leave, review and payroll sections",()=>{
  for(const text of ["Staff attendance overview","Submit a leave request","Submitted leave requests","Staff leave balances","Payroll periods and runs"])assert.ok(html.includes(text));
});

test("Staff Operations uses same-origin local APIs and the local CSRF token",()=>{
  assert.match(js,/\/staff\/operations\/workspace/);
  assert.match(js,/\/staff\/leave\/requests/);
  assert.match(js,/X-Cornhill-CSRF/);
  assert.doesNotMatch(js,/https?:\/\//i);
});

test("Staff Operations renders records through text nodes and never injects returned data as HTML",()=>{
  assert.match(js,/td\.textContent/);
  assert.doesNotMatch(js,/innerHTML/);
  assert.doesNotMatch(js,/insertAdjacentHTML/);
});

test("leave review queue clearly separates viewing from approval and payroll does not transfer money",()=>{
  assert.match(html,/approval and balance usage are separate controlled actions/i);
  assert.match(html,/does not initiate bank or mobile-money transfers/i);
});

test("local HTTPS server explicitly serves all Staff Operations assets",()=>{
  for(const route of ["/staff-operations","/staff-operations.html","/staff-operations.js","/staff-operations.css"])assert.ok(server.includes('["'+route+'"'));
});
