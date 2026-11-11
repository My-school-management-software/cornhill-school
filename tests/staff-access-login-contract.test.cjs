const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/staff-access-code/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261112020000_individual_staff_access_codes.sql'), 'utf8');

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
  assert.ok(/grant execute on function public\.consume_staff_access_code_attempt[\s\S]*service_role/i.test(migration));
});

test('Director remains Admin-only and no new Director role is created', () => {
  assert.ok(html.includes("if(role==='Director')return admin"));
  assert.ok(html.includes("admin=p?.role==='Admin'"));
  assert.ok(edge.includes('profile.role !== "Staff"'));
});
