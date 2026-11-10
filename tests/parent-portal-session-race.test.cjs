'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase/functions/parent-portal-api/index.ts'), 'utf8');
const sessionMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261110153503_parent_portal_atomic_session_guard.sql'), 'utf8');
const toggleMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261110144000_parent_portal_guardian_pin_toggle.sql'), 'utf8');

test('Parent Portal sessions are created only through the atomic database RPC', () => {
  assert.match(api, /db\.rpc\("parent_portal_create_session"/);
  assert.doesNotMatch(api, /db\.from\("parent_portal_sessions"\)\.insert/);
});

test('session issuance passes only the PIN actually used by the server-verified sign-in branch', () => {
  assert.match(api, /p_pin:pinRequired\?pin:null/);
  assert.match(api, /parent_portal_get_learner_with_pin/);
  assert.match(api, /parent_portal_get_learner_by_code_and_phone/);
});

test('database session creation takes a shared lock on the current Guardian PIN setting', () => {
  assert.match(sessionMigration, /FROM private\.parent_portal_security_settings s[\s\S]*?FOR SHARE;/);
  assert.match(toggleMigration, /FOR UPDATE;/);
});

test('a PIN enabled during an in-flight no-PIN login prevents session issuance', () => {
  assert.match(sessionMigration, /IF v_pin_required THEN[\s\S]*?extensions\.crypt\(p_pin, v_guardian_pin_hash\)/);
  assert.match(api, /session\?\.code==="guardian_pin_required"[\s\S]*?Guardian PIN requirement or your PIN changed during sign-in/);
});

test('session issuance rechecks the exact active guardian contact and learner archive status', () => {
  assert.match(sessionMigration, /FOR SHARE OF c;/);
  assert.match(sessionMigration, /v_contact_phone IS DISTINCT FROM p_registered_phone/);
  assert.match(sessionMigration, /FOR SHARE OF s;/);
  assert.match(sessionMigration, /v_student_status = 'Archived'/);
});

test('the session RPC is restricted to the server service role', () => {
  assert.match(sessionMigration, /REVOKE ALL ON FUNCTION public\.parent_portal_create_session\(text, uuid, uuid, text, text, text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sessionMigration, /GRANT EXECUTE ON FUNCTION public\.parent_portal_create_session\(text, uuid, uuid, text, text, text\)[\s\S]*?TO service_role/);
  assert.match(sessionMigration, /SECURITY DEFINER[\s\S]*?SET search_path TO ''/);
});
