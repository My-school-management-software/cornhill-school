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
 ['school-services','school-services.html','school-services.webmanifest'],
 ['staff-communications','school-communications.html','staff-communications.webmanifest'],
 ['school-website','school.html','school.webmanifest']
];

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

test('the dedicated communications app no longer reuses School Services identity',()=>{
 const html=fs.readFileSync(path.join(root,'school-communications.html'),'utf8');
 assert.match(html,/href=["']\/staff-communications\.webmanifest["']/);
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

test('administrator academic insights show class-by-class subject and learner details from paged records',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/insightPanel\?\.classList\.remove\('hidden'\)/);
 assert.match(html,/data-class-insight/);
 assert.match(html,/adminAcademicClassDetail/);
 assert.match(html,/View class details/);
 assert.match(html,/assessment_scores/);
 assert.match(html,/\.range\(offset,offset\+pageSize-1\)/);
 assert.match(html,/Subject performance/);
 assert.match(html,/Learner performance/);
});

test('offline shell includes each standalone app entry and its own manifest route',()=>{
 const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
 assert.match(sw,/cornhill-shell-v76/);
 assert.match(sw,/cornhill-static-v76/);
 for(const [slug] of apps){
  assert.ok(sw.includes('/apps/'+slug+'/'));
  assert.ok(sw.includes('/apps/'+slug+'/manifest.webmanifest'));
 }
 assert.match(sw,/\/apps\/school-management\/'\,\s*'\/apps\/school-management/);
});
