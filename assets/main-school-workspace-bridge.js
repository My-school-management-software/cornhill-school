/* CORNHILL shared-workspace bridge.
   The main school database remains the source of truth. This script adds dashboard
   entry points and mirrors role-permitted notices/calendar; it never copies learner
   or finance records into a second dataset. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const escapeHtml=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let enquiryRows=[];
 let noticeRows=[],calendarRows=[];
 let bridgeReady=false;
 function buildDashboardPanels(){
  const dashboard=$('dashboard'),intro=dashboard?.querySelector('.dashboard-intro');
  if(!dashboard||!intro)return;
  if(!$('dashboardWorkspacePanel')){
   const panel=document.createElement('section');panel.id='dashboardWorkspacePanel';panel.className='panel';panel.style.margin='12px 0 16px';
   panel.innerHTML='<div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><span class="dashboard-eyebrow">CONNECTED SCHOOL WORKSPACES</span><h3 style="margin:4px 0">My school applications</h3><p class="muted" style="margin:0">Open only the workspaces assigned to your account. They use the same CORNHILL records and role permissions.</p></div><button type="button" id="dashboardAllApps" class="primary">View App Centre</button></div><div id="dashboardWorkspaceLinks" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;margin-top:12px"><div class="empty">Loading your assigned workspaces…</div></div><small class="muted">Administrator-shared links still require the user to sign in with an assigned school account.</small>';
   intro.insertAdjacentElement('afterend',panel);
  }
  if(profile?.role==='Admin'&&!$('dashboardAdmissionEnquiriesPanel')){
   const panel=document.createElement('section');panel.id='dashboardAdmissionEnquiriesPanel';panel.className='panel';panel.style.margin='12px 0 16px';
   panel.innerHTML='<div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><span class="dashboard-eyebrow">CENTRAL ADMISSIONS QUEUE</span><h3 style="margin:4px 0">Public enquiries → learner register</h3><p class="muted" style="margin:0">Enquiries are received once and linked to the learner record when formal admission is completed here.</p></div><div class="row" style="gap:8px;flex-wrap:wrap"><a class="button" href="/admissions.html" target="_blank" rel="noopener noreferrer">Public enquiry form ↗</a><button type="button" id="dashboardRefreshEnquiries">Refresh queue</button></div></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px;margin:12px 0"><div class="stat"><small>Total enquiries</small><div id="dashboardAdmissionTotal" class="num">—</div></div><div class="stat"><small>Awaiting review</small><div id="dashboardAdmissionPending" class="num">—</div></div><div class="stat"><small>Approved, not registered</small><div id="dashboardAdmissionApproved" class="num">—</div></div><div class="stat"><small>Linked to learners</small><div id="dashboardAdmissionRegistered" class="num">—</div></div></div><div class="notice">An enquiry is not yet an admitted learner. Verify gender, birth details, Ministry LIN, class, bursary and fee information before saving the learner record. Missing information is never guessed.</div><p id="dashboardAdmissionQueueStatus" class="muted" role="status">Loading central admission queue…</p><div class="table-wrap"><table><thead><tr><th>Enquiry / class</th><th>Parent or guardian</th><th>Message / preference</th><th>Review status</th><th>Administrator action</th></tr></thead><tbody id="dashboardAdmissionEnquiryRows"><tr><td colspan="5">Loading…</td></tr></tbody></table></div>';
   const identity=$('learnerIdentityQualityPanel');(identity||panel).insertAdjacentElement('afterend',panel);
  }
  const comm=$('communication'),feed=$('staffCommunicationFeed');
  if(comm&&feed&&!$('mainStaffCalendarWorkspace')){
   const panel=document.createElement('div');panel.id='mainStaffCalendarWorkspace';panel.className='grid';panel.style.cssText='grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:16px';
   panel.innerHTML='<section class="panel" style="margin:0"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><span class="dashboard-eyebrow">CENTRAL STAFF NOTICE BOARD</span><h3 style="margin:4px 0">School notices</h3></div><button type="button" id="refreshMainStaffNotices">Refresh</button></div><div id="mainStaffNoticeRows"><p class="muted">Loading shared notices…</p></div><a class="button" href="/school-services.html#notices">Notice administration ↗</a></section><section class="panel" style="margin:0"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><span class="dashboard-eyebrow">CENTRAL SCHOOL CALENDAR</span><h3 style="margin:4px 0">Upcoming events</h3></div><button type="button" id="refreshMainCalendar">Refresh</button></div><div id="mainCalendarRows"><p class="muted">Loading shared events…</p></div><a class="button" href="/school-services.html#calendar">Calendar administration ↗</a></section>';
   feed.insertAdjacentElement('afterend',panel);
  }
  $('dashboardAllApps')?.addEventListener('click',()=>tab('appCentre'),{once:true});
  $('dashboardRefreshEnquiries')?.addEventListener('click',loadDashboardAdmissionEnquiries);
  $('refreshMainStaffNotices')?.addEventListener('click',loadMainStaffNotices);
  $('refreshMainCalendar')?.addEventListener('click',loadMainCalendarEvents);
 }
 function appCard(app){
  const url=escapeHtml(app.app_url),name=escapeHtml(app.name),icon=escapeHtml(app.icon||'📱'),description=escapeHtml(app.description||'CORNHILL workspace');
  const type=app.app_kind==='External'?'External secure link':'CORNHILL workspace';
  const share=profile?.role==='Admin'?'<button type="button" data-share-workspace="'+escapeHtml(app.id)+'" style="width:100%;margin-top:6px">Share access link</button>':'';
  return '<div class="app-centre-launch" style="min-width:0"><a class="app-centre-card" href="'+url+'" target="_blank" rel="noopener noreferrer"><div class="app-centre-card-head"><span class="app-centre-icon" aria-hidden="true">'+icon+'</span><strong>'+name+'</strong></div><p>'+description+'</p><em>Open application ↗</em><span class="muted" style="font-size:10px">'+type+'</span></a>'+share+'</div>';
 }
 function updateWorkspaceCards(){
  if(!Array.isArray(appCentreRows))return;
  const cards=appCentreRows.map(appCard).join('');
  const centre=$('appCentreCards'),home=$('dashboardWorkspaceLinks');
  if(centre&&appCentreRows.length)centre.innerHTML=cards;
  if(home)home.innerHTML=cards||'<div class="empty">No additional workspaces are assigned to this account.</div>';
 }
 async function loadDashboardAdmissionEnquiries(){
  const panel=$('dashboardAdmissionEnquiriesPanel'),host=$('dashboardAdmissionEnquiryRows'),status=$('dashboardAdmissionQueueStatus');
  if(!panel||!host)return;
  if(profile?.role!=='Admin'||!currentUserId||demoMode){panel.classList.add('hidden');return}
  panel.classList.remove('hidden');
  const owner=currentUserId,generation=window.cornhillSessionGeneration||0;
  const current=()=>owner===currentUserId&&generation===(window.cornhillSessionGeneration||0)&&profile?.role==='Admin';
  if(status)status.textContent='Loading the central enquiry register…';
  const {data,error}=await db.from('school_admission_enquiries').select('id,learner_name,class_applied,guardian_name,guardian_phone,guardian_email,contact_preference,message,status,review_note,created_at,student_id,registered_at').order('created_at',{ascending:false}).limit(200);
  if(!current())return;
  if(error){host.innerHTML='<tr><td colspan="5">Admission enquiries could not load: '+escapeHtml(error.message)+'</td></tr>';if(status)status.textContent='The main admission queue could not be refreshed.';return}
  enquiryRows=data||[];
  const rows=enquiryRows;
  $('dashboardAdmissionTotal').textContent=String(rows.length);
  $('dashboardAdmissionPending').textContent=String(rows.filter(x=>x.status==='Pending').length);
  $('dashboardAdmissionApproved').textContent=String(rows.filter(x=>x.status==='Approved for admission'&&!x.student_id).length);
  $('dashboardAdmissionRegistered').textContent=String(rows.filter(x=>!!x.student_id).length);
  if(status)status.textContent=rows.length+' shared enquiry records · latest '+Math.min(rows.length,20)+' shown.';
  host.innerHTML=rows.slice(0,20).map(row=>{
   const registered=!!row.student_id;
   const states=registered?['Registered']:['Pending','Contacted','Visit scheduled','Approved for admission','Not proceeding','Closed'];
   const options=states.map(value=>'<option '+(row.status===value?'selected':'')+'>'+value+'</option>').join('');
   const action=registered?'<span class="badge">Linked to learner record</span>':'<button type="button" class="primary" data-enquiry-start="'+escapeHtml(row.id)+'">Start learner registration</button>';
   return '<tr><td><strong>'+escapeHtml(row.learner_name)+'</strong><br><small>'+escapeHtml(row.class_applied)+' · '+escapeHtml(new Date(row.created_at).toLocaleDateString('en-UG',{timeZone:'Africa/Kampala'}))+'</small>'+(registered?'<br><small class="muted">Registered '+escapeHtml(row.registered_at?new Date(row.registered_at).toLocaleDateString('en-UG',{timeZone:'Africa/Kampala'}):'')+'</small>':'')+'</td><td>'+escapeHtml(row.guardian_name)+'<br><a href="tel:'+escapeHtml(row.guardian_phone)+'">'+escapeHtml(row.guardian_phone)+'</a>'+(row.guardian_email?'<br><a href="mailto:'+escapeHtml(row.guardian_email)+'">'+escapeHtml(row.guardian_email)+'</a>':'')+'</td><td>'+escapeHtml(row.message||'No additional message')+'<br><small class="muted">Preferred contact: '+escapeHtml(row.contact_preference)+'</small></td><td><select data-enquiry-status="'+escapeHtml(row.id)+'" '+(registered?'disabled':'')+'>'+options+'</select><textarea data-enquiry-note="'+escapeHtml(row.id)+'" maxlength="1200" rows="2" placeholder="Administrator review note" '+(registered?'disabled':'')+'>'+escapeHtml(row.review_note||'')+'</textarea></td><td>'+action+(registered?'':'<button type="button" data-enquiry-save="'+escapeHtml(row.id)+'">Save review</button>')+'</td></tr>';
  }).join('')||'<tr><td colspan="5" class="empty">No public admission enquiries have been received.</td></tr>';
  if(new URLSearchParams(location.search).get('workspace')==='admissions')requestAnimationFrame(()=>panel.scrollIntoView({behavior:'instant',block:'start'}));
 }
 async function startLearnerAdmissionFromEnquiry(id){
  if(profile?.role!=='Admin')return;
  const row=enquiryRows.find(x=>x.id===id);if(!row||row.student_id)return;
  const form=$('studentForm');if(!form)return;
  const hasDraft=[...form.elements].some(el=>el.name&&['text','email','tel','number','date'].includes(el.type)&&String(el.value||'').trim());
  if(hasDraft&&!confirm('Replace the current learner admission form with the selected enquiry details? Unsaved form entries will be lost.'))return;
  form.reset();clearAdmissionMatches();
  const parts=String(row.learner_name||'').trim().split(/\s+/).filter(Boolean);
  form.elements.first_name.value=parts.shift()||'';
  form.elements.last_name.value=parts.length?parts.pop():'';
  form.elements.middle_name.value=parts.join(' ');
  form.elements.guardian_name.value=row.guardian_name||'';
  form.elements.guardian_phone.value=row.guardian_phone||'';
  form.elements.guardian_email.value=row.guardian_email||'';
  const norm=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const matched=(classes||[]).find(c=>norm(c.name)===norm(row.class_applied));
  form.elements.class_id.value=matched?.id||'';
  form.elements.gender.value='';form.elements.birth_year.value='';form.elements.date_of_birth.value='';
  form.elements.lin.value='';form.elements.p7_index_number.value='';
  form.elements.guardian_sms_opt_in.checked=false;form.elements.guardian_whatsapp_opt_in.checked=false;form.elements.guardian_whatsapp_phone.value='';
  window.pendingSchoolAdmissionEnquiry={id:row.id};
  $('studentFormTitle').textContent='Complete admission from public enquiry';
  const banner=document.getElementById('admissionEnquiryPrefillNote')||document.createElement('div');
  banner.id='admissionEnquiryPrefillNote';banner.className='notice full';
  banner.textContent='Source enquiry: '+row.learner_name+' · requested class: '+row.class_applied+' · guardian: '+row.guardian_name+' · '+row.guardian_phone+'. Contact preference: '+row.contact_preference+'. Verify missing identity, LIN and fee details. No missing details have been guessed.';
  form.prepend(banner);
  form.querySelector('button[type="submit"]').textContent='Register learner and link enquiry';
  syncBoardingMealControls();syncBursaryAdmissionFields();tab('register');scheduleAdmissionMatchSearch();
 }
 async function reviewAdmissionEnquiry(id){
  if(profile?.role!=='Admin'||!currentUserId)return;
  const host=$('dashboardAdmissionEnquiryRows');
  const select=host?.querySelector('[data-enquiry-status="'+CSS.escape(id)+'"]'),note=host?.querySelector('[data-enquiry-note="'+CSS.escape(id)+'"]');
  if(!select||!note)return;
  const row=enquiryRows.find(x=>x.id===id);if(!row||row.student_id)return;
  const {error}=await db.from('school_admission_enquiries').update({status:select.value,review_note:note.value.trim()||null,reviewed_by:currentUserId,reviewed_at:new Date().toISOString()}).eq('id',id).is('student_id',null);
  if(error){message('appMsg','Admission review was not saved: '+error.message,true);return}
  await loadDashboardAdmissionEnquiries();
  message('appMsg','Admission review saved in the central enquiry register.','success');
 }
 async function loadMainStaffNotices(){
  const host=$('mainStaffNoticeRows');if(!host)return;
  if(!currentUserId||!profile||demoMode){host.innerHTML='<p class="muted">Sign in to view notices.</p>';return}
  const owner=currentUserId,generation=window.cornhillSessionGeneration||0;
  const {data,error}=await db.from('school_staff_notices').select('id,title,body,category,priority,publish_at,expires_at').eq('is_published',true).order('publish_at',{ascending:false}).limit(60);
  if(owner!==currentUserId||generation!==(window.cornhillSessionGeneration||0))return;
  if(error){host.innerHTML='<div class="notice error">'+escapeHtml(error.message)+'</div>';return}
  const now=Date.now(),rows=(data||[]).filter(row=>new Date(row.publish_at).getTime()<=now&&(!row.expires_at||new Date(row.expires_at).getTime()>=now));
  noticeRows=rows;
  host.innerHTML=rows.slice(0,10).map(row=>'<article style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row" style="justify-content:space-between;gap:8px"><strong>'+escapeHtml(row.title)+'</strong><span class="badge">'+escapeHtml(row.priority)+'</span></div><small class="muted">'+escapeHtml(row.category)+' · '+escapeHtml(new Date(row.publish_at).toLocaleString('en-UG',{timeZone:'Africa/Kampala'}))+'</small><p style="white-space:pre-wrap;margin:7px 0">'+escapeHtml(row.body)+'</p></article>').join('')||'<p class="muted">No active notices are published for your staff role.</p>';
 }
 async function loadMainCalendarEvents(){
  const host=$('mainCalendarRows');if(!host)return;
  if(!currentUserId||!profile||demoMode){host.innerHTML='<p class="muted">Sign in to view the calendar.</p>';return}
  const owner=currentUserId,generation=window.cornhillSessionGeneration||0,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala'}).format(new Date());
  const {data,error}=await db.from('school_calendar_events').select('id,title,description,event_date,start_time,end_time,venue').eq('is_published',true).gte('event_date',today).order('event_date',{ascending:true}).limit(60);
  if(owner!==currentUserId||generation!==(window.cornhillSessionGeneration||0))return;
  if(error){host.innerHTML='<div class="notice error">'+escapeHtml(error.message)+'</div>';return}
  calendarRows=data||[];
  host.innerHTML=calendarRows.slice(0,10).map(row=>'<article style="padding:10px 0;border-bottom:1px solid var(--line)"><strong>'+escapeHtml(row.title)+'</strong><p class="muted" style="margin:5px 0">'+escapeHtml(new Date(row.event_date+'T12:00:00+03:00').toLocaleDateString('en-UG',{timeZone:'Africa/Kampala'}))+(row.start_time?' · '+escapeHtml(String(row.start_time).slice(0,5)):'')+(row.venue?' · '+escapeHtml(row.venue):'')+'</p>'+(row.description?'<p>'+escapeHtml(row.description)+'</p>':'')+'</article>').join('')||'<p class="muted">No upcoming events are published for your role.</p>';
 }
 function routeRequestedWorkspace(){
  const key=new URLSearchParams(location.search).get('workspace');if(!key)return;
  const map={attendance:'attendance',communications:'communication',communication:'communication',notices:'communication',calendar:'communication',finance:'finance',apps:'appCentre',appcentre:'appCentre',register:'register'};
  if(key==='admissions'){
   if(profile?.role==='Admin')setTimeout(()=>{loadDashboardAdmissionEnquiries();$('dashboardAdmissionEnquiriesPanel')?.scrollIntoView({behavior:'instant',block:'start'})},40);
   return;
  }
  const target=map[key];
  if(target&&typeof originalTab==='function'){
   originalTab(target);
   if(target==='communication'){loadMainStaffNotices();loadMainCalendarEvents();}
  }
 }
 function openSharedWorkspaceLink(app){
  const link=new URL(app.app_url,location.origin).href;
  if(navigator.share){navigator.share({title:'CORNHILL · '+app.name,text:'Open this assigned school workspace. Sign-in and permissions still apply.',url:link}).catch(()=>{});}
  else if(navigator.clipboard?.writeText){navigator.clipboard.writeText(link).then(()=>message('appMsg','Access link copied. Share it only with the assigned staff member.')).catch(()=>message('appMsg','Copy unavailable. Open the workspace and copy its address.',true));}
  else message('appMsg','Open the workspace and copy the address bar to share it securely.',true);
 }
 document.addEventListener('click',event=>{
  const share=event.target.closest('[data-share-workspace]');
  if(share&&profile?.role==='Admin'){const app=appCentreRows.find(x=>x.id===share.dataset.shareWorkspace);if(app)openSharedWorkspaceLink(app);return}
  const start=event.target.closest('[data-enquiry-start]');
  if(start){startLearnerAdmissionFromEnquiry(start.dataset.enquiryStart);return}
  const review=event.target.closest('[data-enquiry-save]');
  if(review)reviewAdmissionEnquiry(review.dataset.enquirySave);
 });
 const originalRenderAppCentre=renderAppCentre;
 renderAppCentre=function(){originalRenderAppCentre();updateWorkspaceCards()};
 const originalTab=tab;
 tab=function(name){
  originalTab(name);
  if(name==='dashboard'){
   buildDashboardPanels();
   loadAppCentre();
   loadDashboardAdmissionEnquiries();
   routeRequestedWorkspace();
  }
  if(name==='communication'){buildDashboardPanels();loadMainStaffNotices();loadMainCalendarEvents()}
 };
  function setupMainInstallButton(){
   const host=document.querySelector('header.top .row');
   if(!host||$('installMainApp'))return;
   const button=document.createElement('button');
   button.type='button';button.id='installMainApp';button.textContent='Install CORNHILL';
   button.title='Install CORNHILL as an app on this device';
   button.setAttribute('aria-label','Install CORNHILL');
   button.style.cssText='display:none;background:#fff;color:#14532d;border:0;border-radius:9px;padding:10px 13px;font-weight:800;cursor:pointer';
   host.insertBefore(button,host.firstChild);
   let installEvent=null;
   window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;button.style.display='inline-flex'});
   button.addEventListener('click',async()=>{
    if(!installEvent)return;
    const prompt=installEvent;installEvent=null;
    try{prompt.prompt();await prompt.userChoice}catch(_){}
    button.style.display='none';
   });
   window.addEventListener('appinstalled',()=>{button.style.display='none'});
  }
 function start(){if(bridgeReady)return;bridgeReady=true;setupMainInstallButton();buildDashboardPanels();updateWorkspaceCards();routeRequestedWorkspace();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();