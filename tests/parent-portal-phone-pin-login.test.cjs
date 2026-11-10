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
const plan = read('docs/PARENT-PORTAL-WORK-PLAN.md');

test('Parent Portal requires learner pupil code and registered guardian phone', () => {
  assert.match(parents, /id="pupilCodeBeforeVerify"/);
  assert.match(parents, /id="phone"/);
  assert.match(parents, /parentApi\('verify',\{pupil_code:code,phone\}\)/);
  assert.doesNotMatch(parents, /id="guardianPin"/);
});

test('Guardian PIN is absent from parent-facing sign-in, reset, and change controls', () => {
  assert.doesNotMatch(parents, /id="guardianPin"|id="showPinReset"|id="resetPinButton"|id="changeGuardianPin"/);
  assert.doesNotMatch(parents, /guardianPinSettings|resetGuardianPin\(|changeGuardianPin\(/);
  assert.match(parents, /Guardian PIN is temporarily inactive on this portal/);
});

test('Parent API routes pupil-code + phone sign-in through the restricted database function', () => {
  assert.match(api, /parent_portal_get_learner_by_code_and_phone/);
  assert.match(api, /p_pupil_code: code/);
  assert.match(api, /p_registered_phone: phone/);
});

test('the previously deployed PIN route remains compatible until the corrected preview is approved', () => {
  assert.match(api, /parent_portal_get_learner_with_pin_by_phone/);
  assert.match(api, /const pin = String\(input\.pin/);
});

test('database verification matches the supplied pupil code to the exact active guardian phone', () => {
  assert.match(migration, /private\.resolve_learner_id_by_code\(v_code\)/);
  assert.match(migration, /c\.phone_e164=v_phone/);
  assert.match(migration, /c\.is_active=true/);
  assert.match(migration, /s\.status<>'Archived'/);
});

test('database verification rejects duplicate active guardian links for one code + phone pair', () => {
  assert.match(migration, /IF v_contact_count<>1 THEN/);
});

test('failed code + phone attempts are pair-specific, hashed, and throttled', () => {
  assert.match(migration, /phone_hash text NOT NULL/);
  assert.match(migration, /pupil_code_hash text NOT NULL/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_failed_attempts >= 5/);
  assert.match(migration, /interval '15 minutes'/);
});

test('new parent login RPC is not executable by browser roles', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.parent_portal_get_learner_by_code_and_phone\(text,text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /TO service_role/);
});

test('existing Guardian PIN records and PIN-based RPCs are preserved for reactivation', () => {
  assert.match(plan, /Existing Guardian PIN hashes, administrator issuance controls, and PIN-based database functions are retained unchanged/);
  assert.match(plan, /Re-enable Guardian PIN — WAITING FOR SCHOOL AUTHORISATION/);
  assert.match(migration, /parent_portal_get_learner_by_code_and_phone/);
});

test('learner pupil code remains mandatory and is displayed after sign-in', () => {
  assert.match(parents, /Pupil code: '\+escapeHtml\(l\.pupil_code\)/);
  assert.match(plan, /pupil code remains mandatory/);
});

test('staff and administrator sign-in are explicitly left unchanged', () => {
  assert.match(plan, /Staff and administrator authentication, staff PINs, and other application sign-in systems are unchanged/);
});

test('Parent Portal browser JavaScript parses', () => {
  const start = parents.lastIndexOf('<script>');
  const end = parents.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start);
  new vm.Script(parents.slice(start + 8, end), { filename: 'parents.html' });
});
