const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261112061726_restrict_remaining_staff_rls_policies.sql'),
  'utf8'
);

const restrictedTables = [
  'class_teacher_access',
  'evidence_capture_files',
  'evidence_capture_requests',
  'staff_attendance_adjustments',
  'staff_attendance_alerts',
  'staff_attendance_deduction_settings',
  'staff_attendance_device_users',
  'staff_attendance_import_batches',
  'staff_attendance_incidents',
  'staff_attendance_schedule_assignments',
  'staff_call_signals',
  'staff_communication_comments',
  'staff_communication_posts',
  'staff_communication_reactions',
  'staff_direct_messages',
  'staff_media_messages',
  'staff_salary_advances',
  'staff_salary_agreements',
  'staff_work_schedules'
];

test('generic active-staff write/read policy is removed from all sensitive staff tables', () => {
  for (const table of restrictedTables) {
    const statement = new RegExp(
      'DROP\\\\s+POLICY\\\\s+IF\\\\s+EXISTS\\\\s+"active_staff_session_required"\\\\s+ON\\\\s+public\\\\.' + table + '\\\\s*;',
      'i'
    );
    assert.match(migration, statement, 'Missing policy removal for ' + table);
  }
});

test('attendance import batch finalisation remains available only to the active Director/Admin role', () => {
  assert.match(migration, /CREATE POLICY "Admins update attendance import batches"/);
  assert.match(migration, /FOR UPDATE\\s+TO authenticated\\s+USING \\(public\\.is_school_admin\\(\\)\\)/);
  assert.match(migration, /WITH CHECK \\(public\\.is_school_admin\\(\\)\\)/);
});

test('the migration does not grant access to anonymous users or all authenticated users', () => {
  assert.doesNotMatch(migration, /TO\\s+(anon|public)\\b/i);
  assert.doesNotMatch(migration, /USING\\s*\\(true\\)/i);
  assert.doesNotMatch(migration, /WITH CHECK\\s*\\(true\\)/i);
});
