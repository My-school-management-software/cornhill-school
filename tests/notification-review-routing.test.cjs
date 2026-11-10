'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const routing=require('../assets/cornhill-notification-routing.js');
const evidenceId='df7feaf0-dee3-49d5-9ce1-3f8ada1bd704';
const bankId='af50e54b-b3f2-49a0-a804-4b65659a7f28';

test('evidence submissions open the isolated Evidence Capture app at the matching request',()=>{
 const route=routing.resolve({category:'evidence_submission',source_id:evidenceId,action_payload:{url:'/evidence.html?requestId='+evidenceId}});
 const url=new URL(route.href);
 assert.equal(route.kind,'navigate');
 assert.equal(url.hostname,'evidence-cornhill-school.vercel.app');
 assert.equal(url.pathname,'/apps/evidence-capture/');
 assert.equal(url.searchParams.get('requestId'),evidenceId);
});

test('bank transaction reminders open Banking at the matching transaction row',()=>{
 const route=routing.resolve({category:'bank_transaction',source_id:bankId,action_payload:{workspace:'finance',target_id:'bankTransactions',bank_transaction_id:bankId}});
 const url=new URL(route.href);
 assert.equal(route.kind,'navigate');
 assert.equal(url.hostname,'banking-cornhill-school.vercel.app');
 assert.equal(url.pathname,'/apps/banking/');
 assert.equal(url.searchParams.get('transactionId'),bankId);
 assert.equal(url.hash,'#bankTransactions');
});

test('guardian onboarding opens the administrator access register, not the private parent portal sign-in',()=>{
 const route=routing.resolve({category:'guardian_onboarding',title:'Complete Parent and Guardian Portal onboarding',action_payload:{url:'/parents.html',workspace:'reports',target_id:'parentPortal'}});
 assert.deepEqual(route,{kind:'workspace',workspace:'parentAccess',targetId:'adminParentPortalDirectory',recordType:'guardian_onboarding'});
});

test('official CORNHILL app links are accepted and untrusted destinations are rejected',()=>{
 const safe=routing.resolve({category:'staff_notice',action_payload:{url:'https://noticeboard-cornhill-school.vercel.app/apps/notice-board/#notices'}});
 assert.equal(new URL(safe.href).hostname,'noticeboard-cornhill-school.vercel.app');
 assert.equal(routing.resolve({category:'other',action_payload:{url:'https://attacker.example/phish'}}),null);
});

test('invalid record IDs are not copied into evidence or banking deep links',()=>{
 const evidence=new URL(routing.resolve({category:'evidence_submission',source_id:'invalid',action_payload:{}}).href);
 const bank=new URL(routing.resolve({category:'bank_transaction',source_id:'invalid',action_payload:{}}).href);
 assert.equal(evidence.searchParams.has('requestId'),false);
 assert.equal(bank.searchParams.has('transactionId'),false);
});
