const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'guardian-accounts.html'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'notifications.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261110144000_parent_portal_guardian_pin_toggle.sql'), 'utf8');

test('guardian PIN page exists as a standalone school application', () => {
  assert.match(page, /CORNHILL · GUARDIAN PIN ADMINISTRATION/);
  assert.match(page, /guardian-accounts\.html|Parent Portal credentials/);
});

test('administrator must authenticate with a CORNHILL staff account', () => {
  assert.match(page, /db\.auth\.signInWithPassword/);
  assert.match(page, /db\.auth\.getSession\(\)/);
  assert.match(page, /employment_status!=='Active'/);
});

test('the admin-only directory RPC is used as the authoritative permission check', () => {
  assert.match(page, /db\.rpc\('admin_parent_contact_directory'\)/);
  assert.match(page, /await loadContacts\(\)/);
});

test('guardian PIN status is read without selecting credential hashes', () => {
  assert.match(page, /select\('id,guardian_pin_issued_at'\)/);
  assert.doesNotMatch(page, /guardian_pin_hash|guardian_recovery_hash/);
});

test('PIN creation calls the existing protected database function', () => {
  assert.match(page, /db\.rpc\('admin_issue_guardian_pin',\s*\{p_contact_id:contactId\}\)/);
});

test('no service-role or secret key is embedded in the browser page', () => {
  assert.doesNotMatch(page, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.match(page, /sb_publishable_/);
});

test('guardian phone numbers are masked to their final four digits in the register', () => {
  assert.match(page, /function maskedPhone\(value\)/);
  assert.match(page, /p\.slice\(-4\)/);
  assert.match(page, /Registered phone:/);
});

test('one-time PIN and recovery code are validated before display', () => {
  assert.match(page, /\^\\d\{8\}\$/);
  assert.match(page, /data\.recovery_code/);
  assert.match(page, /credentialModal/);
});

test('one-time credentials are not written into browser storage', () => {
  assert.doesNotMatch(page, /(localStorage|sessionStorage)\.(setItem|set)\s*\(/i);
  assert.doesNotMatch(page, /console\.(log|info|debug)\([^\n]*(pin|recovery)/i);
});

test('closing the credential reveal clears both values from the page state', () => {
  assert.match(page, /function closeCredentials\(\)/);
  assert.match(page, /secrets=\{pin:'',recovery:''\}/);
  assert.match(page, /issuedPin'\)\.textContent=''/);
  assert.match(page, /issuedRecovery'\)\.textContent=''/);
});

test('replacing an already-issued PIN requires explicit confirmation', () => {
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /Replace the existing PIN and recovery code/);
});

test('the guardian credential copy action requires an explicit button interaction', () => {
  assert.match(page, /data-copy="pin"/);
  assert.match(page, /data-copy="recovery"/);
  assert.match(page, /navigator\.clipboard\.writeText\(value\)/);
});

test('the page links to the separate Parent Portal, not the school admin session', () => {
  assert.match(page, /href="\/parents\.html"/);
  assert.match(page, /isolated Parent & Guardian Portal/);
});

test('the Notification Centre contains the guardian administration link', () => {
  assert.match(notifications, /href="\/guardian-accounts\.html"/);
});

test('the navigation link is hidden unless the signed-in profile is Admin', () => {
  assert.match(notifications, /guardianAccountsLink/);
  assert.match(notifications, /guardianAccountsLink'\)\.classList\.toggle\('hidden',profile\?\.role!=='Admin'\)/);
});

test('the administrator page uses the shared staff session storage key', () => {
  assert.match(page, /storageKey:'cornhill-notifications-v1'/);
});

test('the page has no unauthenticated HTTP endpoint for PIN issuance', () => {
  assert.doesNotMatch(page, /fetch\s*\([^\n]*(issue-pin|admin_issue_guardian_pin)/i);
  assert.match(page, /db\.rpc\('admin_issue_guardian_pin'/);
});

test('only active guardian contacts are displayed for issuance', () => {
  assert.match(page, /contacts=\(rows\|\|\[\]\)\.filter\(c=>c\.is_active\)/);
  assert.match(page, /c\.is_active&&/);
});

test('Parent Portal Settings includes an administrator-only Guardian PIN ON/OFF switch', () => {
  assert.match(page, /id="guardianPinRequiredToggle"/);
  assert.match(page, /role="switch"/);
  assert.match(page, /Parent Portal sign-in settings/);
  assert.match(page, /admin_get_parent_portal_security_settings/);
  assert.match(page, /admin_set_parent_portal_guardian_pin_required/);
});

test('Guardian PIN setting displays OFF initially and warns before enabling with unissued contacts', () => {
  assert.match(page, /guardianPinRequiredSetting = false/);
  assert.match(page, /OFF — parents use pupil code \+ registered guardian phone/);
  assert.match(page, /active guardian contact\(s\) do not yet have a PIN/);
  assert.match(page, /Existing parent sessions will be signed out/);
});

test('database stores Guardian PIN as OFF by default and limits setting changes to active Admin', () => {
  assert.match(migration, /guardian_pin_required boolean NOT NULL DEFAULT false/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_school_admin\(\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_set_parent_portal_guardian_pin_required\(boolean\) TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_set_parent_portal_guardian_pin_required\(boolean\) FROM PUBLIC, anon/);
});

test('enabling Guardian PIN revokes active Parent Portal sessions and records setting changes', () => {
  assert.match(migration, /UPDATE public\.parent_portal_sessions/);
  assert.match(migration, /private\.parent_portal_security_settings_audit/);
  assert.match(migration, /old_guardian_pin_required/);
  assert.match(migration, /new_guardian_pin_required/);
});

test('Notification Centre labels the administrator link Parent Portal Settings', () => {
  assert.match(notifications, /href="\/guardian-accounts\.html">Parent Portal Settings/);
});
