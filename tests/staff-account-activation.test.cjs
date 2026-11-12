const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/staff-account-activation/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261112130921_director_issued_staff_activation_codes.sql'), 'utf8');
const services = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');

test('activation centre is served as a real HTML page without GitHub Pages or Vercel hosting', () => {
  assert.match(edge, /req\.method === "GET" \|\| req\.method === "HEAD"/);
  assert.match(edge, /"Content-Type": "text\/html; charset=utf-8"/);
  assert.match(edge, /const PAGE =/);
  assert.match(edge, /id=\\?"activateForm\\?"/);
  assert.match(edge, /id=\\?"directorLoginForm\\?"/);
  assert.match(edge, /id=\\?"directorPanel\\?"/);
  assert.doesNotMatch(edge, /text\/xhtml|application\/xhtml\+xml/i);
});

test('only an authenticated active Admin can manage existing and activation codes', () => {
  assert.match(edge, /async function directorFor/);
  assert.match(edge, /profile\?\.role !== "Admin"/);
  assert.match(edge, /profile\?\.employment_status !== "Active"/);
  assert.match(edge, /const director = await directorFor\(req, admin\)/);
  assert.match(edge, /if \(!director\) return json\(403/);
});

test('existing teacher and leadership sign-in codes keep the established secure hash prefix', () => {
  assert.match(edge, /cornhill-staff-access-v1:/);
  assert.match(edge, /staff_access_codes/);
  assert.match(edge, /staff_access_code_audit/);
  assert.match(edge, /issue_existing/);
  assert.match(edge, /revoke_existing/);
  assert.match(edge, /verifyExistingAccount/);
});

test('activation codes are hashed, expire, and are claimed atomically for one-time redemption', () => {
  assert.match(edge, /cornhill-activation-v1:/);
  assert.match(edge, /expires_at/);
  assert.match(edge, /redeemed_at/);
  assert.match(edge, /revoked_at/);
  assert.match(edge, /\.is\("redeemed_at", null\)/);
  assert.match(edge, /\.is\("revoked_at", null\)/);
  assert.match(edge, /\.gt\("expires_at", now\)/);
  assert.match(edge, /\.update\(\{ is_active: false, redeemed_at: now/);
  assert.doesNotMatch(edge, /insert\(\{[^}]*code\s*:/i);
});

test('bursar activation reuses the existing Auth user and existing account activation routine', () => {
  assert.match(edge, /admin\.auth\.admin\.updateUserById\(existingAuthId/);
  assert.match(edge, /email_confirm: true/);
  assert.match(edge, /password,/);
  assert.match(edge, /activate_bursar_account_enrollment/);
  assert.match(edge, /status: "approved"/);
  assert.match(edge, /email_verified_at: now/);
  assert.match(edge, /bursar_account_enrollments/);
});

test('leadership activation creates an individual Staff profile linked to the selected employee record', () => {
  assert.match(edge, /admin\.auth\.admin\.createUser/);
  assert.match(edge, /role: "Staff"/);
  assert.match(edge, /school_staff_directory/);
  assert.match(edge, /linked_user_id: activatedUserId/);
  assert.match(edge, /\["Headteacher", "Deputy Headteacher", "DOS"\]/);
});

test('activation rate limiting and email uniqueness checks are enforced before redemption', () => {
  assert.match(edge, /consume_staff_access_code_attempt/);
  assert.match(edge, /listUsers\(\{ page: 1, perPage: 1000 \}\)/);
  assert.match(edge, /emailOwner && emailOwner\.id !== existingAuthId/);
  assert.match(edge, /password\.length < 12/);
});

test('activation database tables deny browser access and store only hashed one-time codes', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.staff_activation_codes from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.staff_activation_code_audit from public, anon, authenticated/i);
  assert.match(migration, /code_hash text not null unique/i);
  assert.match(migration, /expires_at timestamptz not null/i);
});

test('Headteacher, Deputy Headteacher and DOS can use email/password after activation', () => {
  assert.match(services, /Headteacher:[\s\S]{0,260}mode:'email',modes:\['email','code'\]/);
  assert.match(services, /Deputy Headteacher'?:[\s\S]{0,300}mode:'email',modes:\['email','code'\]/);
  assert.match(services, /DOS:[\s\S]{0,260}mode:'email',modes:\['email','code'\]/);
});

test('Director staff account page links to the independent Supabase activation centre', () => {
  assert.match(services, /https:\/\/yemhortbudwbcrzsoozk\.supabase\.co\/functions\/v1\/staff-account-activation/);
  assert.match(services, /Open Staff Activation Centre/);
});

test('the Director identity remains separate and is never included as an activation target', () => {
  assert.match(edge, /employee\.staff_category !== "Non-teaching"/);
  assert.match(edge, /roleForTitle\(employee\.job_title\)/);
  assert.match(edge, /if \(\["main bursar"/);
  assert.match(edge, /if \(\["deputy bursar"/);
  assert.match(edge, /if \(\["headteacher"/);
  assert.match(edge, /if \(\["deputy headteacher"/);
  assert.match(edge, /if \(\["dos"/);
  assert.doesNotMatch(edge, /role:\s*"Admin"[^\n]*createUser/);
});
