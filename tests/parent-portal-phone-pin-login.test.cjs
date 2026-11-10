'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const parents = read('parents.html');
const api = read('supabase/functions/parent-portal-api/index.ts');
const migration = read('supabase/migrations/20261110124500_parent_portal_pupil_code_phone_access.sql');
const toggleMigration = read('supabase/migrations/20261110144000_parent_portal_guardian_pin_toggle.sql');
const plan = read('docs/PARENT-PORTAL-WORK-PLAN.md');

test('Parent Portal always requires the learner pupil code and registered guardian phone', () => {
  assert.match(parents, /id="pupilCodeBeforeVerify"/);
  assert.match(parents, /id="phone"/);
  assert.match(parents, /parentApi\('verify',payload\)/);
  assert.match(parents, /pupil_code:code/);
});

test('Guardian PIN input remains hidden unless the administrator setting is ON', () => {
  assert.match(parents, /id="guardianPinEntry" class="hidden"/);
  assert.match(parents, /id="guardianPin"/);
  assert.match(parents, /guardianPinRequired/);
  assert.match(parents, /parentApi\('auth-method'\)/);
  assert.match(parents, /classList\.toggle\('hidden',!guardianPinRequired\)/);
});

test('Parent Portal loads the server-controlled sign-in setting when the page opens', () => {
  assert.match(parents, /loadGuardianAuthSettings\(\);/);
  assert.ok(parents.lastIndexOf('loadGuardianAuthSettings();') > parents.indexOf("el('signInGuardian').addEventListener('click',signInGuardian)"));
});

test('Parent API exposes only the Guardian PIN requirement status for the portal display', () => {
  assert.match(api, /action === "auth-method"/);
  assert.match(api, /parent_portal_guardian_pin_required/);
  assert.match(api, /guardian_pin_required: data/);
});

test('the server reads the school-controlled Guardian PIN setting before every parent sign-in', () => {
  assert.match(api, /const \{ data: pinRequired, error: settingError \} = await db\.rpc\("parent_portal_guardian_pin_required"\)/);
  assert.match(api, /if \(pinRequired\)/);
  assert.match(api, /parent_portal_get_learner_with_pin/);
  assert.match(api, /parent_portal_get_learner_by_code_and_phone/);
  assert.doesNotMatch(api, /isPreviewOrigin/);
});

test('when Guardian PIN is ON, the server requires an 8-digit PIN in addition to pupil code and phone', () => {
  assert.match(api, /if \(!\/\^\\d\{8\}\$\/\.test\(pin\)\)/);
  assert.match(api, /p_pupil_code: code, p_registered_phone: phone, p_pin: pin/);
});

test('when Guardian PIN is OFF, the server verifies the exact pupil code + active registered phone pair', () => {
  assert.match(api, /parent_portal_get_learner_by_code_and_phone/);
  assert.match(migration, /private\.resolve_learner_id_by_code\(v_code\)/);
  assert.match(migration, /c\.phone_e164=v_phone/);
  assert.match(migration, /c\.is_active=true/);
  assert.match(migration, /s\.status<>'Archived'/);
});

test('code + phone verification rejects duplicate active guardian links and throttles repeated failures', () => {
  assert.match(migration, /IF v_contact_count<>1 THEN/);
  assert.match(migration, /phone_hash text NOT NULL/);
  assert.match(migration, /pupil_code_hash text NOT NULL/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_failed_attempts >= 5/);
  assert.match(migration, /interval '15 minutes'/);
});

test('the new code + phone lookup is not executable by browser roles', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.parent_portal_get_learner_by_code_and_phone\(text,text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
});

test('the Guardian PIN setting is OFF by default and can only be updated by an active Admin', () => {
  assert.match(toggleMigration, /guardian_pin_required boolean NOT NULL DEFAULT false/);
  assert.match(toggleMigration, /auth\.uid\(\) IS NULL OR NOT public\.is_school_admin\(\)/);
  assert.match(toggleMigration, /admin_set_parent_portal_guardian_pin_required/);
});

test('enabling Guardian PIN revokes old parent sessions but preserves credential records', () => {
  assert.match(toggleMigration, /UPDATE public\.parent_portal_sessions/);
  assert.match(toggleMigration, /private\.parent_portal_security_settings_audit/);
  assert.match(plan, /Existing Guardian PIN hashes, recovery hashes, administrator issuance controls/);
});

test('learner pupil code remains displayed after guardian verification', () => {
  assert.match(parents, /Pupil code: '\+escapeHtml\(l\.pupil_code\)/);
  assert.match(plan, /learner's permanent pupil code/);
});

test('staff and administrator sign-in are not changed by the Parent Portal setting', () => {
  assert.match(plan, /staff PINs, and all other application sign-in systems are unchanged/);
});

test('Parent Portal browser JavaScript parses', () => {
  const start = parents.lastIndexOf('<script>');
  const end = parents.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start);
  new vm.Script(parents.slice(start + 8, end), { filename: 'parents.html' });
});
