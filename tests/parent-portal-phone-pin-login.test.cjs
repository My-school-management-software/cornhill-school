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
const migration = read('supabase/migrations/20261110130000_parent_portal_phone_pin_signin.sql');
const plan = read('docs/PARENT-PORTAL-WORK-PLAN.md');

test('Parent Portal login requests only registered phone number and guardian PIN', () => {
  assert.match(parents, /id="phone"/);
  assert.match(parents, /id="guardianPin"/);
  assert.doesNotMatch(parents, /id="pupilCodeBeforeVerify"/);
  assert.match(parents, /parentApi\('verify',\{phone,pin\}\)/);
});

test('Parent Portal reset and change PIN forms no longer request pupil code', () => {
  assert.doesNotMatch(parents, /id="resetPupilCode"/);
  assert.match(parents, /parentApi\('reset-pin',\{phone,recovery_code:recovery,new_pin:pin\}\)/);
  assert.match(parents, /parentApi\('change-pin',\{phone,current_pin:current,new_pin:next\}\)/);
});

test('API validates phone and 8-digit PIN and calls the phone-only database function', () => {
  assert.match(api, /parent_portal_get_learner_with_pin_by_phone/);
  assert.match(api, /p_registered_phone: phone, p_pin: pin/);
  assert.doesNotMatch(api, /const code = String\(input\.pupil_code/);
});

test('PIN reset and change APIs use phone-only database functions', () => {
  assert.match(api, /parent_reset_guardian_pin_by_phone/);
  assert.match(api, /parent_change_guardian_pin_by_phone/);
  assert.doesNotMatch(api, /p_pupil_code:code/);
});

test('phone-only verification resolves the learner from an active registered guardian contact', () => {
  assert.match(migration, /c\.phone_e164=v_phone AND c\.is_active=true AND s\.status<>'Archived'/);
  assert.match(migration, /extensions\.crypt\(p_pin,c\.guardian_pin_hash\)=c\.guardian_pin_hash/);
  assert.match(migration, /parent_portal_get_learner_with_pin\(v_pupil_code,v_phone,p_pin\)/);
});

test('phone-only verification rejects ambiguous multiple matching PINs', () => {
  assert.match(migration, /IF v_match_count<>1 THEN/);
  assert.match(migration, /guardian_pin_failed_attempts=coalesce\(c\.guardian_pin_failed_attempts,0\)\+1/);
});

test('phone-only reset and change still delegate to the existing protected lockout and session-revocation functions', () => {
  assert.match(migration, /parent_reset_guardian_pin\(v_pupil_code,v_phone,p_recovery_code,p_new_pin\)/);
  assert.match(migration, /parent_change_guardian_pin\(v_pupil_code,v_phone,p_current_pin,p_new_pin\)/);
});

test('new phone-only RPC functions are not executable by anon or authenticated browser roles', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.parent_portal_get_learner_with_pin_by_phone\(text,text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
});

test('work plan records pupil-code verification as disabled until school authorisation', () => {
  assert.match(plan, /Re-enable pupil-code verification — WAITING FOR SCHOOL AUTHORISATION/);
  assert.match(plan, /Do not re-enable it until the school explicitly instructs/);
});

test('permanent pupil code remains stored and shown after successful guardian verification', () => {
  assert.match(parents, /pupil_code/);
  assert.match(plan, /permanent pupil code remains unchanged/);
});

test('offline service worker cache version is refreshed', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /cornhill-shell-v87/);
  assert.match(sw, /cornhill-static-v87/);
});

test('Parent Portal browser JavaScript parses', () => {
  const start = parents.lastIndexOf('<script>');
  const end = parents.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start);
  new vm.Script(parents.slice(start + 8, end), { filename: 'parents.html' });
});
