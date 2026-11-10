'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('learner register exposes an active, archived and all-records filter', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes('id="ldsRecordStatusFilter"'));
  assert.ok(source.includes('value="active">Non-archived records'));
  assert.ok(source.includes('value="archived">Archived records'));
  assert.ok(source.includes('value="all">All records'));
  assert.match(source, /statusMode === 'archived'/);
});

test('admin can archive or restore a learner through the protected archive workflow', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes('id="ldsArchiveRestore"'));
  assert.ok(source.includes("db.rpc('admin_set_learner_archived'"));
  assert.ok(source.includes('p_archived: archived'));
  assert.ok(source.includes('p_reason: reason'));
  assert.match(source, /Save or cancel your unsaved profile edits before archiving or deleting/);
});

test('permanent deletion is separate, reasoned, admin-only and requires exact pupil code confirmation', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes('id="ldsDeletePermanently"'));
  assert.ok(source.includes('p_confirmation_code: typedCode'));
  assert.ok(source.includes('window.prompt('));
  assert.ok(source.includes('typedCode !== code'));
  assert.ok(source.includes('Final confirmation: permanently delete'));
  assert.match(source, /st\.role !== 'Admin' \|\| st\.demo/);
  assert.match(source, /reason\.length < 5 \|\| reason\.length > 500/);
  assert.doesNotMatch(source, /db\.from\('students'\)\.delete/);
});

test('permanent deletion removes learner photo and bursary files before the database RPC', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes("add('learner-photos'"));
  assert.ok(source.includes("add('bursary-evidence'"));
  assert.ok(source.includes("select('support_document_path')"));
  assert.ok(source.includes("db.storage.from(bucket).remove(list)"));
  assert.ok(source.includes('p_storage_cleanup_confirmed: attachmentCount > 0'));
});

test('permanent delete database function is restricted to active school administrators', () => {
  const migration = read('supabase/migrations/20261110201751_admin_permanent_learner_deletion.sql');
  assert.match(migration, /SECURITY DEFINER/i);
  assert.match(migration, /SET search_path TO ''/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.is_school_admin\(\)/);
  assert.match(migration, /btrim\(p_confirmation_code\) <> v_student\.admission_number/);
  assert.match(migration, /length\(v_reason\) < 5/);
  assert.match(migration, /REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC, anon, service_role/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[^;]+TO authenticated/i);
});

test('permanent delete removes linked school records and rebuilds daily collection records', () => {
  const migration = read('supabase/migrations/20261110201751_admin_permanent_learner_deletion.sql');
  for (const table of [
    'school_sms_outbox', 'communication_outbox', 'parent_contact_change_log',
    'parent_school_messages', 'parent_report_access_audit', 'parent_portal_sessions',
    'guardian_pin_audit', 'payment_allocations', 'school_payments', 'learner_bursary_awards',
    'learner_charges', 'daily_collection_records', 'school_notification_user_state',
    'school_bursary_review_audit', 'school_notifications', 'school_admission_enquiries',
    'report_card_publications', 'assessment_scores', 'learner_conduct_reports',
    'school_library_loans', 'school_transport_assignments', 'school_welfare_cases',
    'learner_archive_audit', 'learner_code_change_audit', 'learner_code_aliases',
    'student_class_history', 'student_status_history', 'learner_enrolment_periods',
    'parent_guardian_contacts', 'students'
  ]) assert.match(migration, new RegExp('DELETE FROM public\\.' + table + '\\b'), table);
  assert.ok(migration.includes('public.refresh_daily_collection_record(v_collection_date)'));
  assert.ok(migration.includes('Remove history and identifiers'));
});

test('service worker cache is refreshed with the learner lifecycle UI', () => {
  const sw = read('service-worker.js');
  assert.ok(sw.includes('cornhill-shell-v90'));
  assert.ok(sw.includes('cornhill-static-v90'));
  assert.ok(sw.includes('/assets/cornhill-learner-details-sheet.js'));
});
