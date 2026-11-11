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
  "Each account row must display its owner's name.");
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


const invitePath = path.join(__dirname, '..', 'supabase', 'functions', 'staff-invite', 'index.ts');
const inviteSource = fs.readFileSync(invitePath, 'utf8');
assert.match(inviteSource, /select\("role,employment_status"\)/,
  'Staff invitations must inspect the Director employment status.');
assert.match(inviteSource, /actor\?\.role !== "Admin" \|\| actor\?\.employment_status !== "Active"/,
  'Exited or inactive Admin profiles must not invite staff.');


const loginPath = path.join(__dirname, '..', 'index.html');
const loginHtml = fs.readFileSync(loginPath, 'utf8');
assert.match(loginHtml, /aria-labelledby="teachingStaffHeading"/,
  'The sign-in window must contain a dedicated Teaching Staff section.');
assert.match(loginHtml, /aria-labelledby="schoolAdministratorsHeading"/,
  'The sign-in window must contain a dedicated School Administrators section.');
assert.match(loginHtml, /id="classLoginDirectory"/,
  'Existing teacher class/assignment routing must remain wired.');
assert.match(loginHtml, /id="adminLoginPanel"/,
  'The existing administrator credential flow must remain wired.');
assert.match(loginHtml, /Director.*Full school access.*Existing account/,
  'The existing Director identity must be presented as retained, not duplicated.');
assert.match(loginHtml, /No duplicate Director account is created/,
  'The sign-in page must explicitly prevent duplicate Director account assumptions.');
assert.match(loginHtml, /Each staff member has one identity/,
  'The sign-in page must reinforce one identity per staff member.');


assert.match(loginHtml, /name="email" id="schoolStaffEmail" type="email"/,
  'Employee registration must collect the individual sign-in email.');
assert.match(loginHtml, /if\(isTeaching&&!staffEmail\)/,
  'Teaching employee registration must require an individual email before creating a login.');
assert.match(loginHtml, /db\.functions\.invoke\('staff-invite'/,
  'Employee registration must automatically invoke the existing secure staff invitation workflow.');
assert.match(loginHtml, /role:isTeaching\?'Teacher':'Staff'/,
  'The automatic invitation must preserve Teacher versus non-teaching Staff roles.');
assert.match(loginHtml, /Do not register this employee again/,
  'A partial invitation failure must warn against duplicate employee creation.');


assert.match(loginHtml, /id="adminLoginName"/,
  'The existing Director name slot must remain available to the class directory.');
assert.match(loginHtml, /select\('role,employment_status'\)/,
  'Sign-in must verify each account employment status.');
assert.match(loginHtml, /account\.employment_status&&account\.employment_status!=='Active'/,
  'Inactive staff accounts must be rejected at sign-in.');
assert.match(loginHtml, /!\['Admin','Staff'\]\.includes\(account\.role\)/,
  'School Administrators sign-in must accept authorised Staff accounts without promoting them to Admin.');


assert.match(loginHtml, /Class teachers, subject teachers and other teaching staff/,
  'The teaching section must include subject teachers as well as class teachers.');
assert.match(loginHtml, /Headteacher, Deputy Headteacher, DOS, Bursar, Deputy Bursar/,
  'The administrator section must identify the intended school leadership and bursar accounts.');

console.log('Unified staff account architecture: 31/31 source assertions passed.');
