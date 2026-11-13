/* CORNHILL staff salary, Saturday attendance and Director-governed review controls.
   Salary decisions are deterministic database operations; this file never calls AI. */
(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const ugx = (value) => 'UGX ' + new Intl.NumberFormat('en-UG').format(Number(value || 0));
  const html = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const today = () => (typeof kampalaToday === 'function' ? kampalaToday() : new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala'}).format(new Date()));
  const isAdmin = () => typeof profile !== 'undefined' && profile && profile.role === 'Admin';
  const safeMessage = (id, text, error) => {
    if (typeof message === 'function') message(id, text, !!error);
    else {
      const el = byId(id);
      if (el) { el.textContent = text; el.classList.remove('hidden'); }
    }
  };

  function dailyRate(agreement, dateValue) {
    if (!agreement) return null;
    if (agreement.daily_rate_ugx != null && Number(agreement.daily_rate_ugx) > 0) return Number(agreement.daily_rate_ugx);
    const amount = Number(agreement.base_salary_ugx || 0);
    const date = new Date(String(dateValue || today()) + 'T12:00:00Z');
    if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return null;
    if (agreement.salary_basis === 'Monthly') {
      const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      return Math.round(amount / days);
    }
    if (agreement.salary_basis === 'Yearly') {
      const leap = new Date(Date.UTC(date.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
      return Math.round(amount / (leap ? 366 : 365));
    }
    return null; // Termly salary needs the Director/Bursar to enter its agreed daily rate.
  }

  function installSalaryProfilePanel() {
    const form = byId('staffProfileForm');
    if (!form || byId('staffSalaryProfilePanel')) return;
    form.insertAdjacentHTML('afterend',
      '<div class="card" id="staffSalaryProfilePanel" style="margin-top:16px;padding:16px">' +
        '<h3>Staff salary and attendance agreement</h3>' +
        '<p class="muted">The salary agreement is linked to this staff account. The same agreement supplies the daily rate used by the attendance review and payroll.</p>' +
        '<div id="staffSalaryProfileSummary" class="notice" role="status">Choose a staff account above to view its salary agreement.</div>' +
        '<form id="staffSalaryProfileForm">' +
          '<input type="hidden" name="staff_user_id" id="staffSalaryProfileUserId">' +
          '<div><label>Salary frequency *</label><select name="salary_basis" required><option>Monthly</option><option>Termly</option><option>Yearly</option></select></div>' +
          '<div><label>Agreed salary (UGX) *</label><input name="base_salary_ugx" type="number" min="1" step="1" required></div>' +
          '<div><label>Effective from *</label><input name="effective_from" type="date" required></div>' +
          '<div><label>Effective to (optional)</label><input name="effective_to" type="date"></div>' +
          '<div><label>Agreed daily rate (UGX)</label><input name="daily_rate_ugx" type="number" min="0" step="1" placeholder="Required for termly salary"></div>' +
          '<div class="full"><label>Agreement notes</label><input name="notes" maxlength="500" placeholder="Optional salary agreement notes"></div>' +
          '<div class="full"><button type="submit" class="primary" id="saveStaffSalaryAgreement">Save new salary agreement</button><p id="staffSalaryProfileHelp" class="muted" role="status"></p></div>' +
        '</form>' +
      '</div>'
    );

    const selector = byId('staffProfileSelect');
    if (selector) selector.addEventListener('change', () => loadSalaryProfile(selector.value));
    byId('staffSalaryProfileForm').addEventListener('submit', saveSalaryAgreement);
  }

  async function loadSalaryProfile(userId) {
    const panel = byId('staffSalaryProfilePanel');
    if (!panel || !isAdmin() || !userId || !db) return;
    const form = byId('staffSalaryProfileForm');
    const summary = byId('staffSalaryProfileSummary');
    const help = byId('staffSalaryProfileHelp');
    summary.textContent = 'Loading salary agreement…';
    const result = await db.from('staff_salary_agreements')
      .select('id,staff_user_id,salary_basis,base_salary_ugx,daily_rate_ugx,effective_from,effective_to,notes,is_active,created_at')
      .eq('staff_user_id', userId)
      .order('effective_from', {ascending:false})
      .limit(10);
    if (result.error) {
      summary.textContent = 'Salary information could not be loaded: ' + result.error.message;
      return;
    }
    const rows = result.data || [];
    const currentDate = today();
    const active = rows.find((x) => x.is_active && x.effective_from <= currentDate && (!x.effective_to || x.effective_to >= currentDate));
    byId('staffSalaryProfileUserId').value = userId;
    form.reset();
    byId('staffSalaryProfileUserId').value = userId;
    form.querySelector('[name="effective_from"]').value = currentDate;
    form.querySelector('[name="daily_rate_ugx"]').value = '';
    if (active) {
      const rate = dailyRate(active, currentDate);
      summary.innerHTML =
        '<strong>Current agreement</strong><br>' + html(active.salary_basis) + ' salary: ' + ugx(active.base_salary_ugx) +
        '<br>Daily attendance rate: ' + (rate ? ugx(rate) : 'Enter an agreed daily rate for this termly agreement') +
        '<br>Effective: ' + html(active.effective_from) + ' to ' + html(active.effective_to || 'ongoing') +
        '<br><span class="muted">Salary history is preserved. To replace an active agreement, close it in Finance → Staff Salary Agreements & Payroll before adding the next effective agreement.</span>';
      form.querySelectorAll('input,select,button').forEach((el) => { if (el.name !== 'staff_user_id') el.disabled = true; });
      help.textContent = 'An active agreement already covers today. It cannot be overwritten here because previous payroll records must remain auditable.';
    } else {
      form.querySelectorAll('input,select,button').forEach((el) => { el.disabled = false; });
      byId('staffSalaryProfileUserId').value = userId;
      summary.innerHTML = rows.length
        ? '<strong>No current agreement</strong><br>Previous salary agreements are preserved below. Add a new agreement with a non-overlapping effective date.'
        : '<strong>No salary agreement has been entered for this staff account.</strong>';
      help.textContent = 'For termly salaries, enter the daily rate agreed by the school so attendance deductions can be calculated correctly.';
    }
    if (rows.length) {
      summary.innerHTML += '<div style="margin-top:8px"><strong>Salary history</strong><ul style="margin:4px 0 0 18px">' +
        rows.map((x) => '<li>' + html(x.salary_basis) + ': ' + ugx(x.base_salary_ugx) + ' · ' + html(x.effective_from) + ' to ' + html(x.effective_to || 'ongoing') + (x.is_active ? ' · Active' : ' · Closed') + '</li>').join('') +
        '</ul></div>';
    }
  }

  async function saveSalaryAgreement(event) {
    event.preventDefault();
    if (!isAdmin() || demoMode) return;
    const form = new FormData(event.currentTarget);
    const userId = String(form.get('staff_user_id') || '');
    const basis = String(form.get('salary_basis') || '');
    const amount = Number(form.get('base_salary_ugx'));
    const from = String(form.get('effective_from') || '');
    const to = String(form.get('effective_to') || '') || null;
    const daily = form.get('daily_rate_ugx') === '' ? null : Number(form.get('daily_rate_ugx'));
    if (!userId || !from || !Number.isSafeInteger(amount) || amount <= 0 || (to && to < from)) {
      safeMessage('staffProfileMsg', 'Check the staff member, salary amount and effective dates.', true);
      return;
    }
    if (basis === 'Termly' && (!Number.isSafeInteger(daily) || daily <= 0)) {
      safeMessage('staffProfileMsg', 'A termly salary needs an agreed daily rate for attendance deductions.', true);
      return;
    }
    const existing = await db.from('staff_salary_agreements')
      .select('id')
      .eq('staff_user_id', userId)
      .eq('is_active', true)
      .lte('effective_from', to || '9999-12-31')
      .or('effective_to.is.null,effective_to.gte.' + from)
      .limit(1);
    if (existing.error) {
      safeMessage('staffProfileMsg', 'Existing salary agreements could not be checked: ' + existing.error.message, true);
      return;
    }
    if ((existing.data || []).length) {
      safeMessage('staffProfileMsg', 'This date overlaps an active salary agreement. Close the earlier agreement in Finance before saving a new one.', true);
      return;
    }
    const button = byId('saveStaffSalaryAgreement');
    button.disabled = true;
    const result = await db.from('staff_salary_agreements').insert({
      staff_user_id:userId,
      salary_basis:basis,
      base_salary_ugx:amount,
      daily_rate_ugx:daily,
      effective_from:from,
      effective_to:to,
      notes:String(form.get('notes') || '').trim() || null,
      created_by:currentUserId
    });
    button.disabled = false;
    if (result.error) {
      safeMessage('staffProfileMsg', 'Salary agreement was not saved: ' + result.error.message, true);
      return;
    }
    safeMessage('staffProfileMsg', 'Salary agreement saved. Attendance and payroll will use it for the matching effective dates.');
    await loadSalaryProfile(userId);
  }

  function installMySalaryCard() {
    const host = isAdmin() ? byId('attendanceAdmin') : byId('attendanceStaff');
    if (!host) return;
    let card = byId('myAttendanceSalarySummary');
    if (card && card.parentNode !== host) {
      const heading = host.querySelector('h3');
      host.insertBefore(card, heading || host.firstChild);
    }
    if (card) return;
    const heading = host.querySelector('h3');
    card = document.createElement('div');
    card.id = 'myAttendanceSalarySummary';
    card.className = 'card';
    card.style.cssText = 'padding:14px;margin:10px 0;border:1px solid #d7e5dc';
    card.innerHTML = '<strong>My salary and attendance deductions</strong><p class="muted">Loading your own salary details…</p>';
    host.insertBefore(card, heading || host.firstChild);
  }

  async function loadMySalarySummary() {
    const box = byId('myAttendanceSalarySummary');
    if (!box || !currentUserId || !db || demoMode) return;
    const [salaryResult, incidentResult, eventResult] = await Promise.all([
      db.from('staff_salary_agreements')
        .select('salary_basis,base_salary_ugx,daily_rate_ugx,effective_from,effective_to,is_active')
        .eq('staff_user_id', currentUserId).eq('is_active', true)
        .order('effective_from', {ascending:false}).limit(5),
      db.from('staff_attendance_incidents')
        .select('attendance_date,incident_type,status,approved_deduction_ugx,review_deadline_at,director_decision')
        .eq('staff_user_id', currentUserId)
        .order('attendance_date', {ascending:false}).limit(120),
      db.from('staff_attendance_events')
        .select('event_type,occurred_at,source,device_model')
        .eq('staff_user_id', currentUserId)
        .order('occurred_at', {ascending:false}).limit(160)
    ]);
    if (salaryResult.error) {
      box.innerHTML = '<strong>My attendance history</strong><p class="muted">Your attendance details are not available to this account yet. Ask the Director to check your staff account link.</p>';
      return;
    }
    const active = (salaryResult.data || []).find((x) => x.effective_from <= today() && (!x.effective_to || x.effective_to >= today()));
    const rate = active ? dailyRate(active, today()) : null;
    const incidents = incidentResult.error ? [] : (incidentResult.data || []);
    const events = eventResult.error ? [] : (eventResult.data || []);
    const pending = incidents.filter((x) => x.status === 'pending').length;
    const deductions = incidents.filter((x) => x.status === 'approved' || x.status === 'deducted')
      .reduce((total, x) => total + Number(x.approved_deduction_ugx || 0), 0);
    const dayKey = (value) => new Intl.DateTimeFormat('en-CA', {
      timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'
    }).format(new Date(value));
    const timeLabel = (value) => new Intl.DateTimeFormat('en-GB', {
      timeZone:'Africa/Kampala',hour:'2-digit',minute:'2-digit'
    }).format(new Date(value));
    const grouped = new Map();
    events.forEach((event) => {
      const day = dayKey(event.occurred_at);
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day).push(event);
    });
    const eventLabel = {clock_in:'Clocked in',break_start:'Break started',break_end:'Break ended',clock_out:'Clocked out'};
    const historyRows = [...grouped.keys()].sort((a,b) => b.localeCompare(a)).map((day) => {
      const dayEvents = (grouped.get(day) || []).slice().sort((a,b) => new Date(a.occurred_at)-new Date(b.occurred_at));
      const times = (type) => dayEvents.filter((x) => x.event_type === type).map((x) => timeLabel(x.occurred_at)).join(', ') || '—';
      const issues = incidents.filter((x) => x.attendance_date === day);
      const state = issues.length
        ? issues.map((x) => (x.incident_type || 'attendance issue').replace(/_/g,' ') + ' · ' + (x.director_decision || x.status)).join('; ')
        : (dayEvents.some((x) => x.event_type === 'clock_out') ? 'Completed' : 'In progress');
      return '<tr><td>' + html(day) + '</td><td>' + html(times('clock_in')) + '</td><td>' +
        html(times('break_start')) + '</td><td>' + html(times('break_end')) + '</td><td>' +
        html(times('clock_out')) + '</td><td>' + html(state) + '</td></tr>';
    });
    const clockInDays = new Set(events.filter((x) => x.event_type === 'clock_in').map((x) => dayKey(x.occurred_at)));
    const missedDays = new Set(incidents.filter((x) =>
      x.incident_type === 'missed_clock_in' && !clockInDays.has(x.attendance_date)
    ).map((x) => x.attendance_date)).size;
    const incidentRows = incidents.slice(0,40).map((x) =>
      '<tr><td>' + html(x.attendance_date) + '</td><td>' + html((x.incident_type || '').replace(/_/g,' ')) +
      '</td><td>' + html(x.director_decision || x.status) + '</td><td>' +
      html(x.approved_deduction_ugx ? ugx(x.approved_deduction_ugx) : '—') + '</td></tr>'
    );
    box.innerHTML = '<strong>My attendance history — view only</strong>' +
      '<p class="muted">This account cannot clock in, clock out or change attendance. All attendance events are recorded from the Director-controlled central kiosk or an approved office device.</p>' +
      (active
        ? '<p style="margin:7px 0">' + html(active.salary_basis) + ' agreed salary: <strong>' + ugx(active.base_salary_ugx) + '</strong></p>' +
          '<p style="margin:4px 0">Daily attendance rate: <strong>' + (rate ? ugx(rate) : 'Not configured — see the bursar/Director') + '</strong></p>' +
          '<p style="margin:4px 0">Effective period: ' + html(active.effective_from) + ' to ' + html(active.effective_to || 'ongoing') + '</p>'
        : '<p class="muted">No current salary agreement is linked to your account yet.</p>') +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:10px 0">' +
        '<div class="tile"><small>Missed days awaiting review</small><strong>' + missedDays + '</strong></div>' +
        '<div class="tile"><small>Pending attendance reviews</small><strong>' + pending + '</strong></div>' +
        '<div class="tile"><small>Director-approved deductions</small><strong>' + ugx(deductions) + '</strong></div>' +
      '</div>' +
      '<h4 style="margin:12px 0 6px">Daily attendance record</h4>' +
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Clock-in</th><th>Break start</th><th>Break end</th><th>Clock-out</th><th>Status</th></tr></thead><tbody>' +
      (historyRows.join('') || '<tr><td colspan="6">No attendance events have been recorded for this account yet.</td></tr>') +
      '</tbody></table></div>' +
      '<h4 style="margin:14px 0 6px">Attendance incidents and review decisions</h4>' +
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Incident</th><th>Decision / status</th><th>Approved deduction</th></tr></thead><tbody>' +
      (incidentRows.join('') || '<tr><td colspan="4">No attendance incidents recorded.</td></tr>') +
      '</tbody></table></div>' +
      '<small class="muted">Sunday is a paid rest day. Public holidays remain included in calendar-day salary calculations. Attendance history is read-only for staff accounts.</small>';
  }

  function installDirectorAttendancePanel() {
    const admin = byId('attendanceAdmin');
    if (!admin || byId('attendanceGovernancePanel')) return;
    const deductionToggle = byId('attendanceDeductionToggle');
    if (deductionToggle) {
      deductionToggle.checked = false;
      deductionToggle.disabled = true;
      deductionToggle.title = 'Automatic salary deductions are disabled. A Director decision is required.';
      const parent = deductionToggle.closest('.card');
      if (parent) {
        const state = byId('attendanceDeductionState');
        if (state) state.textContent = 'OFF — automatic deductions are disabled. A Headteacher/DOS statement and Director decision are required after the two-hour review window.';
      }
    }
    const oldIncidents = byId('attendanceIncidentRows');
    if (oldIncidents) {
      const oldWrap = oldIncidents.closest('.table-wrap');
      if (oldWrap) oldWrap.classList.add('hidden');
    }
    const anchor = byId('attendanceIncidentRows')?.closest('.table-wrap') || byId('attendanceAdmin').firstElementChild;
    const panel = document.createElement('section');
    panel.id = 'attendanceGovernancePanel';
    panel.className = 'card';
    panel.style.cssText = 'padding:16px;margin:14px 0;border:1px solid #d7e5dc';
    panel.innerHTML =
      '<div class="row" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0">Director attendance controls</h3><p class="muted" style="margin:4px 0">Two-hour review · Saturday P.3–P.7 · public holiday calendar · prep planning</p></div><span class="badge">Director approval only</span></div>' +
      '<form id="attendancePolicyForm" class="grid" style="margin-top:10px">' +
        '<div><label>Saturday start</label><input type="time" id="attendanceSaturdayStart" value="08:00" required></div>' +
        '<div><label>Saturday end</label><input type="time" id="attendanceSaturdayEnd" value="15:00" required></div>' +
        '<div><label>Review window</label><input type="number" value="120" disabled><small class="muted">Minutes · fixed two-hour protection</small></div>' +
        '<div><label>Prep deduction (UGX)</label><input type="number" min="0" step="1" id="attendancePrepDeduction" value="0"></div>' +
        '<div class="full"><label><input type="checkbox" id="attendancePrepEnabled"> Enable prep attendance/deduction policy when prep sessions are introduced</label></div>' +
        '<div class="full"><button type="submit" class="primary">Save Director attendance settings</button><span id="attendancePolicyStatus" class="muted" role="status"></span></div>' +
      '</form>' +
      '<hr style="border:0;border-top:1px solid #e5ece6;margin:16px 0">' +
      '<h4>Public holidays and school closure dates</h4>' +
      '<form id="attendanceCalendarExceptionForm" class="grid">' +
        '<div><label>Date *</label><input type="date" id="attendanceExceptionDate" required></div>' +
        '<div><label>Day type</label><select id="attendanceExceptionType"><option value="public_holiday">Public holiday</option><option value="school_closed">School closed</option><option value="special_working_day">Special working day</option></select></div>' +
        '<div><label>Attendance expected?</label><select id="attendanceExceptionWorking"><option value="false">No — paid, no absence deduction</option><option value="true">Yes — scheduled staff must attend</option></select></div>' +
        '<div><label>Reason / name</label><input id="attendanceExceptionNote" maxlength="300" placeholder="Public holiday name or reason"></div>' +
        '<div class="full"><button type="submit">Save calendar exception</button></div>' +
      '</form><div id="attendanceCalendarExceptionRows" class="muted">No calendar exceptions loaded.</div>' +
      '<hr style="border:0;border-top:1px solid #e5ece6;margin:16px 0">' +
      '<h4>Prep sessions — Director assignment</h4>' +
      '<p class="muted">Choose the date, class and teacher(s) who must attend. Prep deductions remain separate from normal daily attendance and are not posted by this normal-day process.</p>' +
      '<form id="staffPrepSessionForm" class="grid">' +
        '<div><label>Prep date *</label><input type="date" id="prepDate" required></div>' +
        '<div><label>Session title *</label><input id="prepTitle" maxlength="120" required placeholder="e.g. P.7 revision prep"></div>' +
        '<div><label>Class *</label><input id="prepClass" maxlength="60" required placeholder="P.7"></div>' +
        '<div><label>Teacher assigned *</label><select id="prepStaffUser" required><option value="">Choose teacher</option></select></div>' +
        '<div><label>Start time *</label><input type="time" id="prepStart" value="16:00" required></div>' +
        '<div><label>End time *</label><input type="time" id="prepEnd" value="18:00" required></div>' +
        '<div class="full"><label>Notes</label><input id="prepNotes" maxlength="500" placeholder="Optional Director instructions"></div>' +
        '<div class="full"><button type="submit" class="primary">Create prep session and assign teacher</button></div>' +
      '</form><div id="staffPrepSessionRows" class="muted">No prep sessions loaded.</div>' +
      '<hr style="border:0;border-top:1px solid #e5ece6;margin:16px 0">' +
      '<h4>Attendance decisions requiring the Director</h4>' +
      '<p class="muted">A deduction button stays unavailable until the two-hour review deadline passes and a Headteacher/DOS statement has been recorded. Excusing an incident creates no deduction.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Staff</th><th>Date</th><th>Issue</th><th>Headteacher / DOS statement</th><th>Decision deadline</th><th>Decision</th></tr></thead><tbody id="governanceIncidentRows"><tr><td colspan="6">Loading attendance reviews…</td></tr></tbody></table></div>';
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else admin.appendChild(panel);
  }

  async function loadDirectorSettings() {
    const result = await db.from('staff_attendance_policy_settings')
      .select('review_window_minutes,saturday_start_time,saturday_end_time,prep_enabled,prep_deduction_ugx')
      .eq('id', true).single();
    if (result.error) {
      safeMessage('attendanceMsg', 'Director attendance settings could not be loaded: ' + result.error.message, true);
      return;
    }
    byId('attendanceSaturdayStart').value = String(result.data.saturday_start_time || '08:00').slice(0,5);
    byId('attendanceSaturdayEnd').value = String(result.data.saturday_end_time || '15:00').slice(0,5);
    byId('attendancePrepEnabled').checked = result.data.prep_enabled === true;
    byId('attendancePrepDeduction').value = Number(result.data.prep_deduction_ugx || 0);
    const msg = byId('attendancePolicyStatus');
    if (msg) msg.textContent = 'Two-hour review window is active.';
  }

  async function loadCalendarExceptions() {
    const host = byId('attendanceCalendarExceptionRows');
    if (!host) return;
    const result = await db.from('staff_attendance_calendar_exceptions')
      .select('attendance_date,exception_type,is_working_day,note')
      .order('attendance_date',{ascending:false}).limit(60);
    if (result.error) { host.textContent = 'Calendar exceptions could not load: ' + result.error.message; return; }
    host.innerHTML = (result.data || []).map((x) =>
      '<div style="padding:7px;border-bottom:1px solid #eee"><strong>' + html(x.attendance_date) + '</strong> · ' +
      html(x.exception_type.replace(/_/g,' ')) + ' · ' + (x.is_working_day ? 'attendance expected' : 'paid / no absence deduction') +
      (x.note ? ' · ' + html(x.note) : '') + '</div>'
    ).join('') || 'No calendar exceptions recorded.';
  }

  async function loadPrepSessions() {
    const host = byId('staffPrepSessionRows');
    if (!host) return;
    const [sessions, assignments] = await Promise.all([
      db.from('staff_prep_sessions').select('id,prep_date,title,start_time,end_time,class_name,notes,is_published').order('prep_date',{ascending:false}).limit(80),
      db.from('staff_prep_assignments').select('prep_session_id,staff_user_id,user_profiles(full_name)').limit(200)
    ]);
    if (sessions.error || assignments.error) {
      host.textContent = 'Prep sessions could not load: ' + ((sessions.error || assignments.error).message || 'Database request failed');
      return;
    }
    const assigned = {};
    (assignments.data || []).forEach((x) => {
      assigned[x.prep_session_id] = assigned[x.prep_session_id] || [];
      assigned[x.prep_session_id].push(x.user_profiles?.full_name || 'Staff member');
    });
    host.innerHTML = (sessions.data || []).map((x) =>
      '<div style="padding:8px;border-bottom:1px solid #eee"><strong>' + html(x.prep_date) + ' · ' + html(x.class_name) + '</strong> — ' +
      html(x.title) + ' · ' + html(String(x.start_time).slice(0,5)) + '–' + html(String(x.end_time).slice(0,5)) +
      '<br><small>Assigned: ' + html((assigned[x.id] || []).join(', ') || 'No teacher assigned') + '</small>' +
      (x.notes ? '<br><small>' + html(x.notes) + '</small>' : '') + '</div>'
    ).join('') || 'No prep sessions have been created.';
  }

  async function loadGovernanceIncidents() {
    const host = byId('governanceIncidentRows');
    if (!host) return;
    const result = await db.from('staff_attendance_incidents')
      .select('id,staff_user_id,attendance_date,incident_type,status,headteacher_statement,review_deadline_at,director_decision,approved_deduction_ugx,user_profiles(full_name)')
      .order('attendance_date',{ascending:false}).limit(150);
    if (result.error) { host.innerHTML = '<tr><td colspan="6">Attendance reviews could not load: ' + html(result.error.message) + '</td></tr>'; return; }
    const rows = result.data || [];
    host.innerHTML = rows.map((x) => {
      const deadline = x.review_deadline_at ? new Date(x.review_deadline_at) : null;
      const reviewEnded = deadline && deadline.getTime() <= Date.now();
      const canDeduct = x.status === 'pending' && !x.director_decision && reviewEnded && String(x.headteacher_statement || '').trim().length >= 8;
      const decision = x.director_decision === 'excused' ? 'Excused — no deduction' :
        x.director_decision === 'deduct' ? 'Deduction approved: ' + ugx(x.approved_deduction_ugx) : x.status;
      const buttons = x.status === 'pending' && !x.director_decision
        ? '<button type="button" data-governance-decision="excused" data-incident-id="' + x.id + '">Excuse / no deduction</button> ' +
          '<button type="button" class="primary" data-governance-decision="deduct" data-incident-id="' + x.id + '" ' + (canDeduct ? '' : 'disabled') + '>Approve deduction</button>'
        : '—';
      return '<tr><td>' + html(x.user_profiles?.full_name || 'Staff') + '</td><td>' + html(x.attendance_date) + '</td><td>' +
        html(x.incident_type.replace(/_/g,' ')) + '</td><td>' + html(x.headteacher_statement || 'Awaiting Headteacher/DOS statement') +
        '</td><td>' + html(deadline ? deadline.toLocaleString('en-UG',{timeZone:'Africa/Kampala'}) : 'Not set') +
        '</td><td>' + html(decision) + '<br>' + buttons + '</td></tr>';
    }).join('') || '<tr><td colspan="6">No attendance incidents recorded.</td></tr>';
  }

  async function loadLeadershipStatementPanel() {
    const panel = byId('attendanceLeadershipStatementPanel');
    if (!panel || !currentUserId || !db) return;
    const check = await db.rpc('is_attendance_lead');
    if (check.error || check.data !== true) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const result = await db.from('staff_attendance_incidents')
      .select('id,staff_user_id,attendance_date,incident_type,user_profiles(full_name)')
      .eq('status','pending').is('director_decision',null)
      .order('attendance_date',{ascending:false}).limit(100);
    if (result.error) {
      byId('leadIncidentSelect').innerHTML = '<option value="">Could not load incidents</option>';
      return;
    }
    byId('leadIncidentSelect').innerHTML = '<option value="">Choose an attendance incident</option>' +
      (result.data || []).map((x) => '<option value="' + x.id + '">' +
        html(x.user_profiles?.full_name || 'Staff') + ' · ' + html(x.attendance_date) + ' · ' +
        html(x.incident_type.replace(/_/g,' ')) + '</option>').join('');
  }

  function installLeadershipStatementPanel() {
    const host = byId('attendanceStaff');
    if (!host || byId('attendanceLeadershipStatementPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'attendanceLeadershipStatementPanel';
    panel.className = 'card hidden';
    panel.style.cssText = 'padding:14px;margin:14px 0;border:1px solid #d7e5dc';
    panel.innerHTML =
      '<h3>Headteacher / DOS attendance statement</h3>' +
      '<p class="muted">This leadership-only form records the school explanation for a pending missed clock-in or clock-out. The Director makes the final salary decision.</p>' +
      '<form id="attendanceLeadershipStatementForm">' +
        '<label>Attendance incident *</label><select id="leadIncidentSelect" required><option value="">Loading incidents…</option></select>' +
        '<label>Leadership statement *</label><textarea id="leadIncidentStatement" rows="3" minlength="8" maxlength="1500" required placeholder="Record the reason confirmed by the school."></textarea>' +
        '<button type="submit" class="primary">Submit Headteacher / DOS statement</button>' +
        '<p id="leadIncidentStatus" class="muted" role="status"></p>' +
      '</form>';
    const first = host.querySelector('h3');
    host.insertBefore(panel, first || host.firstChild);
    panel.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const incidentId = byId('leadIncidentSelect').value;
      const statement = byId('leadIncidentStatement').value.trim();
      if (!incidentId || statement.length < 8) return;
      const result = await db.rpc('staff_submit_attendance_statement', {
        p_incident_id:incidentId,
        p_statement:statement
      });
      if (result.error) {
        byId('leadIncidentStatus').textContent = 'Statement was not saved: ' + result.error.message;
        return;
      }
      byId('leadIncidentStatus').textContent = 'Statement saved for the Director to review.';
      byId('leadIncidentStatement').value = '';
      await loadLeadershipStatementPanel();
    });
  }

  function installAttendancePanels() {
    installMySalaryCard();
    installDirectorAttendancePanel();
    installLeadershipStatementPanel();
  }

  function captureScheduleForm() {
    const form = byId('workScheduleForm');
    if (!form || form.dataset.saturdayCapture === '1') return;
    form.dataset.saturdayCapture = '1';
    form.insertAdjacentHTML('beforeend',
      '<div><label>Saturday start (P.3–P.7 teachers)</label><input type="time" name="saturday_start_time" value="08:00"></div>' +
      '<div><label>Saturday end (P.3–P.7 teachers)</label><input type="time" name="saturday_end_time" value="15:00"></div>' +
      '<p class="muted full">Teachers assigned to P.3, P.4, P.5, P.6 or P.7 are automatically marked Saturday-required when their attendance schedule is assigned.</p>'
    );
    form.addEventListener('submit', () => {
      window.cornhillPendingSaturdaySchedule = {
        name:String(form.elements.name.value || '').trim(),
        startTime:String(form.elements.saturday_start_time.value || '08:00'),
        endTime:String(form.elements.saturday_end_time.value || '15:00'),
        submittedAt:Date.now()
      };
    }, true);
  }

  async function patchNewSaturdaySchedule() {
    const pending = window.cornhillPendingSaturdaySchedule;
    if (!pending || !pending.name || !isAdmin()) return false;
    window.cornhillPendingSaturdaySchedule = null;
    const result = await db.from('staff_work_schedules')
      .select('id,created_at')
      .eq('name',pending.name)
      .eq('created_by',currentUserId)
      .gte('created_at',new Date(pending.submittedAt - 15000).toISOString())
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (result.error || !result.data?.id) return false;
    const updated = await db.from('staff_work_schedules').update({
      saturday_start_time:pending.startTime,
      saturday_end_time:pending.endTime
    }).eq('id',result.data.id);
    return !updated.error;
  }

  async function hydrateAttendanceExtras() {
    if (!currentUserId || !db || demoMode) return;
    installAttendancePanels();
    if (isAdmin()) {
      const director = await db.rpc('is_school_director');
      const isDirector = !director.error && director.data === true;
      const panel = byId('attendanceGovernancePanel');
      if (panel) panel.classList.toggle('hidden', !isDirector);
      if (isDirector) {
        await loadDirectorSettings();
        await loadCalendarExceptions();
        await loadPrepSessions();
        await loadGovernanceIncidents();
        const staff = await db.from('user_profiles').select('id,full_name').eq('employment_status','Active').order('full_name');
        if (!staff.error) {
          byId('prepStaffUser').innerHTML = '<option value="">Choose teacher</option>' +
            (staff.data || []).map((x) => '<option value="' + x.id + '">' + html(x.full_name || 'Staff') + '</option>').join('');
        }
      }
      await loadMySalarySummary();
      return;
    }
    await loadMySalarySummary();
    await loadLeadershipStatementPanel();
  }

  function installDirectorEventHandlers() {
    byId('attendancePolicyForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!isAdmin()) return;
      const start = byId('attendanceSaturdayStart').value;
      const end = byId('attendanceSaturdayEnd').value;
      if (!start || !end || end <= start) {
        safeMessage('attendancePolicyStatus','Saturday end time must be after its start time.',true);
        return;
      }
      const result = await db.from('staff_attendance_policy_settings').update({
        saturday_start_time:start,
        saturday_end_time:end,
        review_window_minutes:120,
        prep_enabled:byId('attendancePrepEnabled').checked,
        prep_deduction_ugx:Number(byId('attendancePrepDeduction').value || 0),
        updated_by:currentUserId,
        updated_at:new Date().toISOString()
      }).eq('id',true);
      safeMessage('attendancePolicyStatus',result.error ? 'Settings were not saved: ' + result.error.message : 'Director attendance settings saved.',!!result.error);
    });

    byId('attendanceCalendarExceptionForm')?.addEventListener('submit',async (event) => {
      event.preventDefault();
      if (!isAdmin()) return;
      const date = byId('attendanceExceptionDate').value;
      if (!date) return;
      const result = await db.from('staff_attendance_calendar_exceptions').upsert({
        attendance_date:date,
        exception_type:byId('attendanceExceptionType').value,
        is_working_day:byId('attendanceExceptionWorking').value === 'true',
        note:byId('attendanceExceptionNote').value.trim() || null,
        created_by:currentUserId
      },{onConflict:'attendance_date'});
      if (result.error) safeMessage('attendanceMsg','Calendar date was not saved: ' + result.error.message,true);
      else {
        byId('attendanceCalendarExceptionForm').reset();
        await loadCalendarExceptions();
        safeMessage('attendanceMsg','Attendance calendar exception saved.');
      }
    });

    byId('staffPrepSessionForm')?.addEventListener('submit',async (event) => {
      event.preventDefault();
      if (!isAdmin()) return;
      const prepDate = byId('prepDate').value;
      const title = byId('prepTitle').value.trim();
      const className = byId('prepClass').value.trim();
      const staffId = byId('prepStaffUser').value;
      const start = byId('prepStart').value;
      const end = byId('prepEnd').value;
      if (!prepDate || !title || !className || !staffId || !start || !end || end <= start) {
        safeMessage('attendanceMsg','Complete the prep date, class, teacher and valid start/end times.',true);
        return;
      }
      const session = await db.from('staff_prep_sessions').insert({
        prep_date:prepDate,title,start_time:start,end_time:end,class_name:className,
        notes:byId('prepNotes').value.trim() || null,is_published:true,created_by:currentUserId
      }).select('id').single();
      if (session.error) {
        safeMessage('attendanceMsg','Prep session was not saved: ' + session.error.message,true);
        return;
      }
      const assignment = await db.from('staff_prep_assignments').insert({
        prep_session_id:session.data.id,staff_user_id:staffId,assigned_by:currentUserId
      });
      if (assignment.error) {
        safeMessage('attendanceMsg','Prep session was saved, but teacher assignment failed: ' + assignment.error.message,true);
        await loadPrepSessions();
        return;
      }
      byId('staffPrepSessionForm').reset();
      await loadPrepSessions();
      safeMessage('attendanceMsg','Prep session created and assigned. Prep penalties remain separate from normal daily attendance.');
    });

    byId('governanceIncidentRows')?.addEventListener('click',async (event) => {
      const button = event.target.closest('[data-governance-decision]');
      if (!button || !isAdmin()) return;
      const decision = button.dataset.governanceDecision;
      const incidentId = button.dataset.incidentId;
      if (!incidentId || !['excused','deduct'].includes(decision)) return;
      if (decision === 'deduct' && !confirm('The two-hour review window has ended and the Headteacher/DOS statement is recorded. Approve the calculated daily-rate deduction?')) return;
      button.disabled = true;
      const result = await db.rpc('director_decide_staff_attendance_incident',{
        p_incident_id:incidentId,
        p_decision:decision,
        p_review_note:null
      });
      if (result.error) {
        button.disabled = false;
        safeMessage('attendanceMsg','Director decision was not saved: ' + result.error.message,true);
        return;
      }
      await loadGovernanceIncidents();
      safeMessage('attendanceMsg',decision === 'excused'
        ? 'Incident excused. No salary deduction will be added.'
        : 'Director-approved daily-rate deduction is ready for the next payroll preparation.');
    });
  }

  // Attach the additional controls after the main page has parsed.
  installSalaryProfilePanel();
  installAttendancePanels();
  captureScheduleForm();
  installDirectorEventHandlers();

  // Main app functions are wrapped, not replaced: existing school workflows still run first.
  if (typeof loadStaffProfiles === 'function') {
    const originalLoadStaffProfiles = loadStaffProfiles;
    loadStaffProfiles = async function () {
      await originalLoadStaffProfiles();
      if (isAdmin() && byId('staffProfileSelect')?.value) {
        await loadSalaryProfile(byId('staffProfileSelect').value);
      }
    };
  }

  if (typeof setupAttendance === 'function') {
    const originalSetupAttendance = setupAttendance;
    setupAttendance = async function () {
      await originalSetupAttendance();
      const changed = await patchNewSaturdaySchedule();
      if (changed) await originalSetupAttendance();
      await hydrateAttendanceExtras();
    };
  }

  // Keep the additional staff profile panel in step with the selected account.
  if (byId('staffProfileSelect')) {
    byId('staffProfileSelect').addEventListener('change', () => loadSalaryProfile(byId('staffProfileSelect').value));
  }
})();
