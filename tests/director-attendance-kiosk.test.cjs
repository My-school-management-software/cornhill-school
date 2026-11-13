const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const attendanceUi = fs.readFileSync(path.join(root, 'assets', 'cornhill-staff-attendance-salary.js'), 'utf8');
const attendanceSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261113135418_director_only_attendance_kiosk_controls.sql'), 'utf8');

test('legacy staff self-clock special-session RPC is revoked', () => {
  assert.match(attendanceSql, /revoke all on function public\.staff_record_scheduled_session_event\(uuid,text\) from public,anon,authenticated/i);
});

test('new normal-attendance RPC requires the Director predicate', () => {
  assert.match(attendanceSql, /function public\.director_record_staff_attendance_event[\s\S]*?if not public\.is_school_director\(\) then/i);
});

test('new special-session RPC requires the Director predicate', () => {
  assert.match(attendanceSql, /function public\.director_record_staff_session_event[\s\S]*?if not public\.is_school_director\(\) then/i);
});

test('event insertion policy is Director-only and attributes the Director as recorder', () => {
  assert.match(attendanceSql, /create policy "Director records attendance events"[\s\S]*?public\.is_school_director\(\)[\s\S]*?recorded_by = \(select auth\.uid\(\)\)/i);
});

test('normal attendance accepts only clock, break-start and break-end event types', () => {
  assert.match(attendanceSql, /p_event_type not in \('clock_in','break_start','break_end','clock_out'\)/i);
});

test('a staff day must begin with clock-in', () => {
  assert.match(attendanceSql, /if v_last_event is null then\s+if p_event_type <> 'clock_in' then\s+raise exception 'Record clock-in first.'/i);
});

test('break start requires clock-in or a previous ended break', () => {
  assert.match(attendanceSql, /p_event_type = 'break_start' and v_last_event not in \('clock_in','break_end'\)/i);
});

test('break end requires an open break', () => {
  assert.match(attendanceSql, /p_event_type = 'break_end' and v_last_event <> 'break_start'/i);
});

test('clock-out cannot close an open break', () => {
  assert.match(attendanceSql, /p_event_type = 'clock_out' and v_last_event not in \('clock_in','break_end'\)/i);
});

test('normal kiosk events are stamped with Director and kiosk source details', () => {
  assert.match(attendanceSql, /'Director-controlled office kiosk','CORNHILL-DIRECTOR-KIOSK',\(select auth\.uid\(\)\)/i);
});

test('special session events require an approved and published session', () => {
  assert.match(attendanceSql, /approval_status = 'approved'[\s\S]*?is_published = true/i);
});

test('special session events require a staff assignment', () => {
  assert.match(attendanceSql, /where a\.session_id = p_session_id\s+and a\.staff_user_id = p_staff_user_id/i);
});

test('staff personal summary loads only that staff member attendance events', () => {
  assert.match(attendanceUi, /from\('staff_attendance_events'\)[\s\S]*?eq\('staff_user_id', currentUserId\)/i);
});

test('staff personal summary displays read-only attendance history', () => {
  assert.match(attendanceUi, /My attendance history — view only/);
  assert.match(attendanceUi, /This account cannot clock in, clock out or change attendance/);
});

test('daily history shows all four regular attendance event types', () => {
  for (const name of ['clock_in','break_start','break_end','clock_out']) {
    assert.ok(attendanceUi.includes("times('" + name + "')"), 'missing ' + name);
  }
});

test('staff summary counts missed days without treating late arrivals as full missed days', () => {
  assert.match(attendanceUi, /missedDays = new Set\(incidents\.filter/);
  assert.match(attendanceUi, /!clockInDays\.has\(x\.attendance_date\)/);
});

test('staff personal history includes special session attendance', () => {
  assert.match(attendanceUi, /from\('staff_scheduled_session_attendance'\)[\s\S]*?eq\('staff_user_id', currentUserId\)/i);
  assert.match(attendanceUi, /Special prep, morning winter and Saturday sessions/);
});

test('central kiosk controls live inside the Director attendance panel', () => {
  assert.match(attendanceUi, /function installDirectorAttendancePanel\(\)[\s\S]*?id="directorAttendanceKioskForm"/);
  assert.match(attendanceUi, /id="directorKioskEvent"/);
});

test('normal kiosk form invokes only the Director attendance RPC', () => {
  assert.match(attendanceUi, /rpc\('director_record_staff_attendance_event'[\s\S]*?p_staff_user_id:staffId,p_event_type:eventType/);
});

test('special-session kiosk form invokes the Director-only special-session RPC', () => {
  assert.match(attendanceUi, /rpc\('director_record_staff_session_event'[\s\S]*?p_session_id:sessionId,p_staff_user_id:staffId,p_event_type:eventType/);
});

test('Director panel stays hidden for an Admin account that is not the school Director', () => {
  assert.match(attendanceUi, /const director = await db\.rpc\('is_school_director'\)[\s\S]*?panel\.classList\.toggle\('hidden', !isDirector\)/);
});

test('attendance script parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(attendanceUi));
});
