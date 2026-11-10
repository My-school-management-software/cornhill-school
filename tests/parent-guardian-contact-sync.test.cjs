'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20261110193104_auto_sync_parent_guardian_contacts_and_lock_login_attempts.sql'),
  'utf8'
);

test('guardian sync migration normalizes Ugandan phone formats consistently', () => {
  assert.match(migration, /private\.normalize_ug_phone/);
  assert.match(migration, /\^\\\\\+256\[0-9\]\{9\}\$/);
  assert.match(migration, /\^0\[0-9\]\{9\}\$/);
  assert.match(migration, /\^256\[0-9\]\{9\}\$/);
});

test('new learner admissions automatically create a primary guardian link when details are complete', () => {
  assert.match(migration, /create trigger students_sync_primary_guardian_contact/);
  assert.match(migration, /after insert or update of guardian_name, guardian_phone/);
  assert.match(migration, /insert into public\.parent_guardian_contacts/);
  assert.match(migration, /is_primary, is_active/);
});

test('guardian phone changes retire the old primary link and avoid inventing missing identities', () => {
  assert.match(migration, /Previous register-based primary contact/);
  assert.match(migration, /nullif\(trim\(coalesce\(new\.guardian_name,''\)\),''\)/);
});

test('archiving a learner disables the active primary guardian link', () => {
  assert.match(migration, /new\.archived_at is not null or new\.status = 'Archived'/);
  assert.match(migration, /set is_active = false,[\s\S]*?is_primary = false/);
});

test('guardian contact synchronization does not grant SMS or WhatsApp consent', () => {
  assert.match(migration, /coalesce\(new\.guardian_sms_opt_in,false\)/);
  assert.match(migration, /coalesce\(new\.guardian_whatsapp_opt_in,false\)/);
});

test('parent portal login attempt records are protected by row-level security', () => {
  assert.match(migration, /alter table private\.parent_portal_login_attempts enable row level security/i);
  assert.match(migration, /revoke all on table private\.parent_portal_login_attempts from public, anon, authenticated/i);
  assert.match(migration, /grant all on table private\.parent_portal_login_attempts to service_role/i);
});

test('communication preference changes are synchronized without inventing WhatsApp consent', () => {
  const followUp = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/migrations/20261110193505_guardian_contact_sync_opt_in_guard.sql'),
    'utf8'
  );
  assert.match(followUp, /old\.guardian_sms_opt_in is distinct from new\.guardian_sms_opt_in/);
  assert.match(followUp, /old\.guardian_whatsapp_opt_in is distinct from new\.guardian_whatsapp_opt_in/);
  assert.match(followUp, /coalesce\(new\.guardian_whatsapp_opt_in,false\) and v_whatsapp is not null/);
});
