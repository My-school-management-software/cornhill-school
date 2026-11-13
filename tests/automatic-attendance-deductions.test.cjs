const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations',
  '20261113160000_automatic_staff_attendance_deductions.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const uiPath = path.join(__dirname, '..', 'assets', 'cornhill-staff-attendance-salary.js');
const ui = fs.readFileSync(uiPath, 'utf8');

test('automatic deductions default to disabled until Director enables them', () => {
  assert.match(sql, /automatic_deductions_enabled boolean not null default false/i);
});

test('background processor is separate from Director kiosk activity', () => {
  assert.match(sql, /create or replace function private\.finalize_staff_attendance_auto_deductions/i);
  assert.match(sql, /cron\.schedule\([\s\S]*?'\*\/5 \* \* \* \*'/i);
});

test('school-wide no-clock-in day suspends all automatic deductions', () => {
  assert.match(sql, /v_scheduled_count>0 and v_clocked_count=0/i);
  assert.match(sql, /school_wide_review',true/i);
  assert.match(sql, /deductions_processed',0/i);
});

test('only missed clock-in incidents qualify for automatic deduction', () => {
  assert.match(sql, /i\.incident_type='missed_clock_in'/i);
});

test('two-hour review deadline must have passed', () => {
  assert.match(sql, /i\.review_deadline_at<=now\(\)/i);
});

test('Headteacher or DOS statement prevents automatic deduction', () => {
  assert.match(sql, /nullif\(btrim\(i\.headteacher_statement\),''\) is null/i);
});

test('a staff member who eventually clocked in is not treated as a no-show', () => {
  assert.match(sql, /and not exists \([\s\S]*?e\.event_type='clock_in'[\s\S]*?e\.staff_user_id=i\.staff_user_id/i);
});

test('school-local processor time is defined before the cutoff check', () => {
  assert.match(sql, /v_now_local timestamp without time zone := now\(\) at time zone 'Africa\/Kampala'/i);
});

test('salary agreement must provide a valid daily rate', () => {
  assert.match(sql, /a\.daily_rate_ugx/i);
  assert.match(sql, /if coalesce\(v_daily_rate,0\)<=0 then/i);
});

test('deduction is capped at the remaining daily amount', () => {
  assert.match(sql, /greatest\(0,v_daily_rate-v_already_approved\)/i);
});

test('automatic deduction is added to approved payroll attendance deductions', () => {
  assert.match(sql, /set status='approved'/i);
  assert.match(sql, /approved_deduction_ugx=v_deduction/i);
});

test('affected staff receive an individual notification', () => {
  assert.match(sql, /attendance deduction recorded/i);
  assert.match(sql, /:staff/i);
  assert.match(sql, /next payroll run/i);
});

test('Director, Headteacher and DOS receive oversight notifications', () => {
  assert.match(sql, /'DIRECTOR','HEADTEACHER','HEAD TEACHER'/i);
  assert.match(sql, /'DOS','DIRECTOR OF STUDIES'/i);
  assert.match(sql, /:lead:/i);
});

test('notification records include incident, date and deduction amount', () => {
  assert.match(sql, /'incident_id',v_incident\.id/i);
  assert.match(sql, /'attendance_date',v_incident\.attendance_date/i);
  assert.match(sql, /'deduction_ugx',v_deduction/i);
});

test('processor does not run when the Director master switch is off', () => {
  assert.match(sql, /if not coalesce\(v_enabled,false\) then/i);
});

test('Sunday is excluded from automatic attendance deductions', () => {
  assert.match(sql, /extract\(dow from v_today\)=0/i);
});

test('school calendar closures are excluded', () => {
  assert.match(sql, /attendance_date=v_today and ce\.is_working_day=false/i);
});

test('Saturday eligibility is respected', () => {
  assert.match(sql, /extract\(dow from v_today\)=6 and a\.saturday_required/i);
});

test('weekday schedule assignments are respected', () => {
  assert.match(sql, /s\.weekdays @> array\[extract\(dow from v_today\)::smallint\]/i);
});

test('automatic processor is not executable by browser roles', () => {
  assert.match(sql, /revoke all on function private\.finalize_staff_attendance_auto_deductions\(\) from public,anon,authenticated/i);
});

test('automatic decision records that the rule was applied without a leadership statement', () => {
  assert.match(sql, /Automatically applied under the Director-enabled attendance policy/i);
});

test('cron job creation is idempotent', () => {
  assert.match(sql, /if not exists \([\s\S]*?cron\.job[\s\S]*?finalize_staff_attendance_auto_deductions/i);
});

test('Director settings expose the automatic-deduction toggle', () => {
  assert.match(ui, /attendanceAutoDeductionEnabled/);
  assert.match(ui, /automatic_deductions_enabled:byId\('attendanceAutoDeductionEnabled'\)\.checked/);
});

test('Director settings load the saved automatic-deduction toggle', () => {
  assert.match(ui, /automatic_deductions_enabled/);
  assert.match(ui, /attendanceAutoDeductionEnabled'\)\.checked = result\.data\.automatic_deductions_enabled === true/);
});

test('staff are told deductions are for the next payroll run', () => {
  assert.match(ui, /next payroll run/i);
});

test('school-wide no-clock-in safeguard is explained in the Director settings', () => {
  assert.match(ui, /school-wide no-clock-in day is always held for leadership review/i);
});
