/* CORNHILL learner details completion sheet.
 * Administrator-only roster editor. Writes through the existing Learner Register
 * form so admission validation, permanent pupil-code rules and database permissions
 * remain in one place.
 */
(function () {
  'use strict';

  const htmlEscape = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const fmtDate = value => {
    if (!value) return 'Not recorded';
    const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-UG');
  };
  const fieldNames = [
    'first_name', 'middle_name', 'last_name', 'gender', 'birth_year',
    'date_of_birth', 'lin', 'p7_index_number', 'guardian_name',
    'guardian_relationship', 'guardian_phone', 'guardian_email',
    'alternate_guardian_name', 'alternate_guardian_phone', 'address',
    'guardian_whatsapp_phone'
  ];

  const css = [
    '#learnerDetailsWorkspace{margin:14px 0 18px;padding:clamp(14px,1.8vw,22px);border:1px solid var(--cornhill-line,#dce7de);border-radius:18px;background:var(--cornhill-panel,#fff);box-shadow:0 6px 20px rgba(20,55,34,.045)}',
    '#students .lds-legacy-collapsed{display:none!important}',
    '#learnerDetailsWorkspace .lds-kicker{font-size:10px;font-weight:900;letter-spacing:.13em;color:var(--cornhill-accent,#176b48)}',
    '#learnerDetailsWorkspace .lds-intro{max-width:880px;margin:4px 0 0;color:var(--cornhill-muted,#647568);font-size:13px;line-height:1.5}',
    '#learnerDetailsWorkspace .lds-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:14px 0}',
    '#learnerDetailsWorkspace .lds-metric{min-width:0;padding:12px;border:1px solid var(--cornhill-line,#dce7de);border-radius:13px;background:color-mix(in srgb,var(--cornhill-panel,#fff) 88%,var(--cornhill-page,#f4f7f4))}',
    '#learnerDetailsWorkspace .lds-metric strong{display:block;font-size:clamp(20px,2vw,27px);line-height:1.1;color:var(--cornhill-ink,#17251c);font-variant-numeric:tabular-nums}',
    '#learnerDetailsWorkspace .lds-metric span{display:block;margin-top:5px;font-size:11px;color:var(--cornhill-muted,#647568)}',
    '#learnerDetailsWorkspace .lds-toolbar{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0}',
    '#learnerDetailsWorkspace .lds-toolbar label{display:block;font-size:12px;font-weight:750;margin:0 0 5px}',
    '#learnerDetailsWorkspace .lds-toolbar select{min-width:220px;margin:0}',
    '#learnerDetailsWorkspace .lds-table-wrap{width:100%;overflow-x:auto;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;border:1px solid var(--cornhill-line,#dce7de);border-radius:12px}',
    '#learnerDetailsWorkspace table{width:100%;min-width:940px;border-collapse:collapse;font-size:12px}',
    '#learnerDetailsWorkspace th,#learnerDetailsWorkspace td{padding:10px 11px;text-align:left;vertical-align:top;border-bottom:1px solid var(--cornhill-line,#dce7de);overflow-wrap:anywhere}',
    '#learnerDetailsWorkspace th{position:sticky;top:0;background:var(--cornhill-page,#f4f7f4);color:var(--cornhill-muted,#647568);font-size:10px;text-transform:uppercase;letter-spacing:.05em}',
    '#learnerDetailsWorkspace tbody tr{cursor:pointer}',
    '#learnerDetailsWorkspace tbody tr:hover{background:color-mix(in srgb,var(--cornhill-accent,#176b48) 5%,var(--cornhill-panel,#fff))}',
    '#learnerDetailsWorkspace tbody tr:last-child td{border-bottom:0}',
    '#learnerDetailsWorkspace .lds-name{font-weight:850;color:var(--cornhill-ink,#17251c)}',
    '#learnerDetailsWorkspace .lds-sub{display:block;margin-top:3px;color:var(--cornhill-muted,#647568);font-size:11px}',
    '#learnerDetailsWorkspace .lds-state{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:800;background:#ecfdf3;color:#166534;white-space:nowrap}',
    '#learnerDetailsWorkspace .lds-state.pending{background:#fff7e6;color:#92400e}',
    '#learnerDetailsWorkspace .lds-open{padding:7px 10px;border:1px solid var(--cornhill-line,#dce7de);border-radius:9px;background:var(--cornhill-panel,#fff);color:var(--cornhill-accent-dark,#14532d);font-size:11px;font-weight:850}',
    '#learnerDetailsEditor{margin:14px 0 18px;padding:clamp(15px,2vw,24px);border:1px solid var(--cornhill-line,#dce7de);border-left:4px solid var(--cornhill-accent,#176b48);border-radius:17px;background:var(--cornhill-panel,#fff)}',
    '#learnerDetailsEditor .lds-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '#learnerDetailsEditor .lds-editor-head h3{margin:3px 0 4px}',
    '#learnerDetailsEditor .lds-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:14px}',
    '#learnerDetailsEditor .lds-field{min-width:0}',
    '#learnerDetailsEditor .lds-field.full{grid-column:1/-1}',
    '#learnerDetailsEditor .lds-field label{display:block;font-size:12px;font-weight:800;margin:0 0 5px}',
    '#learnerDetailsEditor .lds-field input,#learnerDetailsEditor .lds-field select{width:100%;min-width:0;margin:0}',
    '#learnerDetailsEditor .lds-hint{font-size:11px;line-height:1.45;color:var(--cornhill-muted,#647568);margin-top:5px}',
    '#learnerDetailsEditor .lds-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}',
    '#learnerDetailsEditor .lds-note{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--cornhill-page,#f4f7f4);font-size:12px;line-height:1.5;color:var(--cornhill-muted,#647568)}',
    '#learnerDetailsEditor .lds-checkbox{display:flex;gap:8px;align-items:flex-start;font-size:12px;font-weight:650}',
    '#learnerDetailsEditor .lds-checkbox input{width:17px;height:17px;flex:0 0 auto;margin:1px 0 0}',
    '@media(max-width:900px){#learnerDetailsWorkspace .lds-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '@media(max-width:620px){#learnerDetailsWorkspace .lds-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#learnerDetailsEditor .lds-editor-grid{grid-template-columns:1fr}#learnerDetailsEditor .lds-field.full{grid-column:auto}#learnerDetailsWorkspace .lds-toolbar select{width:100%;min-width:0}}',
    '@media print{body.lds-print-mode #app *{visibility:hidden!important}body.lds-print-mode #learnerDetailsWorkspace,body.lds-print-mode #learnerDetailsWorkspace *{visibility:visible!important}body.lds-print-mode #learnerDetailsWorkspace{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;box-shadow:none!important;border:0!important}body.lds-print-mode #learnerDetailsWorkspace .lds-toolbar button,body.lds-print-mode #learnerDetailsWorkspace .lds-open{display:none!important}body.lds-print-mode #learnerDetailsWorkspace table{min-width:0!important;font-size:9px!important}body.lds-print-mode #learnerDetailsWorkspace th,body.lds-print-mode #learnerDetailsWorkspace td{padding:5px!important}}'
  ].join('\n');

  function state() {
    try {
      return {
        role: typeof profile !== 'undefined' && profile ? profile.role : null,
        students: typeof students !== 'undefined' && Array.isArray(students) ? students : [],
        classes: typeof classes !== 'undefined' && Array.isArray(classes) ? classes : [],
        classFilter: typeof studentRegisterClassFilter !== 'undefined' ? studentRegisterClassFilter : 'all',
        userId: typeof currentUserId !== 'undefined' ? currentUserId : null,
        demo: typeof demoMode !== 'undefined' ? demoMode : false
      };
    } catch (_) {
      return { role: null, students: [], classes: [], classFilter: 'all', userId: null, demo: false };
    }
  }

  function install() {
    const studentsPanel = document.getElementById('students');
    const anchor = document.getElementById('studentRegisterFilterLabel');
    const rowsHost = document.getElementById('studentRows');
    if (!studentsPanel || !anchor || !rowsHost || document.getElementById('learnerDetailsWorkspace')) return;

    const style = document.createElement('style');
    style.id = 'cornhill-learner-details-sheet-style';
    style.textContent = css;
    document.head.appendChild(style);

    anchor.insertAdjacentHTML('afterend',
      '<section id="learnerDetailsWorkspace" aria-labelledby="learnerDetailsHeading">' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
          '<div><div class="lds-kicker">CLASS-BY-CLASS INFORMATION DESK</div><h3 id="learnerDetailsHeading" style="margin:4px 0">Learner information completion sheet</h3>' +
          '<p class="lds-intro">All learners in the selected class appear together below. Select any learner to complete their date of birth, verified birth year, parent / guardian names and contact details without leaving this register.</p></div>' +
          '<div class="row" style="gap:7px;flex-wrap:wrap"><button type="button" id="learnerDetailsAdvancedToggle" class="tab" aria-expanded="false">Show advanced register actions</button><button type="button" id="learnerDetailsExport" class="tab">Export class sheet</button><button type="button" id="learnerDetailsPrint" class="tab">Print sheet</button></div>' +
        '</div>' +
        '<div class="lds-metrics" aria-live="polite">' +
          '<div class="lds-metric"><strong id="ldsTotal">0</strong><span>Learners in this sheet</span></div>' +
          '<div class="lds-metric"><strong id="ldsDobMissing">0</strong><span>Missing birth date and year</span></div>' +
          '<div class="lds-metric"><strong id="ldsGuardianMissing">0</strong><span>Missing parent / guardian name</span></div>' +
          '<div class="lds-metric"><strong id="ldsContactMissing">0</strong><span>Missing guardian contact</span></div>' +
          '<div class="lds-metric"><strong id="ldsLinMissing">0</strong><span>Missing Ministry LIN</span></div>' +
        '</div>' +
        '<div class="lds-toolbar"><div><label for="learnerDetailsFilter">Show learners</label><select id="learnerDetailsFilter">' +
          '<option value="all">All learners in this class</option><option value="needs_attention">Any missing information</option>' +
          '<option value="missing_dob">Missing date of birth and year</option><option value="missing_guardian">Missing parent / guardian name</option>' +
          '<option value="missing_contact">Missing guardian contact</option><option value="missing_lin">Missing Ministry LIN</option>' +
          '<option value="complete">All selected details recorded</option></select></div>' +
          '<p id="learnerDetailsSheetStatus" class="muted" style="margin:0" role="status">Choose a class above or use the existing register search.</p></div>' +
        '<div class="lds-table-wrap"><table><thead><tr><th>No.</th><th>Learner</th><th>Class</th><th>Date of birth</th><th>Birth year</th><th>Parent / guardian</th><th>Relationship</th><th>Guardian contact</th><th>LIN</th><th>Profile</th><th>Open</th></tr></thead>' +
        '<tbody id="learnerDetailsSheetRows"><tr><td colspan="11">Learner records will appear after the register loads.</td></tr></tbody></table></div>' +
        '<p class="lds-note">Enter only information confirmed by the learner’s parent / guardian or an official school record. When only the year is known, enter the year and leave the exact date blank. Do not guess a day or month. Corrections to verified birth year or gender may regenerate the pupil code; the system keeps the old code linked to the learner’s history.</p>' +
      '</section>' +
      '<section id="learnerDetailsEditor" class="hidden" aria-labelledby="learnerDetailsEditorTitle">' +
        '<div class="lds-editor-head"><div><div class="lds-kicker">SELECTED LEARNER</div><h3 id="learnerDetailsEditorTitle">Complete learner information</h3><p id="learnerDetailsEditorMeta" class="muted" style="margin:0"></p><p id="learnerDetailsEditorPosition" class="muted" style="margin:4px 0 0"></p></div>' +
          '<div class="row" style="gap:7px;flex-wrap:wrap"><button type="button" id="learnerDetailsPrevious" class="tab">Previous learner</button><button type="button" id="learnerDetailsNext" class="tab">Next learner</button><button type="button" id="learnerDetailsClose" class="tab" aria-label="Close learner editor">Close editor</button></div></div>' +
        '<form id="learnerDetailsQuickForm">' +
          '<div class="lds-editor-grid">' +
            '<div class="lds-field"><label for="ldsFirstName">First name *</label><input id="ldsFirstName" name="first_name" required maxlength="100"></div>' +
            '<div class="lds-field"><label for="ldsMiddleName">Middle name</label><input id="ldsMiddleName" name="middle_name" maxlength="100"></div>' +
            '<div class="lds-field"><label for="ldsLastName">Last name *</label><input id="ldsLastName" name="last_name" required maxlength="100"></div>' +
            '<div class="lds-field"><label for="ldsGender">Gender *</label><select id="ldsGender" name="gender" required><option value="">Choose gender</option><option>Male</option><option>Female</option></select></div>' +
            '<div class="lds-field"><label for="ldsDob">Full date of birth</label><input id="ldsDob" name="date_of_birth" type="date"><div class="lds-hint">Use the full date only when day, month and year have been confirmed.</div></div>' +
            '<div class="lds-field"><label for="ldsBirthYear">Verified year of birth</label><input id="ldsBirthYear" name="birth_year" type="number" min="1900" max="' + new Date().getFullYear() + '" step="1" inputmode="numeric" placeholder="e.g. 2017"><div class="lds-hint">This year is used when issuing a permanent pupil code. Do not estimate it.</div></div>' +
            '<div class="lds-field"><label for="ldsLin">Ministry LIN</label><input id="ldsLin" name="lin" maxlength="40" placeholder="Enter the official LIN"></div>' +
            '<div class="lds-field"><label for="ldsP7Index">P7 examination index number</label><input id="ldsP7Index" name="p7_index_number" maxlength="40"></div>' +
            '<div class="lds-field"><label for="ldsGuardian">Parent / guardian name</label><input id="ldsGuardian" name="guardian_name" maxlength="160" placeholder="Name of parent or guardian"></div>' +
            '<div class="lds-field"><label for="ldsRelationship">Relationship to learner</label><input id="ldsRelationship" name="guardian_relationship" maxlength="80" placeholder="Mother, Father, Guardian…"></div>' +
            '<div class="lds-field"><label for="ldsGuardianPhone">Parent / guardian phone</label><input id="ldsGuardianPhone" name="guardian_phone" type="tel" maxlength="30" placeholder="+256…"></div>' +
            '<div class="lds-field"><label for="ldsGuardianEmail">Parent / guardian email</label><input id="ldsGuardianEmail" name="guardian_email" type="email" maxlength="254"></div>' +
            '<div class="lds-field"><label for="ldsAltGuardian">Alternative parent / guardian name</label><input id="ldsAltGuardian" name="alternate_guardian_name" maxlength="160"></div>' +
            '<div class="lds-field"><label for="ldsAltPhone">Alternative guardian phone</label><input id="ldsAltPhone" name="alternate_guardian_phone" type="tel" maxlength="30" placeholder="+256…"></div>' +
            '<div class="lds-field full"><label for="ldsAddress">Home address / village</label><input id="ldsAddress" name="address" maxlength="300"></div>' +
            '<div class="lds-field full"><label class="lds-checkbox"><input type="checkbox" id="ldsSmsOptIn" name="guardian_sms_opt_in"> Parent / guardian has agreed to receive SMS notifications on this number.</label></div>' +
            '<div class="lds-field"><label for="ldsWhatsappPhone">Parent / guardian WhatsApp number</label><input id="ldsWhatsappPhone" name="guardian_whatsapp_phone" type="tel" maxlength="30" placeholder="+256…"></div>' +
            '<div class="lds-field"><label class="lds-checkbox"><input type="checkbox" id="ldsWhatsappOptIn" name="guardian_whatsapp_opt_in"> Parent / guardian has agreed to receive school WhatsApp messages.</label></div>' +
          '</div>' +
          '<div class="lds-actions"><button type="submit" class="primary" id="learnerDetailsSave">Save learner information</button><button type="submit" id="learnerDetailsSaveNext" class="primary">Save &amp; open next learner</button><button type="button" id="learnerDetailsFullEdit" class="tab">Open full learner record</button><button type="button" id="learnerDetailsCancel" class="tab">Cancel</button></div>' +
          '<p class="lds-note">Changes are saved using the existing administrator Learner Register workflow. This quick sheet does not change bursary awards, fees, payments, attendance or academic marks.</p>' +
        '</form>' +
      '</section>'
    );

    const $ = id => document.getElementById(id);
    const editor = $('learnerDetailsEditor');
    const quickForm = $('learnerDetailsQuickForm');
    let selectedId = null;
    let dirty = false;
    let syncing = false;
    let advancedVisible = false;
    const legacyBulkPanel = $('bulkPromotionPanel');
    const legacyTableWrap = rowsHost.closest('.table-wrap');
    const legacyEmptyState = $('noStudents');
    function setAdvancedVisible(show) {
      advancedVisible = !!show;
      [legacyBulkPanel, legacyTableWrap, legacyEmptyState].filter(Boolean).forEach(node => node.classList.toggle('lds-legacy-collapsed', !advancedVisible));
      const toggle = $('learnerDetailsAdvancedToggle');
      if (toggle) {
        toggle.textContent = advancedVisible ? 'Hide advanced register actions' : 'Show advanced register actions';
        toggle.setAttribute('aria-expanded', String(advancedVisible));
      }
    }

    function currentLearners() {
      const st = state();
      if (st.role !== 'Admin') return [];
      const q = String($('search') && $('search').value || '').trim().toLowerCase();
      let list = st.students.filter(item => item.status !== 'Archived');
      if (st.classFilter === 'unassigned') list = list.filter(item => !item.class_id);
      else if (st.classFilter !== 'all') list = list.filter(item => item.class_id === st.classFilter);
      if (q) list = list.filter(item => {
        const full = [item.first_name, item.middle_name, item.last_name, item.admission_number, item.lin,
          item.p7_index_number, item.guardian_name, item.guardian_phone].join(' ').toLowerCase();
        return full.includes(q);
      });
      const mode = $('learnerDetailsFilter') && $('learnerDetailsFilter').value || 'all';
      const hasDob = x => !!(x.date_of_birth || x.birth_year);
      const hasGuardian = x => !!String(x.guardian_name || '').trim();
      const hasContact = x => !!(String(x.guardian_phone || '').trim() || String(x.guardian_email || '').trim());
      const hasLin = x => !!String(x.lin || '').trim();
      if (mode === 'missing_dob') list = list.filter(x => !hasDob(x));
      if (mode === 'missing_guardian') list = list.filter(x => !hasGuardian(x));
      if (mode === 'missing_contact') list = list.filter(x => !hasContact(x));
      if (mode === 'missing_lin') list = list.filter(x => !hasLin(x));
      if (mode === 'needs_attention') list = list.filter(x => !hasDob(x) || !hasGuardian(x) || !hasContact(x) || !hasLin(x));
      if (mode === 'complete') list = list.filter(x => hasDob(x) && hasGuardian(x) && hasContact(x) && hasLin(x));
      return list.sort((a, b) => String(a.last_name || '').localeCompare(String(b.last_name || '')) ||
        String(a.first_name || '').localeCompare(String(b.first_name || '')));
    }

    function metricLearners() {
      const st = state();
      let list = st.students.filter(item => item.status !== 'Archived');
      if (st.classFilter === 'unassigned') list = list.filter(item => !item.class_id);
      else if (st.classFilter !== 'all') list = list.filter(item => item.class_id === st.classFilter);
      const q = String($('search') && $('search').value || '').trim().toLowerCase();
      if (q) list = list.filter(item => [item.first_name, item.middle_name, item.last_name, item.admission_number, item.lin,
        item.guardian_name, item.guardian_phone].join(' ').toLowerCase().includes(q));
      return list;
    }

    function renderSheet() {
      const st = state();
      const panel = $('learnerDetailsWorkspace');
      if (!panel) return;
      panel.classList.toggle('hidden', st.role !== 'Admin');
      if (st.role !== 'Admin') {
        if (st.role) setAdvancedVisible(true);
        editor.classList.add('hidden');
        return;
      }
      setAdvancedVisible(advancedVisible);
      const metrics = metricLearners();
      const dobMissing = metrics.filter(x => !(x.date_of_birth || x.birth_year)).length;
      const guardianMissing = metrics.filter(x => !String(x.guardian_name || '').trim()).length;
      const contactMissing = metrics.filter(x => !(String(x.guardian_phone || '').trim() || String(x.guardian_email || '').trim())).length;
      const linMissing = metrics.filter(x => !String(x.lin || '').trim()).length;
      $('ldsTotal').textContent = metrics.length.toLocaleString();
      $('ldsDobMissing').textContent = dobMissing.toLocaleString();
      $('ldsGuardianMissing').textContent = guardianMissing.toLocaleString();
      $('ldsContactMissing').textContent = contactMissing.toLocaleString();
      $('ldsLinMissing').textContent = linMissing.toLocaleString();

      const shown = currentLearners();
      const names = st.classes;
      const className = id => {
        const cl = names.find(x => x.id === id);
        return cl ? cl.name + (cl.stream ? ' · ' + cl.stream : '') : 'Unassigned';
      };
      $('learnerDetailsSheetRows').innerHTML = shown.map((x, i) => {
        const fullName = [x.first_name, x.middle_name, x.last_name].filter(Boolean).join(' ');
        const missing = !(x.date_of_birth || x.birth_year) || !String(x.guardian_name || '').trim() ||
          !(String(x.guardian_phone || '').trim() || String(x.guardian_email || '').trim()) || !String(x.lin || '').trim();
        const dob = x.date_of_birth ? fmtDate(x.date_of_birth) : 'Not recorded';
        const year = x.birth_year || (x.date_of_birth ? String(x.date_of_birth).slice(0, 4) : '—');
        const guardian = String(x.guardian_name || '').trim() || 'Not recorded';
        const contact = [x.guardian_phone, x.guardian_email].filter(Boolean).join(' · ') || 'Not recorded';
        return '<tr tabindex="0" data-learner-sheet-id="' + htmlEscape(x.id) + '" aria-label="Open details for ' + htmlEscape(fullName) + '">' +
          '<td>' + (i + 1) + '</td><td><span class="lds-name">' + htmlEscape(fullName || 'Unnamed learner') + '</span><span class="lds-sub">' + htmlEscape(x.admission_number || 'No pupil code') + '</span></td>' +
          '<td>' + htmlEscape(className(x.class_id)) + '</td><td>' + htmlEscape(dob) + '</td><td>' + htmlEscape(year) + '</td>' +
          '<td>' + htmlEscape(guardian) + (x.alternate_guardian_name ? '<span class="lds-sub">Alternative: ' + htmlEscape(x.alternate_guardian_name) + '</span>' : '') + '</td>' +
          '<td>' + htmlEscape(x.guardian_relationship || '—') + '</td><td>' + htmlEscape(contact) + '</td><td>' + htmlEscape(x.lin || 'Not entered') + '</td>' +
          '<td><span class="lds-state ' + (missing ? 'pending' : '') + '">' + (missing ? 'Needs details' : 'Recorded') + '</span></td>' +
          '<td><button type="button" class="lds-open" data-learner-sheet-open="' + htmlEscape(x.id) + '">Select</button></td></tr>';
      }).join('') || '<tr><td colspan="11">No learners match this class, search and information filter.</td></tr>';
      const activeClass = st.classFilter === 'all' ? 'all classes' : st.classFilter === 'unassigned' ? 'unassigned learners' : className(st.classFilter);
      $('learnerDetailsSheetStatus').textContent = shown.length.toLocaleString() + ' learner(s) shown · ' + activeClass +
        ' · Search using the existing Learner Register search box above.';
      if (selectedId && !st.students.some(x => x.id === selectedId)) closeEditor(false);
    }

    function readMainValue(form, name) {
      const control = form.elements.namedItem(name);
      if (!control) return '';
      return control.type === 'checkbox' ? !!control.checked : control.value;
    }

    function writeMainValue(form, name, value) {
      const control = form.elements.namedItem(name);
      if (!control) return;
      if (control.type === 'checkbox') control.checked = !!value;
      else control.value = value == null ? '' : String(value);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function syncEditorFromMain() {
      const form = $('studentForm');
      if (!form) return;
      syncing = true;
      fieldNames.concat(['guardian_sms_opt_in', 'guardian_whatsapp_opt_in']).forEach(name => {
        const target = quickForm.elements.namedItem(name);
        if (!target) return;
        const value = readMainValue(form, name);
        if (target.type === 'checkbox') target.checked = !!value;
        else target.value = value == null ? '' : String(value);
      });
      syncing = false;
    }

    function syncMainFromEditor() {
      const form = $('studentForm');
      if (!form) return;
      fieldNames.concat(['guardian_sms_opt_in', 'guardian_whatsapp_opt_in']).forEach(name => {
        const source = quickForm.elements.namedItem(name);
        if (!source) return;
        writeMainValue(form, name, source.type === 'checkbox' ? source.checked : source.value);
      });
    }

    async function prepareExistingEdit(learner) {
      const form = $('studentForm');
      if (!form) throw new Error('The main Learner Register form is not available.');
      editingStudentId = learner.id;
      const names = [
        'first_name', 'middle_name', 'last_name', 'gender', 'birth_year', 'date_of_birth',
        'admission_date', 'lin', 'p7_index_number', 'learner_type', 'status',
        'bursary_fee_ugx', 'bursary_category', 'bursary_reason', 'previous_school',
        'class_id', 'guardian_name', 'guardian_relationship', 'guardian_phone',
        'guardian_email', 'alternate_guardian_name', 'alternate_guardian_phone', 'address',
        'guardian_whatsapp_phone'
      ];
      names.forEach(name => {
        if (form.elements.namedItem(name)) writeMainValue(form, name, learner[name] == null ? '' : learner[name]);
      });
      if (form.elements.namedItem('bursary_reason') && !form.elements.bursary_reason.value) {
        writeMainValue(form, 'bursary_reason', learner.bursary_notes || '');
      }
      writeMainValue(form, 'takes_breakfast', !!learner.takes_breakfast);
      writeMainValue(form, 'takes_lunch', !!learner.takes_lunch);
      writeMainValue(form, 'guardian_sms_opt_in', !!learner.guardian_sms_opt_in);
      writeMainValue(form, 'guardian_whatsapp_opt_in', !!learner.guardian_whatsapp_opt_in);
      writeMainValue(form, 'admission_prorate', !!learner.admission_prorate);
      writeMainValue(form, 'is_bursary', String(!!learner.is_bursary));
      if (form.elements.namedItem('admission_prorate')) form.elements.admission_prorate.disabled = true;
      if (form.elements.namedItem('admission_date')) form.elements.admission_date.disabled = false;
      if (typeof syncBoardingMealControls === 'function') syncBoardingMealControls();
      if (typeof syncBursaryAdmissionFields === 'function') syncBursaryAdmissionFields();
      const title = $('studentFormTitle');
      if (title) title.textContent = 'Edit learner record';
      const cancel = $('cancelLearnerEdit');
      if (cancel) cancel.classList.remove('hidden');
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Update learner record';
      if (typeof restoreLocalAutosaveForm === 'function') {
        try { await restoreLocalAutosaveForm(form, 'learner-edit-' + learner.id, 'appMsg'); } catch (_) {}
      }
      syncEditorFromMain();
    }

    async function openEditor(id) {
      const st = state();
      if (st.role !== 'Admin' || st.demo) return;
      const learner = st.students.find(x => x.id === id);
      if (!learner) return;
      if (selectedId && selectedId !== id && dirty) {
        const discard = window.confirm('Discard the unsaved changes for the learner currently open?');
        if (!discard) return;
        await discardMainDraft();
      }
      try {
        await prepareExistingEdit(learner);
        selectedId = id;
        dirty = false;
        editor.dataset.saving = '0';
        editor.classList.remove('hidden');
        $('learnerDetailsEditorTitle').textContent = [learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ') || 'Complete learner information';
        $('learnerDetailsEditorMeta').textContent = (learner.admission_number || 'Temporary / no pupil code') + ' · ' +
          (learner.school_classes && learner.school_classes.name ? learner.school_classes.name : (st.classes.find(c => c.id === learner.class_id)?.name || 'Unassigned'));
        const ordered = currentLearners();
        const position = ordered.findIndex(x => x.id === id);
        $('learnerDetailsEditorPosition').textContent = position >= 0 ? 'Learner ' + (position + 1) + ' of ' + ordered.length + ' in the current sheet' : '';
        $('learnerDetailsPrevious').disabled = position <= 0;
        $('learnerDetailsNext').disabled = position < 0 || position >= ordered.length - 1;
        editor.dataset.nextLearnerId = '';
        $('learnerDetailsSave').disabled = false;
        $('learnerDetailsSave').textContent = 'Save learner information';
        $('learnerDetailsSheetStatus').textContent = 'Editing ' + [learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ') + '. The class sheet remains available above.';
        editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        if (typeof message === 'function') message('appMsg', 'Could not open learner information: ' + (error.message || 'Please refresh the register.'), true);
      }
    }

    async function discardMainDraft() {
      const id = selectedId;
      const form = $('studentForm');
      if (id && typeof clearLocalFormDraft === 'function' && typeof currentUserId !== 'undefined' && currentUserId) {
        try { await clearLocalFormDraft(currentUserId, 'learner-edit-' + id); } catch (_) {}
      }
      if (typeof editingStudentId !== 'undefined') editingStudentId = null;
      if (form) {
        form.reset();
        if (form.elements.namedItem('admission_prorate')) form.elements.admission_prorate.disabled = false;
        if (form.elements.namedItem('admission_date')) form.elements.admission_date.disabled = false;
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.textContent = 'Save student record';
      }
      if (typeof syncBursaryAdmissionFields === 'function') syncBursaryAdmissionFields();
      selectedId = null;
      dirty = false;
      editor.dataset.saving = '0';
      editor.classList.add('hidden');
    }

    function closeEditor(askDiscard) {
      if (!selectedId) {
        editor.classList.add('hidden');
        return;
      }
      if (askDiscard && dirty && !window.confirm('Close this editor and discard unsaved changes?')) return;
      discardMainDraft();
    }

    quickForm.addEventListener('input', event => {
      if (syncing) return;
      const target = event.target;
      if (!target || !target.name) return;
      dirty = true;
      if (target.name === 'date_of_birth' && target.value) {
        const yearControl = quickForm.elements.namedItem('birth_year');
        if (yearControl) {
          yearControl.value = target.value.slice(0, 4);
          writeMainValue($('studentForm'), 'birth_year', yearControl.value);
        }
      }
      const form = $('studentForm');
      if (form) writeMainValue(form, target.name, target.type === 'checkbox' ? target.checked : target.value);
      editor.dataset.dirty = '1';
    });
    quickForm.addEventListener('change', event => {
      if (event.target && event.target.name && event.target.type === 'checkbox') {
        dirty = true;
        const form = $('studentForm');
        if (form) writeMainValue(form, event.target.name, event.target.checked);
      }
    });
    quickForm.addEventListener('submit', event => {
      event.preventDefault();
      if (event.submitter && event.submitter.id === 'learnerDetailsSaveNext') {
        const current = currentLearners();
        const currentIndex = current.findIndex(x => x.id === selectedId);
        const next = currentIndex >= 0 ? current[currentIndex + 1] : null;
        editor.dataset.nextLearnerId = next ? next.id : '';
        if (!next) $('learnerDetailsSheetStatus').textContent = 'This is the last learner in the current sheet. The record will be saved without moving to another learner.';
      } else {
        editor.dataset.nextLearnerId = '';
      }
      const form = $('studentForm');
      if (!form || !selectedId || typeof profile === 'undefined' || profile?.role !== 'Admin' || demoMode) return;
      const first = String(quickForm.elements.first_name.value || '').trim();
      const last = String(quickForm.elements.last_name.value || '').trim();
      const gender = quickForm.elements.gender.value;
      if (!first || !last) {
        $('learnerDetailsSheetStatus').textContent = 'Enter the learner’s first and last names before saving.';
        quickForm.elements.first_name.focus();
        return;
      }
      if (!['Male', 'Female'].includes(gender)) {
        $('learnerDetailsSheetStatus').textContent = 'Choose the verified gender before saving.';
        quickForm.elements.gender.focus();
        return;
      }
      const year = quickForm.elements.birth_year.value.trim();
      if (year && (!Number.isInteger(Number(year)) || Number(year) < 1900 || Number(year) > new Date().getFullYear())) {
        $('learnerDetailsSheetStatus').textContent = 'Enter a valid verified birth year, or leave it blank until confirmed.';
        quickForm.elements.birth_year.focus();
        return;
      }
      syncMainFromEditor();
      const submit = form.querySelector('button[type="submit"]');
      if (!submit) return;
      editingStudentId = selectedId;
      editor.dataset.saving = '1';
      $('learnerDetailsSave').textContent = 'Saving…';
      $('learnerDetailsSheetStatus').textContent = 'Saving through the protected Learner Register workflow…';
      const priorNoValidate = form.noValidate;
      form.noValidate = true;
      try {
        form.requestSubmit(submit);
      } catch (error) {
        editor.dataset.saving = '0';
        $('learnerDetailsSave').textContent = 'Save learner information';
        $('learnerDetailsSheetStatus').textContent = 'Could not submit the learner update: ' + (error.message || 'Please try again.');
      }
      window.setTimeout(() => { form.noValidate = priorNoValidate; }, 0);
    });

    function moveToAdjacentLearner(direction) {
      const list = currentLearners();
      const index = list.findIndex(x => x.id === selectedId);
      const target = list[index + direction];
      if (!target) {
        $('learnerDetailsSheetStatus').textContent = direction > 0 ? 'You are at the last learner in this sheet.' : 'You are at the first learner in this sheet.';
        return;
      }
      openEditor(target.id);
    }
    $('learnerDetailsPrevious').addEventListener('click', () => moveToAdjacentLearner(-1));
    $('learnerDetailsNext').addEventListener('click', () => moveToAdjacentLearner(1));
    $('learnerDetailsClose').addEventListener('click', () => closeEditor(true));
    $('learnerDetailsCancel').addEventListener('click', () => closeEditor(true));
    $('learnerDetailsFullEdit').addEventListener('click', () => {
      const id = selectedId;
      const button = id && document.querySelector('.editLearner[data-id="' + CSS.escape(id) + '"]');
      if (button) {
        selectedId = null;
        editor.dataset.saving = '0';
        editor.classList.add('hidden');
        dirty = false;
        button.click();
      }
    });
    $('learnerDetailsAdvancedToggle').addEventListener('click', () => setAdvancedVisible(!advancedVisible));
    $('learnerDetailsFilter').addEventListener('change', renderSheet);
    $('studentRegisterClassCards').addEventListener('click', () => window.setTimeout(renderSheet, 0));
    $('search').addEventListener('input', renderSheet);
    $('learnerDetailsSheetRows').addEventListener('click', event => {
      const open = event.target.closest('[data-learner-sheet-open]');
      const row = event.target.closest('tr[data-learner-sheet-id]');
      const id = open ? open.dataset.learnerSheetOpen : (row ? row.dataset.learnerSheetId : null);
      if (id) openEditor(id);
    });
    $('learnerDetailsSheetRows').addEventListener('keydown', event => {
      const row = event.target.closest('tr[data-learner-sheet-id]');
      if (row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openEditor(row.dataset.learnerSheetId);
      }
    });
    $('learnerDetailsExport').addEventListener('click', () => {
      if (state().role !== 'Admin') return;
      const rows = currentLearners();
      const headers = ['Pupil code', 'Learner name', 'Class', 'Date of birth', 'Birth year', 'Parent / guardian', 'Relationship', 'Guardian phone', 'Guardian email', 'Alternative guardian', 'Alternative phone', 'LIN', 'P7 index'];
      const st = state();
      const body = rows.map(x => [
        x.admission_number, [x.first_name, x.middle_name, x.last_name].filter(Boolean).join(' '),
        (st.classes.find(c => c.id === x.class_id)?.name || 'Unassigned'), x.date_of_birth, x.birth_year,
        x.guardian_name, x.guardian_relationship, x.guardian_phone, x.guardian_email,
        x.alternate_guardian_name, x.alternate_guardian_phone, x.lin, x.p7_index_number
      ]);
      const quote = value => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
      const csv = [headers, ...body].map(row => row.map(quote).join(',')).join('\r\n');
      const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'CORNHILL-learner-details-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
    $('learnerDetailsPrint').addEventListener('click', () => {
      if (state().role !== 'Admin') return;
      document.body.classList.add('lds-print-mode');
      window.print();
      document.body.classList.remove('lds-print-mode');
    });

    const observer = new MutationObserver(() => {
      if (editor.dataset.saving === '1' && typeof editingStudentId !== 'undefined' && editingStudentId === null) {
        const nextId = editor.dataset.nextLearnerId || '';
        editor.dataset.nextLearnerId = '';
        selectedId = null;
        dirty = false;
        editor.dataset.saving = '0';
        editor.classList.add('hidden');
        if (nextId) window.setTimeout(() => openEditor(nextId), 80);
      }
      renderSheet();
    });
    observer.observe(rowsHost, { childList: true, subtree: true });
    observer.observe($('studentRegisterClassCards'), { childList: true, subtree: true });
    renderSheet();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();