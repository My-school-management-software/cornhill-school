const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/staff-access-code/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261112020000_individual_staff_access_codes.sql'), 'utf8');

const dashboard = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const staffInvite = fs.readFileSync(path.join(root, 'supabase/functions/staff-invite/index.ts'), 'utf8');

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


test('staff invitations require the active Director and cannot create a duplicate Director account', () => {
  assert.ok(staffInvite.includes('.select("role,employment_status")'));
  assert.ok(staffInvite.includes('actor?.role !== "Admin" || actor?.employment_status !== "Active"'));
  assert.ok(staffInvite.includes('const normalizedJobTitle'));
  assert.ok(staffInvite.includes('["director", "school director"].includes(normalizedJobTitle)'));
  const directorGuard = staffInvite.indexOf('["director", "school director"].includes(normalizedJobTitle)');
  const inviteCall = staffInvite.indexOf('admin.auth.admin.inviteUserByEmail');
  assert.ok(directorGuard >= 0 && inviteCall > directorGuard, 'The Director identity must be protected before any invitation is created.');
});
