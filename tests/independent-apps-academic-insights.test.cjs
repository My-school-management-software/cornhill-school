'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const apps=[
 ['school-management','index.html','manifest.webmanifest'],
 ['admissions','admissions.html','admissions.webmanifest'],
 ['parent-guardian','parents.html','parents.webmanifest'],
 ['evidence-capture','evidence.html','evidence.webmanifest'],
 ['notifications','notifications.html','notifications.webmanifest'],
 ['records','records.html','records.webmanifest'],
 ['banking','banking.html','banking.webmanifest'],
 ['school-website','school.html','school.webmanifest']
];
const serviceApps=[["hr-payroll","hr-payroll","hr-payroll.webmanifest","HR & Payroll Self-Service"],["learning-resources","learning","learning-resources.webmanifest","Learning Resources & Homework"],["school-library","library","school-library.webmanifest","Library Management"],["school-transport","transport","school-transport.webmanifest","School Transport"],["student-welfare","welfare","student-welfare.webmanifest","Student Welfare Office"],["provider-integrations","integrations","provider-integrations.webmanifest","Mobile Money & Messaging Setup"],["system-health","system-health","system-health.webmanifest","System Health & Recovery"],["asset-maintenance","facilities","asset-maintenance.webmanifest","School Assets & Maintenance"],["visitor-register","visitor-register","visitor-register.webmanifest","Visitor & Gate Register"],["notice-board","notices","notice-board.webmanifest","Staff Notice Board"],["school-calendar","calendar","school-calendar.webmanifest","School Calendar & Events"],["staff-communications","staff-feed","staff-communications.webmanifest","Staff Communication Feed"]];

test('every CORNHILL PWA has a distinct app id, start URL and scope',()=>{
 const ids=new Set(),scopes=new Set(),starts=new Set();
 for(const [slug,,manifestFile] of apps){
  const m=JSON.parse(fs.readFileSync(path.join(root,manifestFile),'utf8'));
  const expected='/apps/'+slug+'/';
  assert.equal(m.id,expected,manifestFile+' id');
  assert.equal(m.start_url,expected,manifestFile+' start URL');
  assert.equal(m.scope,expected,manifestFile+' scope');
  ids.add(m.id);scopes.add(m.scope);starts.add(m.start_url);
 }
 assert.equal(ids.size,apps.length);
 assert.equal(scopes.size,apps.length);
 assert.equal(starts.size,apps.length);
});

test('each install route and manifest route rewrites to its existing application page',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 const rewrites=config.rewrites||[];
 const get=(source)=>rewrites.find(x=>x.source===source)?.destination;
 for(const [slug,page,manifestFile] of apps){
  assert.equal(get('/apps/'+slug+'/'),'/'+page);
  assert.equal(get('/apps/'+slug),'/'+page);
  assert.equal(get('/apps/'+slug+'/manifest.webmanifest'),'/'+manifestFile);
 }
});

test('legacy communications page redirects to the isolated feed app',()=>{
 const html=fs.readFileSync(path.join(root,'school-communications.html'),'utf8');
 assert.match(html,/location\.replace\('\/apps\/staff-communications\/'\)/);
 assert.ok(fs.existsSync(path.join(root,'staff-communications.webmanifest')));
});

test('main and admissions workspaces load the shared roomy layout stylesheet',()=>{
 for(const file of ['index.html','admissions.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/\/assets\/cornhill-design-system\.css/);
 }
 const css=fs.readFileSync(path.join(root,'assets/cornhill-design-system.css'),'utf8');
 assert.match(css,/Roomier layouts across administrator/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/max-width:1680px/);
 assert.ok(css.includes('calc((100vw - 1680px)/2 + 14px)'));
 assert.ok(css.includes('width:calc(100% - 252px)'));
 assert.ok(css.includes('width:calc(100% - 214px)'));
 assert.ok(css.includes('flex:0 0 auto'));
});

test('administrator academic insights use class cards, full learner registers and a separate school overview',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes("panel?.classList.remove('hidden')"));
 assert.match(html,/data-class-insight/);
 assert.match(html,/adminAcademicClassDetail/);
 assert.match(html,/Open '\+esc\(cls\.name\)\+' performance/);
 assert.match(html,/assessment_scores/);
 assert.match(html,/\.range\(offset,offset\+pageSize-1\)/);
 assert.match(html,/Subject performance in /);
 assert.match(html,/All learners in /);
 assert.doesNotMatch(html,/ranked\.slice\(0,25\)/);
 assert.match(html,/General school academic overview/);
});

test('offline shell includes each standalone app entry and its own manifest route',()=>{
 const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
 assert.match(sw,/cornhill-shell-v80/);
 assert.match(sw,/cornhill-static-v80/);
 assert.match(sw,/app-isolation-guard\.js/);
 for(const [slug] of [...apps,...serviceApps.map(x=>[x[0]])]){
  assert.ok(sw.includes('/apps/'+slug+'/'));
  assert.ok(sw.includes('/apps/'+slug+'/manifest.webmanifest'));
 }
 assert.match(sw,/\/apps\/school-management\/'\,\s*'\/apps\/school-management/);
});

test('every former School Services feature has an independent route and manifest',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 const rewrites=config.rewrites||[];
 const get=source=>rewrites.find(x=>x.source===source)?.destination;
 const scopes=new Set(),starts=new Set(),ids=new Set();
 for(const [slug,key,manifestFile] of serviceApps){
  assert.equal(get('/apps/'+slug+'/'),'/school-services.html?workspace='+key);
  assert.equal(get('/apps/'+slug),'/school-services.html?workspace='+key);
  assert.equal(get('/apps/'+slug+'/manifest.webmanifest'),'/'+manifestFile);
  const m=JSON.parse(fs.readFileSync(path.join(root,manifestFile),'utf8'));
  assert.equal(m.start_url,'/apps/'+slug+'/');assert.equal(m.scope,'/apps/'+slug+'/');assert.equal(m.id,'/apps/'+slug+'/');
  scopes.add(m.scope);starts.add(m.start_url);ids.add(m.id);
 }
 assert.equal(scopes.size,serviceApps.length);assert.equal(starts.size,serviceApps.length);assert.equal(ids.size,serviceApps.length);
});
test('the combined School Services app is retired rather than linked from App Centre',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 assert.ok((config.redirects||[]).some(x=>x.source==='/apps/school-services/'&&x.destination==='https://cornhill-school-swart.vercel.app/apps/school-management/'));
 assert.ok(!(config.rewrites||[]).some(x=>x.source==='/apps/school-services/'));
});
test('scoped service views load only their own workspace and data loaders',()=>{
 const html=fs.readFileSync(path.join(root,'school-services.html'),'utf8');
 assert.match(html,/window\.CornhillServiceWorkspace/);assert.match(html,/workspace\.allowed/);
 assert.match(html,/case 'notices':jobs\.push\(loadStaffNotices\(\)\)/);
 assert.match(html,/case 'calendar':jobs\.push\(loadSchoolCalendar\(\)\)/);
 assert.match(html,/case 'staff-feed':jobs\.push\(loadStaffFeed\(\)\)/);
 assert.match(html,/case 'hr-payroll':jobs\.push\(loadLeave\(\),loadPayroll\(\)\)/);
 assert.match(html,/case 'system-health':jobs\.push\(runHealthCheck\(false\)\)/);
});
test('Notification Centre routes notifications to dedicated application origins',()=>{
 const html=fs.readFileSync(path.join(root,'notifications.html'),'utf8');
 for(const host of ['noticeboard-cornhill-school.vercel.app','school-calendar-cornhill-school.vercel.app','staff-communications-cornhill-school.vercel.app','hr-payroll-cornhill-school.vercel.app','system-health-cornhill-school.vercel.app'])assert.ok(html.includes(host),host+' destination');
 assert.match(html,/id="sourceApp"/);assert.match(html,/Open '\+esc\(source\.label\)/);
});

test('every application hostname is locked to its own installed-app route',()=>{
 const guard=fs.readFileSync(path.join(root,'assets/app-isolation-guard.js'),'utf8');
 const hosts=['admissions-cornhill-school.vercel.app','parents-cornhill-school.vercel.app','evidence-cornhill-school.vercel.app','notifications-cornhill-school.vercel.app','records-cornhill-school.vercel.app','banking-cornhill-school.vercel.app','school-website-cornhill-school.vercel.app','staff-communications-cornhill-school.vercel.app','hr-payroll-cornhill-school.vercel.app','learning-cornhill-school.vercel.app','library-cornhill-school.vercel.app','transport-cornhill-school.vercel.app','welfare-cornhill-school.vercel.app','integrations-cornhill-school.vercel.app','system-health-cornhill-school.vercel.app','assets-maintenance-cornhill-school.vercel.app','visitor-register-cornhill-school.vercel.app','noticeboard-cornhill-school.vercel.app','school-calendar-cornhill-school.vercel.app'];
 for(const host of hosts)assert.ok(guard.includes(host),host);
 for(const file of ['index.html','admissions.html','parents.html','evidence.html','records.html','banking.html','school.html','notifications.html','school-services.html','school-communications.html'])assert.match(fs.readFileSync(path.join(root,file),'utf8'),/app-isolation-guard\.js/);
});


test('administrator class workspace detail includes every learner in the selected class, not a school-wide mixed list',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes("const activeLearners=(students||[]).filter(x=>x.status==='Active')"));
 assert.ok(html.includes("const members=activeLearners.filter(x=>x.class_id===cls.id)"));
 assert.match(html,/All learners in /);
 assert.match(html,/data-class-insight/);
});
test('administrator teacher marks register requires an explicit class and term and does not preload school-wide marks',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/id="adminTeacherMarksClass"/);
 assert.match(html,/id="adminTeacherMarksTerm"/);
 assert.ok(html.includes("Choose one valid class and one academic term before loading marks."));
 assert.match(html,/\\.eq\\('term_id',termId\\)\\.eq\\('class_id',classId\\)/);
 assert.match(html,/Other classes are not included/);
 assert.match(html,/Promise\\.resolve\\(\\{data:\\[\\],error:null\\}\\)/);
 assert.doesNotMatch(html,/profile\\?\\.role==='Admin'\\?loadAllTeacherMarksRegister\\(\\)/);
});
