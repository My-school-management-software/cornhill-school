const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261112080000_bursar_account_enrollment.sql'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/bursar-account-admin/index.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'bursar-account.html'), 'utf8');
const webPage = fs.readFileSync(path.join(root, 'supabase/functions/bursar-account-web/index.ts'), 'utf8');
const staffInvite = fs.readFileSync(path.join(root, 'supabase/functions/staff-invite/index.ts'), 'utf8');
const services = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs/BURSAR_ACCOUNT_ENROLLMENT_20261112.md'), 'utf8');

test('bursar enrollment keeps profiles and employee links pending until Director approval and password setup', () => {
  assert.match(edge, /inviteUserByEmail/);
  assert.match(edge, /status:\s*"invited"/);
  assert.match(edge, /\.eq\("status", "email_verified"\)/);
  assert.match(edge, /status: "approved"/);
  assert.match(edge, /complete_setup/);
  assert.match(edge, /activate_bursar_account_enrollment/);
  assert.match(edge, /action === "record_password_reset"/);
  assert.match(edge, /password_reset_completed/);
  assert.doesNotMatch(edge, /from\(["']user_profiles["']\)\.upsert/);
  assert.doesNotMatch(edge, /from\(["']school_staff_directory["']\)\.update/);
  assert.match(edge, /enrollment\.status !== "approved"/);
  assert.match(migration, /status in \('inviting','invited','email_verified','approved','active','rejected','delivery_failed'\)/);
  assert.match(migration, /where id = p_enrollment_id[\s\S]*and auth_user_id = p_auth_user_id/);
});

test('only the active original Director may create, approve, reject or list bursar enrollments', () => {
  assert.match(edge, /actor\?\.role !== "Admin"/);
  assert.match(edge, /actor\?\.employment_status !== "Active"/);
  assert.match(edge, /Only the active original Director account/);
  assert.match(edge, /if \(\["candidates", "list", "create_invitation", "approve", "reject"\]/);
});

test('bursar role is matched to the existing non-teaching employee job title', () => {
  assert.match(edge, /staff_category !== "Non-teaching"/);
  assert.match(edge, /roleForJobTitle/);
  assert.match(edge, /Main Bursar/);
  assert.match(edge, /Deputy Bursar/);
  assert.match(migration, /staff_category <> 'Non-teaching'/);
});

test('invitation email uses the existing Supabase callback and does not include a password', () => {
  assert.ok(edge.includes('https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/bursar-account-web'));
  assert.match(edge, /redirectTo: setupRedirect/);
  assert.doesNotMatch(edge, /payload\\.password|data:\\s*\\{[^}]*password/i);
  assert.ok(page.includes('<title>CORNHILL · Bursar Account Setup</title>'));
  assert.ok(page.includes('id="passwordForm"'));
  assert.ok(page.includes('createClient(SUPABASE_URL,SUPABASE_KEY'));
  assert.ok(page.includes('detectSessionInUrl:true'));
  assert.ok(page.includes('const SETUP_REDIRECT="https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/bursar-account-web"'));
  assert.ok(page.includes('redirectTo:SETUP_REDIRECT'));
  assert.ok(page.includes('updateUser({password})'));
  assert.ok(page.includes('complete_setup'));
  assert.ok(webPage.includes('https://my-school-management-software.github.io/cornhill-school/bursar-account.html'));
  assert.ok(webPage.includes('status: 302'));
  assert.ok(webPage.includes('const incomingUrl = new URL(req.url)'));
  assert.ok(webPage.includes('const destinationUrl = new URL(DESTINATION)'));
  assert.ok(webPage.includes('destinationUrl.search = incomingUrl.search'));
  assert.ok(webPage.includes('"Location": destinationUrl.toString()'));
  assert.ok(webPage.includes('"Referrer-Policy": "no-referrer"'));
  assert.ok(webPage.includes('"Cache-Control": "no-store, max-age=0"'));
});

test('email verification must happen before approval and password activation', () => {
  assert.match(edge, /email_confirmed_at/);
  assert.match(edge, /email_verified/);
  assert.match(edge, /only a bursar whose email has been verified/i);
  assert.match(edge, /The email must be verified and the Director must approve/);
  assert.match(migration, /email_verified_at/);
  assert.match(migration, /approved_at/);
});

test('all five agreed safeguards are present in the implementation and records', () => {
  assert.match(docs, /single-use/i);
  assert.match(docs, /expire according to the project's Auth email OTP expiration configuration/i);
  assert.match(migration, /bursar_account_enrollment_events/);
  assert.match(migration, /revoke all on table public\.bursar_account_enrollments from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.activate_bursar_account_enrollment\(uuid, uuid\) to service_role/i);
  assert.match(page, /autocomplete="new-password"/);
  assert.match(page, /at least 12 characters/);
  assert.match(page, /password is private/i);
  assert.match(page, /resetPasswordForEmail/);
  assert.match(page, /PASSWORD_RECOVERY/);
  assert.match(page, /record_password_reset/);
  assert.match(docs, /Password changed/);
  assert.match(docs, /rate limits/i);
});

test('activation SQL is server-only, validates email and role, and performs profile/link creation transactionally', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.activate_bursar_account_enrollment\(uuid, uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.activate_bursar_account_enrollment\(uuid, uuid\) to service_role/i);
  assert.match(migration, /auth\.users/);
  assert.match(migration, /email_confirmed_at/);
  assert.match(migration, /insert into public\.user_profiles/);
  assert.match(migration, /update public\.school_staff_directory/);
  assert.match(migration, /update public\.bursar_account_enrollments/);
});

test('legacy general staff invitation route cannot bypass the bursar approval flow', () => {
  assert.match(staffInvite, /Bursar accounts must use the separate Director-approval enrollment process/);
  assert.match(staffInvite, /employment_status/);
});

test('Director-only bursar invitation controls are available in the staff services portal', () => {
  assert.match(services, /bursarAccountAdminPanel/);
  assert.match(services, /bursarInviteForm/);
  assert.match(services, /bursar-account-admin/);
  assert.match(services, /email_verified/);
  assert.match(services, /bursarAccountRows/);
});

test('bursar admin CORS permits the exact review preview while rejecting unlisted origins', () => {
  assert.ok(edge.includes('"https://cornhill-school-git-feat-login-contract-0df38b-cypher-projects1.vercel.app"'));
  assert.ok(edge.includes('"https://cornhill-school-swart.vercel.app"'));
  assert.ok(edge.includes('https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/bursar-account-web'));
  assert.ok(edge.includes('origin && allowedOrigins.has(origin) ? origin : "null"'));
  assert.ok(!edge.includes('"Access-Control-Allow-Origin": "*"'));
});
