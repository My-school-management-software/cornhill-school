/* CORNHILL main Notification Centre action routing.
 * This module only builds destinations from trusted school notification metadata.
 * It never reads record data or bypasses the destination app's authentication/RLS.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CornhillNotificationRouting=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAIN_ORIGIN='https://cornhill-school-swart.vercel.app';
 const APP_HOSTS=new Set([
  'cornhill-school-swart.vercel.app',
  'admissions-cornhill-school.vercel.app',
  'parents-cornhill-school.vercel.app',
  'evidence-cornhill-school.vercel.app',
  'notifications-cornhill-school.vercel.app',
  'records-cornhill-school.vercel.app',
  'banking-cornhill-school.vercel.app',
  'school-website-cornhill-school.vercel.app',
  'staff-communications-cornhill-school.vercel.app',
  'hr-payroll-cornhill-school.vercel.app',
  'learning-cornhill-school.vercel.app',
  'library-cornhill-school.vercel.app',
  'transport-cornhill-school.vercel.app',
  'welfare-cornhill-school.vercel.app',
  'integrations-cornhill-school.vercel.app',
  'system-health-cornhill-school.vercel.app',
  'assets-maintenance-cornhill-school.vercel.app',
  'visitor-register-cornhill-school.vercel.app',
  'noticeboard-cornhill-school.vercel.app',
  'school-calendar-cornhill-school.vercel.app'
 ]);
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 function validId(value){return typeof value==='string'&&UUID.test(value)?value:null}
 function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
 function urlId(raw,key){
  if(typeof raw!=='string'||!raw)return null;
  try{return validId(new URL(raw,MAIN_ORIGIN).searchParams.get(key))}catch(_){return null}
 }
 function evidenceRoute(id){
  const url=new URL('/apps/evidence-capture/', 'https://evidence-cornhill-school.vercel.app');
  if(id)url.searchParams.set('requestId',id);
  return {kind:'navigate',href:url.href,recordType:'evidence_request',recordId:id};
 }
 function bankRoute(id){
  const url=new URL('/apps/banking/', 'https://banking-cornhill-school.vercel.app');
  if(id)url.searchParams.set('transactionId',id);
  url.hash='bankTransactions';
  return {kind:'navigate',href:url.href,recordType:'bank_transaction',recordId:id};
 }
 function resolve(notification,mainOrigin){
  const row=object(notification),payload=object(row.action_payload);
  const category=String(row.category||'').toLowerCase();
  const title=String(row.title||'').toLowerCase();
  const base=typeof mainOrigin==='string'&&mainOrigin?mainOrigin:MAIN_ORIGIN;
  if(category==='evidence_submission'||category==='evidence_received'){
   const id=validId(row.source_id)||validId(payload.request_id)||validId(payload.requestId)||urlId(payload.url,'requestId');
   return evidenceRoute(id);
  }
  if(category==='bank_transaction'){
   const id=validId(payload.bank_transaction_id)||validId(payload.transaction_id)||validId(row.source_id);
   return bankRoute(id);
  }
  if(category==='guardian_onboarding'||(title.includes('parent')&&title.includes('guardian')&&title.includes('onboarding'))){
   return {kind:'workspace',workspace:'parentAccess',targetId:'adminParentPortalDirectory',recordType:'guardian_onboarding'};
  }
  if(typeof payload.url==='string'&&payload.url.trim()){
   try{
    const url=new URL(payload.url,base),baseUrl=new URL(base);
    const sameOrigin=url.origin===baseUrl.origin;
    const safeLocalPaths=new Set(['/','/index.html','/school-services.html','/records.html','/admissions.html']);
    if(url.protocol==='https:'&&((sameOrigin&&safeLocalPaths.has(url.pathname))||(APP_HOSTS.has(url.hostname)&&url.pathname.startsWith('/apps/')))){
     return {kind:'navigate',href:url.href,recordType:'source_app'};
    }
   }catch(_){}
  }
  return null;
 }
 return {resolve,validId};
});
