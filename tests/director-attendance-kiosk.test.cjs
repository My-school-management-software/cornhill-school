const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const attendanceUi = fs.readFileSync(path.join(root, 'assets', 'cornhill-staff-attendance-salary.js'), 'utf8');
const attendanceSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261113135418_director_only_attendance_kiosk_controls.sql'), 'utf8');
const hardeningSql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261113142000_attendance_kiosk_sequence_and_active_staff_hardening.sql'), 'utf8');

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

test('follow-up migration rejects missing staff and null/unknown event values', () => {
  assert.match(hardeningSql, /p_staff_user_id is null/);
  assert.match(hardeningSql, /p_event_type is null or p_event_type not in/);
});

test('follow-up migration refuses attendance for inactive staff accounts', () => {
  assert.match(hardeningSql, /where p\.id = p_staff_user_id and p\.employment_status = 'Active'[\s\S]*?if not found then raise exception 'The selected staff account is not active.'/i);
});

test('normal attendance cannot be reopened after clock-out on the same school day', () => {
  assert.match(hardeningSql, /elsif v_last_event = 'clock_out' then\s+raise exception 'Attendance is already closed for this staff member today.'/i);
});

test('special-session recording validates active staff as well as assignment', () => {
  assert.match(hardeningSql, /director_record_staff_session_event[\s\S]*?where p\.id = p_staff_user_id and p\.employment_status = 'Active'[\s\S]*?The selected staff account is not active/i);
});

test('special-session form offers all three school session types', () => {
  for (const type of ['evening_prep','morning_winter','saturday_study']) {
    assert.ok(attendanceUi.includes('value="' + type + '"'), 'missing session type ' + type);
  }
});

test('Saturday study is fixed to 8 AM to 1 PM in the Director form', () => {
  assert.match(attendanceUi, /sessionType === 'saturday_study'[\s\S]*?start !== '08:00' \|\| end !== '13:00'/);
  assert.match(attendanceUi, /Saturday study sessions must run from 8:00 AM to 1:00 PM/);
});

test('Director can assign multiple teachers to a special session', () => {
  assert.match(attendanceUi, /id="prepStaffUser" multiple/);
  assert.match(attendanceUi, /selectedOptions[\s\S]*?staffIds/);
  assert.match(attendanceUi, /const assignmentRows = staffIds\.map/);
});

test('special sessions start as drafts and require Director approval before kiosk use', () => {
  assert.match(attendanceUi, /approval_status:'draft',is_published:false/);
  assert.match(attendanceUi, /rpc\('director_approve_staff_session'/);
  assert.match(attendanceUi, /Approve and publish/);
});

test('special-session kiosk offers only staff assigned to the selected session', () => {
  assert.match(attendanceUi, /from\('staff_prep_assignments'\)[\s\S]*?eq\('prep_session_id',sessionId\)/);
  assert.match(attendanceUi, /loadDirectorSessionStaffOptions/);
});

test('special-session attendance is inserted for every assigned teacher only after approval', () => {
  assert.match(hardeningSql, /insert into public\.staff_scheduled_session_attendance[\s\S]*?select p_session_id,a\.staff_user_id[\s\S]*?from public\.staff_prep_assignments a/);
});

test('both Director kiosk RPCs are guarded against non-Director callers', () => {
  assert.match(hardeningSql, /revoke all on function public\.director_record_staff_attendance_event\(uuid,text\) from public,anon/);
  assert.match(hardeningSql, /revoke all on function public\.director_record_staff_session_event\(uuid,uuid,text\) from public,anon/);
  assert.equal((hardeningSql.match(/if not public\.is_school_director\(\) then/g) || []).length, 2);
});

test('the hardened normal and special-session SQL functions are included in the follow-up migration', () => {
  assert.match(hardeningSql, /create or replace function public\.director_record_staff_attendance_event/);
  assert.match(hardeningSql, /create or replace function public\.director_record_staff_session_event/);
});
