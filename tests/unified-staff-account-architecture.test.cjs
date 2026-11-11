const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261111220000_unified_staff_account_directory.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');


const activeSessionMigrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261111230000_require_active_staff_session_for_staff_tables.sql');
const activeSessionSql = fs.readFileSync(activeSessionMigrationPath, 'utf8');
assert.match(activeSessionSql, /create policy active_staff_session_required on public\.%I as restrictive for all to authenticated/i,
  'Staff-domain RLS hardening must be restrictive and must not grant access by itself.');
assert.match(activeSessionSql, /using \(public\.is_active_staff_session\(\)\) with check \(public\.is_active_staff_session\(\)\)/i,
  'Every staff-domain operation must require a currently active profile.');
assert.match(activeSessionSql, /staff_salary_advances[\s\S]*staff_salary_agreements[\s\S]*staff_work_schedules/,
  'The active-session guard must cover attendance, communications, payroll and schedules.');

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
assert.match(sql, /where p\.role in \('Admin', 'Teacher', 'Staff'\)\s+and p\.employment_status = 'Active'/i,
  'Only explicitly active, supported staff profiles may appear.');
assert.match(sql, /where role = 'Admin' and employment_status = 'Active'/i,
  'A missing employment status must not count as an active Director profile.');
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


assert.match(loginHtml, /function staffAllowedWorkspaces\(\)/,
  'Non-teaching staff navigation must be resolved from the account job title.');
assert.match(loginHtml, /if\(isDos\)return \[\.\.\.base,'students','classes','academics','reports'\]/,
  'The Director of Studies must receive the academic management workspaces.');
assert.match(loginHtml, /if\(isHeadteacher\)return \[\.\.\.base,'students','classes','academics','reports'\]/,
  'The Headteacher must receive the academic oversight workspaces.');
assert.match(loginHtml, /if\(isBursar\)return \[\.\.\.base,'finance'\]/,
  'Bursar and Deputy Bursar accounts must receive the finance workspace.');
assert.match(loginHtml, /staffAllowedWorkspaces\(\)\.includes\(name\)/,
  'Direct workspace navigation must enforce the same staff role map.');


const statusPath = path.join(__dirname, '..', 'supabase', 'functions', 'staff-employment-status', 'index.ts');
const statusSource = fs.readFileSync(statusPath, 'utf8');
assert.match(statusSource, /if \(employmentStatus !== "Active"\)[\s\S]*?from\("user_profiles"\)[\s\S]*?employment_status: employmentStatus[\s\S]*?updateUserById\(staffUserId, \{ ban_duration: "876000h" \}\)/,
  'Suspension must mark the authoritative profile inactive before applying the Auth ban.');

assert.match(statusSource, /if \(employmentStatus === "Active"\)[\s\S]*?if \(target\.role === "Teacher"\)[\s\S]*?from\("academic_teacher_directory"\)[\s\S]*?\.maybeSingle\(\)[\s\S]*?else \{[\s\S]*?from\("school_staff_directory"\)[\s\S]*?\.maybeSingle\(\)/,
  'Reactivation must verify the role-specific teacher or employee record before lifting the authentication ban.');
assert.match(statusSource, /if \(target\.role === "Teacher"\)[\s\S]*?from\("academic_teacher_directory"\)[\s\S]*?teacherRows\?\.length !== 1[\s\S]*?else \{[\s\S]*?from\("school_staff_directory"\)[\s\S]*?employeeRows\?\.length !== 1/,
  'Employment changes must synchronise exactly one record in the correct teaching or non-teaching directory.');

assert.match(statusSource, /Auth bans prevent future sign-in\/refresh but do NOT revoke an already-issued JWT/i,
  'The function must document that banning does not revoke already-issued access tokens.');
assert.match(loginHtml, /db\.rpc\('is_active_staff_session'\)/,
  'An online signed-in session must periodically re-check the authoritative active-staff RLS helper.');
assert.match(loginHtml, /window\.cornhillOfflineReadOnly&&!window\.cornhillSessionAuthorizationUnverified/,
  'A temporary read-only authorization failure must still allow the heartbeat to retry.');
assert.match(loginHtml, /setInterval\(\(\)=>\{verifyActiveStaffSession\('interval'\)\},60000\)/,
  'Existing sessions must be re-verified at a bounded 60-second interval.');
assert.match(loginHtml, /workspace is temporarily read-only until the secure connection is restored/,
  'A failed active-session verification must fail safe into read-only mode.');
assert.match(statusSource, /actor\?\.role !== "Admin" \|\| actor\?\.employment_status !== "Active"/,
  'Only the active Director may change another staff member’s access.');
assert.match(statusSource, /staffUserId === actorId/,
  'The status endpoint must reject self-deactivation.');
assert.match(statusSource, /!\["Teacher", "Staff"\]\.includes\(String\(target\.role\)\)/,
  'The existing Director/Admin identity must not be deactivated through the staff workflow.');
assert.match(statusSource, /\["Active", "On Leave", "Exited"\]\.includes\(employmentStatus\)/,
  'Only the supported employment statuses may be applied.');
assert.match(statusSource, /updateUserById\(staffUserId, \{ ban_duration: "876000h" \}\)/,
  'Inactive staff accounts must be banned at the Supabase Auth layer.');
assert.match(statusSource, /updateUserById\(staffUserId, \{ ban_duration: "none" \}\)/,
  'Reactivation must explicitly lift the Auth ban.');
assert.match(statusSource, /employmentStatus === "Exited" && employmentEndDate === null/,
  'An exited employee must have a final working date.');
assert.match(statusSource, /from\("school_staff_directory"\)[\s\S]*?employment_status: employmentStatus, employment_end_date: employmentEndDate/,
  'Non-teaching employee records must receive status and end-date updates.');
assert.match(statusSource, /from\("academic_teacher_directory"\)[\s\S]*?update\(\{ employment_status: employmentStatus \}\)/,
  'Teaching employee records must receive status updates without referencing absent columns.');
assert.match(statusSource, /from\("user_profiles"\)[\s\S]*?employment_status: employmentStatus,[\s\S]*?employment_end_date: employmentEndDate/,
  'The sign-in profile status must be synchronised.');
assert.doesNotMatch(statusSource, /deleteUser|\.delete\(/,
  'Staff departure must preserve Auth identities and historical records instead of deleting them.');
assert.match(loginHtml, /db\.functions\.invoke\('staff-employment-status'/,
  'Staff employment changes must call the server-authorised status endpoint.');
assert.match(loginHtml, /confirm\('Confirm employment status change/,
  'Administrators must confirm before an account is suspended or reactivated.');
assert.match(loginHtml, /selected\.role==='Admin'/,
  'The existing Director account must be protected in the staff profile UI.');


assert.match(loginHtml, /const OFFLINE_SCHOOL_MAX_AGE=12\*60\*60\*1000/,
  'Offline learner snapshots must expire after a bounded 12-hour period.');
assert.match(loginHtml, /const savedAtMs=snap\?\.savedAt\?Date\.parse\(snap\.savedAt\):NaN/,
  'Offline snapshot dates must be parsed explicitly.');
assert.match(loginHtml, /!Number\.isFinite\(savedAtMs\)\|\|ageMs<0\|\|ageMs>OFFLINE_SCHOOL_MAX_AGE/,
  'Invalid, future-dated and expired offline snapshots must be rejected.');
assert.match(loginHtml, /snap\.owner!==owner/,
  'Offline class snapshots must remain bound to the signed-in account owner.');
assert.match(loginHtml, /!Array\.isArray\(snap\.classes\)\|\|!Array\.isArray\(snap\.students\)/,
  'Offline snapshots must have valid class and learner collections.');
assert.match(loginHtml, /await offlineSchoolDelete\(owner\);return false/,
  'Invalid or expired offline snapshots must be removed from local storage.');
assert.match(loginHtml, /remote account suspension takes effect on this device when it reconnects or this snapshot expires/,
  'The offline banner must explain the remote-revocation limitation and expiry.');

const failClosedActiveSessionPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261111233000_fail_closed_active_staff_session.sql');
const failClosedActiveSession = fs.readFileSync(failClosedActiveSessionPath, 'utf8');
assert.match(failClosedActiveSession, /p\.employment_status = 'Active'/,
  'A missing employment status must not inherit active access.');
assert.doesNotMatch(failClosedActiveSession, /coalesce\(p\.employment_status,\s*'Active'\)/,
  'The active-session helper must fail closed for NULL employment status.');

const failClosedRoleHelpersPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261111234000_fail_closed_role_and_teacher_helpers.sql');
const failClosedRoleHelpers = fs.readFileSync(failClosedRoleHelpersPath, 'utf8');
for (const helper of ['is_school_admin','is_school_finance_operator','is_school_dos','is_school_headteacher','is_class_teacher_for_class','is_full_class_teacher_for_class','can_teacher_access_subject','can_teacher_view_subject','list_staff_directory']) {
  assert.ok(failClosedRoleHelpers.includes('create or replace function public.' + helper + '('), `Role helper migration must update ${helper}.`);
}
assert.match(failClosedRoleHelpers, /public\.is_active_staff_session\(\)/,
  'Role and teacher access helpers must share the fail-closed active-session guard.');
assert.doesNotMatch(failClosedRoleHelpers, /coalesce\([^)]*employment_status[^)]*'Active'/,
  'Role and teacher access helpers must not treat NULL employment status as active.');

const activeRlsMigrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261111230000_require_active_staff_session_for_staff_tables.sql');
const activeRlsMigration = fs.readFileSync(activeRlsMigrationPath, 'utf8');
for (const table of ['staff_attendance_adjustments','staff_attendance_alerts','staff_attendance_deduction_settings','staff_attendance_device_users','staff_attendance_events','staff_attendance_import_batches','staff_attendance_incidents','staff_attendance_schedule_assignments','staff_call_signals','staff_communication_comments','staff_communication_posts','staff_communication_reactions','staff_direct_messages','staff_media_messages','staff_salary_advances','staff_salary_agreements','staff_work_schedules','class_teacher_access','class_subjects','evidence_capture_files','evidence_capture_requests']) {
  assert.match(activeRlsMigration, new RegExp(`'${table}'`), `Active-session RLS migration must cover ${table}.`);
}
assert.match(activeRlsMigration, /as restrictive for all to authenticated using \(public\.is_active_staff_session\(\)\) with check \(public\.is_active_staff_session\(\)\)/,
  'Staff table guard must be restrictive and enforce both reads/writes and row checks without granting access.');
assert.match(activeRlsMigration, /c\.relrowsecurity/,
  'Migration must only add the restrictive policy to tables already protected by RLS.');
assert.match(activeRlsMigration, /not exists \([\s\S]*?policyname = 'active_staff_session_required'/,
  'Migration must be safe to rerun without duplicating its policy.');

console.log('Unified staff account architecture: source assertions passed, including active-session RLS revocation checks.');

const directRpcGuardsPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261112001000_remove_null_active_fallbacks_from_staff_rpcs.sql');
const directRpcGuards = fs.readFileSync(directRpcGuardsPath, 'utf8');
for (const rpc of ['archive_school_notification','list_school_notification_center','list_school_notifications','mark_school_notification_read','restore_school_notification','teacher_guardian_pin_status','teacher_list_my_assignments','teacher_subject_learner_roster','teacher_visiting_day_lookup','touch_evidence_capture_device','notify_school_learning_resource_event','notify_school_library_loan_event','notify_school_transport_assignment_event']) {
  assert.ok(directRpcGuards.includes("'" + rpc + "("), `The direct staff RPC migration must include ${rpc}.`);
}
assert.match(directRpcGuards, /employment_status = ''Active''/,
  'Direct SECURITY DEFINER checks must require an explicit Active status.');
assert.match(directRpcGuards, /td\.employment_status = ''Active''/,
  'Teacher subject access must not inherit Active status from a NULL teacher-directory row.');
assert.match(directRpcGuards, /if v_updated = v_definition then[\s\S]*?refusing partial migration/,
  'The dynamic migration must fail if the audited function definitions have drifted.');
