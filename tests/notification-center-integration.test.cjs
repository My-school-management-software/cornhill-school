'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const apps=[
 ['hr-payroll','hr-payroll.webmanifest','hr-payroll-cornhill-school.vercel.app'],
 ['learning-resources','learning-resources.webmanifest','learning-cornhill-school.vercel.app'],
 ['school-library','school-library.webmanifest','library-cornhill-school.vercel.app'],
 ['school-transport','school-transport.webmanifest','transport-cornhill-school.vercel.app'],
 ['student-welfare','student-welfare.webmanifest','welfare-cornhill-school.vercel.app'],
 ['provider-integrations','provider-integrations.webmanifest','integrations-cornhill-school.vercel.app'],
 ['system-health','system-health.webmanifest','system-health-cornhill-school.vercel.app'],
 ['asset-maintenance','asset-maintenance.webmanifest','assets-maintenance-cornhill-school.vercel.app'],
 ['visitor-register','visitor-register.webmanifest','visitor-register-cornhill-school.vercel.app'],
 ['notice-board','notice-board.webmanifest','noticeboard-cornhill-school.vercel.app'],
 ['school-calendar','school-calendar.webmanifest','school-calendar-cornhill-school.vercel.app'],
 ['staff-communications','staff-communications.webmanifest','staff-communications-cornhill-school.vercel.app']
];

test('service apps have unique, path-scoped manifests and host guard routes',()=>{
 const guard=read('assets/app-isolation-guard.js');
 const seen=new Set();
 for(const [slug,file,host] of apps){
  const manifest=JSON.parse(read(file));
  assert.equal(manifest.id,'/apps/'+slug+'/',file+' id');
  assert.equal(manifest.start_url,'/apps/'+slug+'/',file+' start URL');
  assert.equal(manifest.scope,'/apps/'+slug+'/',file+' scope');
  assert.ok(guard.includes(host),host+' must be mapped');
  assert.ok(guard.includes('/apps/'+slug+'/'),slug+' must have its own app path');
  assert.ok(!seen.has(host),'hostnames must be unique');
  seen.add(host);
 }
 assert.equal(seen.size,apps.length);
});

test('main dashboard also loads the hostname guard before dashboard scripts',()=>{
 const html=read('index.html');
 const guard=html.indexOf('/assets/app-isolation-guard.js');
 const client=html.indexOf('supabase-js');
 assert.ok(guard>=0,'main dashboard must load the guard');
 assert.ok(guard<client,'guard runs before dashboard scripts');
});

test('the legacy School Services container is disabled and redirects to the main app',()=>{
 const sql=read('supabase/migrations/20261110200000_deactivate_combined_school_services_portal.sql');
 const vercel=JSON.parse(read('vercel.json'));
 assert.match(sql,/school-services-hub/);
 assert.match(sql,/is_active\s*=\s*false/i);
 assert.ok(vercel.redirects.some(x=>x.source==='/apps/school-services/'&&x.destination.includes('/apps/school-management/')));
 const html=read('school-services.html');
 assert.ok(html.includes('CornhillServiceWorkspace'));
 assert.ok(html.includes('switch(workspace.key)'));
 assert.ok(html.includes('servicePortalOverviewPanel'));
});

test('the Notification Centre maps notices to their source apps and supports application filtering',()=>{
 const html=read('notifications.html');
 assert.ok(html.includes('function notificationSource(r)'));
 assert.ok(html.includes('id="sourceApp"'));
 assert.ok(html.includes('data-open='));
 assert.ok(html.includes('Open '+"'+esc(source.label)+'"));
 for(const [, , host] of apps)assert.ok(html.includes(host),host+' source route');
});

test('learning, library and transport changes create notifications with app links',()=>{
 const sql=read('supabase/migrations/20261109212546_notify_learning_library_transport_app_events.sql');
 for(const trigger of ['school_learning_resource_notification','school_library_loan_notification','school_transport_assignment_notification'])assert.ok(sql.includes(trigger),trigger);
 for(const host of ['learning-cornhill-school.vercel.app','library-cornhill-school.vercel.app','transport-cornhill-school.vercel.app'])assert.ok(sql.includes(host),host);
 assert.ok(sql.includes('class_teacher_access'));
 assert.ok(sql.includes('learning_resource'));
 assert.ok(sql.includes('library_loan'));
 assert.ok(sql.includes('transport_assignment'));
});
