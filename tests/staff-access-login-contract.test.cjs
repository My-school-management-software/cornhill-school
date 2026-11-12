const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/staff-access-code/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261112020000_individual_staff_access_codes.sql'), 'utf8');

const dashboard = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('main dashboard exposes separate named leadership and bursar sign-in choices', () => {
  for (const role of ['Headteacher','Deputy Headteacher','DOS','Main Bursar','Deputy Bursar','Other Staff']) {
    assert.ok(dashboard.includes('data-school-staff-role="' + role + '"'), 'Missing main dashboard account choice: ' + role);
  }
  assert.ok(dashboard.includes('School administrator sign in'));
  assert.ok(!dashboard.includes('Use the individual email and password issued by the Director.'));
});

test('main dashboard checks each selected school-office role after authentication', () => {
  for (const role of ['Headteacher','Deputy Headteacher','DOS','Main Bursar','Deputy Bursar']) {
    assert.ok(dashboard.includes(role), 'Missing role matcher for ' + role);
  }
  assert.ok(dashboard.includes('schoolStaffRoleMatches'));
  assert.ok(dashboard.includes("account?.role==='Staff'"));
  assert.ok(dashboard.includes("sessionStorage.setItem('cornhill_login_mode','Staff')"));
});

test('main dashboard uses the protected individual-code endpoint for teachers and academic leaders', () => {
  assert.ok(dashboard.includes("db.functions.invoke('staff-access-code'"));
  assert.ok(dashboard.includes("role_key:'Teacher'"));
  assert.ok(dashboard.includes("role_key:selectedSchoolStaffRole"));
  assert.ok(dashboard.includes("db.auth.setSession"));
  assert.ok(dashboard.includes("teacher_list_my_assignments"));
});

test('existing Director main account and class assignment sign-in remain separate', () => {
  assert.ok(dashboard.includes("authenticateAccount($('adminEmail').value.trim(),$('adminPassword').value,'Admin'"));
  assert.ok(dashboard.includes("$('adminSignIn')"));
  assert.ok(dashboard.includes("if(mode==='Admin'&&account.role!=='Admin')"));
  assert.ok(dashboard.includes("if(mode==='Teacher')"));
  assert.ok(dashboard.includes("cornhill_teacher_class_id"));
});

test('main and services login pages share role-specific authentication rules', () => {
  assert.ok(html.includes("validateSelectedLoginRole"));
  assert.ok(dashboard.includes("schoolStaffRoleMatches"));
  assert.ok(dashboard.includes("staff-access-code"));
  assert.ok(edge.includes("verifyTarget"));
});


test('login choices are separate and named by role', () => {
  for (const role of ['Teacher','Headteacher','Deputy Headteacher','DOS','Main Bursar','Deputy Bursar','Other Staff','Director']) {
    assert.ok(html.includes('data-login-role="' + role + '"'), 'Missing role choice: ' + role);
  }
});

test('email login validates the selected account role and job title', () => {
  assert.ok(html.includes('validateSelectedLoginRole'));
  assert.ok(html.includes("p?.role"));
  assert.ok(/school bursar|main bursar/i.test(html));
  assert.ok(/deputy school bursar|deputy bursar/i.test(html));
});

test('personal code login is server-side and does not query access-code records in browser', () => {
  assert.ok(html.includes('staff-access-code'));
  assert.ok(html.includes('db.auth.setSession'));
  assert.ok(!/from\(['"]staff_access_codes['"]\)/.test(html));
  assert.ok(edge.includes('crypto.subtle.sign'));
  assert.ok(edge.includes('signInWithPassword'));
  assert.ok(edge.includes('consume_staff_access_code_attempt'));
  assert.ok(edge.includes('getUserById'));
});

test('only the active Director can issue or revoke a staff code', () => {
  assert.ok(edge.includes('actor?.role !== "Admin"'));
  assert.ok(edge.includes('action === "issue" || action === "revoke"'));
  assert.ok(edge.includes('staff_access_code_audit'));
  assert.ok(/enable row level security/i.test(migration));
  assert.ok(/security invoker/i.test(migration));
  assert.ok(!/security definer/i.test(migration));
  assert.ok(/grant execute on function public\.consume_staff_access_code_attempt[\s\S]*service_role/i.test(migration));
});

test('Director remains Admin-only and no new Director role is created', () => {
  assert.ok(html.includes("if(role==='Director')return admin"));
  assert.ok(html.includes("admin=p?.role==='Admin'"));
  assert.ok(edge.includes('profile.role !== "Staff"'));
});

test('Director code manager sends the selected staff identity and exact role to the server', () => {
  assert.ok(html.includes('option.dataset.roleKey=roleKey'));
  assert.ok(html.includes('role_key:roleKey'));
  assert.ok(html.includes("roleKey='Deputy Headteacher'"));
  assert.ok(html.includes("roleKey='Headteacher'"));
  assert.ok(html.includes("roleKey='DOS'"));
});

test('access-code issue, revoke and use actions check their audit writes', () => {
  assert.match(edge, /revokeAuditError/);
  assert.match(edge, /issueAuditError/);
  assert.match(edge, /loginAuditError/);
  assert.match(edge, /No active code was left in place/);
});

test('staff login rate limiting cannot be reset by changing the browser user-agent', () => {
  assert.ok(edge.includes('cornhill-login-rate-v1:" + forwarded'));
  assert.ok(!edge.includes('const userAgent ='));
  assert.ok(!edge.includes('req.headers.get("user-agent")'));
  assert.ok(!edge.includes("req.headers.get('user-agent')"));
});

test('leadership credential methods match the agreed account model', () => {
  const config = dashboard.slice(dashboard.indexOf('const SCHOOL_STAFF_LOGIN_TYPES'), dashboard.indexOf('let selectedSchoolStaffRole'));
  assert.match(config, /Headteacher:[\s\S]*mode:'code',modes:\['code'\]/);
  assert.match(config, /'Deputy Headteacher':[\s\S]*mode:'code',modes:\['code'\]/);
  assert.match(config, /DOS:[\s\S]*mode:'code',modes:\['code','email'\]/);
  assert.match(config, /'Main Bursar':[\s\S]*mode:'email',modes:\['email'\]/);
  assert.match(config, /'Deputy Bursar':[\s\S]*mode:'email',modes:\['email'\]/);
});

test('a role tile is not treated as authentication or permission by itself', () => {
  const flow = dashboard.slice(dashboard.indexOf('async function authenticateSchoolStaffRole'), dashboard.indexOf("document.querySelectorAll('[data-school-staff-role]'"));
  assert.match(flow, /db\.auth\.signInWithPassword/);
  assert.match(flow, /db\.functions\.invoke\('staff-access-code'/);
  assert.match(flow, /user_profiles/);
  assert.match(flow, /schoolStaffRoleMatches\(account,selectedSchoolStaffRole\)/);
  assert.match(flow, /await startSession\(activeSession\)/);
});

test('school staff sign-in rejects inactive employment before opening the workspace', () => {
  const flow = dashboard.slice(dashboard.indexOf('async function authenticateSchoolStaffRole'), dashboard.indexOf("document.querySelectorAll('[data-school-staff-role]'"));
  const inactive = flow.indexOf("employment_status");
  const start = flow.indexOf("await startSession(activeSession)");
  assert.ok(inactive >= 0 && start > inactive, 'Active-employment validation must precede session startup');
  assert.ok(flow.includes("String(account.employment_status||'').trim().toLowerCase()!=='active'"));
});

test('selected office is checked against the authenticated staff job title and role', () => {
  const matcher = dashboard.slice(dashboard.indexOf('function schoolStaffRoleMatches'), dashboard.indexOf('async function authenticateSchoolStaffRole'));
  assert.match(matcher, /account\?\.role==='Staff'/);
  assert.match(matcher, /account\?\.job_title/);
  assert.match(matcher, /role==='Headteacher'/);
  assert.match(matcher, /role==='Deputy Headteacher'/);
  assert.match(matcher, /role==='DOS'/);
  assert.match(matcher, /role==='Main Bursar'/);
  assert.match(matcher, /role==='Deputy Bursar'/);
});

test('Other Staff cannot use a reserved leadership or bursar role title', () => {
  const matcher = dashboard.slice(dashboard.indexOf('function schoolStaffRoleMatches'), dashboard.indexOf('async function authenticateSchoolStaffRole'));
  assert.match(matcher, /if\(role==='Other Staff'\)return staff&&!\[/);
  for (const title of ['headteacher','deputy headteacher','director of studies','main bursar','deputy bursar']) {
    assert.ok(matcher.includes("'" + title + "'"), 'Other Staff exclusion missing: ' + title);
  }
});

test('switching school office clears previously entered private credentials', () => {
  const back = dashboard.slice(dashboard.indexOf('function backToSchoolStaffRoles'), dashboard.indexOf('function schoolStaffRoleMatches'));
  assert.match(back, /staffLoginEmail.*value=''/);
  assert.match(back, /staffLoginPassword.*value=''/);
  assert.match(back, /schoolStaffAccessCode.*value=''/);
  assert.match(dashboard, /selectedSchoolStaffRole='';\$\('schoolStaffCredentials'\)\.classList\.add\('hidden'\)/);
});

test('main login keeps the Director entry separate from the school-office role selector', () => {
  const login = dashboard.slice(dashboard.indexOf('id="login"'), dashboard.indexOf('id="app"'));
  assert.match(login, /id="adminLoginPanel"/);
  assert.match(login, /id="staffLoginPanel"/);
  assert.match(login, /Director/);
  assert.match(login, /Original full-access account/);
  assert.match(login, /school administrator sign in/i);
});

test('role selector is responsive and supports narrow Android screens', () => {
  assert.match(dashboard, /\.school-staff-role-grid/);
  assert.match(dashboard, /@media\s*\(max-width:\s*520px\)/);
  assert.match(dashboard, /\.school-staff-role-choice/);
  assert.match(dashboard, /grid-template-columns:\s*1fr/);
});
