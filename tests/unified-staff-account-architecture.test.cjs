const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261111220000_unified_staff_account_directory.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /create unique index if not exists user_profiles_single_active_admin_idx/i,
  'Only one active full-access Admin/Director profile may exist.');
assert.match(sql, /where role = 'Admin'.*employment_status.*'Active'/is,
  'The single-Director guard must apply only to active Admin profiles.');
assert.match(sql, /create or replace view public\.staff_account_directory\s+with \(security_invoker = true\)/i,
  'The directory view must execute with caller privileges and respect underlying RLS.');
assert.match(sql, /when p\.role = 'Teacher' or p\.staff_category = 'Teaching'\s+then 'Teaching Staff'/i,
  'Teaching accounts must be grouped in Teaching Staff.');
assert.match(sql, /else 'School Administrators'/i,
  'Non-teaching accounts must use the second sign-in section.');
assert.match(sql, /p\.full_name as owner_name/i,
  'Each account row must display its owner's name.');
assert.match(sql, /p\.job_title/i,
  'Each account row must expose its actual job title.');
assert.match(sql, /where p\.role in \('Admin', 'Teacher', 'Staff'\)\s+and coalesce\(p\.employment_status, 'Active'\) = 'Active'/i,
  'Only active, supported staff profiles may appear.');
assert.match(sql, /revoke all on public\.staff_account_directory from public, anon/i,
  'The account directory must not be publicly readable.');
assert.match(sql, /grant select on public\.staff_account_directory to authenticated/i,
  'Authenticated access must be granted explicitly.');
assert.doesNotMatch(sql, /grant .* on public\.staff_account_directory to anon/i,
  'Anonymous users must not be granted access to the staff account directory.');

console.log('Unified staff account architecture: 11/11 source assertions passed.');
