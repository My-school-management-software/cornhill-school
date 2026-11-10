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
    'date_of_birth', 'admission_date', 'previous_school', 'class_id', 'learner_type',
    'takes_breakfast', 'takes_lunch', 'lin', 'p7_index_number', 'guardian_name',
    'guardian_relationship', 'guardian_phone', 'guardian_email',
    'alternate_guardian_name', 'alternate_guardian_phone', 'address',
    'guardian_whatsapp_phone'
  ];

  const css = [
    '#learnerDetailsWorkspace{margin:14px 0 18px;padding:clamp(14px,1.8vw,22px);border:1px solid var(--cornhill-line,#dce7de);border-radius:18px;background:var(--cornhill-panel,#fff);box-shadow:0 6px 20px rgba(20,55,34,.045)}',
    '#students .lds-legacy-collapsed{display:none!important}',
    '#learnerDetailsWorkspace .lds-kicker{font-size:10px;font-weight:900;letter-spacing:.13em;color:var(--cornhill-accent,#176b48)}',
    '#learnerDetailsWorkspace .lds-intro{max-width:880px;margin:4px 0 0;color:var(--cornhill-muted,#647568);font-size:13px;line-height:1.5}',
    '#learnerDetailsWorkspace .lds-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px;margin:14px 0}',
    '#learnerDetailsWorkspace .lds-metric{min-width:0;padding:12px;border:1px solid var(--cornhill-line,#dce7de);border-radius:13px;background:color-mix(in srgb,var(--cornhill-panel,#fff) 88%,var(--cornhill-page,#f4f7f4))}',
    '#learnerDetailsWorkspace .lds-metric strong{display:block;font-size:clamp(20px,2vw,27px);line-height:1.1;color:var(--cornhill-ink,#17251c);font-variant-numeric:tabular-nums}',
    '#learnerDetailsWorkspace .lds-metric span{display:block;margin-top:5px;font-size:11px;color:var(--cornhill-muted,#647568)}',
    '#learnerDetailsWorkspace .lds-toolbar{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0}',
    '#learnerDetailsWorkspace .lds-toolbar label{display:block;font-size:12px;font-weight:750;margin:0 0 5px}',
    '#learnerDetailsWorkspace .lds-toolbar select{min-width:220px;margin:0}',
    '#learnerDetailsWorkspace .lds-table-wrap{width:100%;overflow-x:auto;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;border:1px solid var(--cornhill-line,#dce7de);border-radius:12px}',
    '#learnerDetailsWorkspace table{width:100%;min-width:1100px;border-collapse:collapse;font-size:12px}',
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
    'body.lds-editor-open{overflow:hidden}',
    'body.lds-editor-open::before{content:"";position:fixed;inset:0;z-index:999;background:rgba(11,25,17,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}',
    '#learnerDetailsEditor{position:fixed;z-index:1000;top:50%;left:50%;transform:translate(-50%,-50%);width:min(920px,calc(100vw - 32px));max-height:min(90vh,860px);overflow:auto;overscroll-behavior:contain;margin:0;padding:clamp(15px,2vw,24px);border:1px solid var(--cornhill-line,#dce7de);border-left:4px solid var(--cornhill-accent,#176b48);border-radius:17px;background:var(--cornhill-panel,#fff);box-shadow:0 24px 80px rgba(0,0,0,.28)}',
    '#learnerDetailsEditor:focus{outline:none}',
    '#learnerDetailsEditor .lds-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '#learnerDetailsEditor .lds-editor-head h3{margin:3px 0 4px}',
    '#learnerDetailsEditor .lds-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:14px}',
    '#learnerDetailsEditor .lds-field{min-width:0}',
    '#learnerDetailsEditor .lds-field.full{grid-column:1/-1}',
    '#learnerDetailsEditor .lds-field label{display:block;font-size:12px;font-weight:800;margin:0 0 5px}',
    '#learnerDetailsEditor .lds-field input,#learnerDetailsEditor .lds-field select{width:100%;min-width:0;margin:0}',
    '#learnerDetailsEditor .lds-hint{font-size:11px;line-height:1.45;color:var(--cornhill-muted,#647568);margin-top:5px}',
    '#learnerDetailsEditor .lds-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:15px}',
    '#learnerDetailsEditor .lds-actions button{display:inline-flex!important;align-items:center;justify-content:center;width:auto!important;min-width:0!important;min-height:36px;padding:8px 12px!important;border-radius:9px;font-size:12px!important;line-height:1.2!important;font-weight:750;white-space:normal;flex:0 1 auto}',
    '#learnerDetailsEditor .lds-actions button:disabled{opacity:.55;cursor:not-allowed}',
    '#learnerDetailsEditor #ldsOpenBursaryApproval:disabled{opacity:.55;cursor:not-allowed}',
    '#learnerDetailsEditor .lds-actions #learnerDetailsSave{font-weight:850}',
    '#learnerDetailsEditor .lds-note{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--cornhill-page,#f4f7f4);font-size:12px;line-height:1.5;color:var(--cornhill-muted,#647568)}',
    '#learnerDetailsEditor .lds-checkbox{display:flex;gap:8px;align-items:flex-start;font-size:12px;font-weight:650}',
    '#learnerDetailsEditor .lds-checkbox input{width:17px;height:17px;flex:0 0 auto;margin:1px 0 0}',
    '#learnerDetailsLifecycle{margin-top:14px;padding:14px;border:1px solid var(--cornhill-line,#dce7de);border-radius:13px;background:var(--cornhill-page,#f4f7f4)}',
    '#learnerDetailsLifecycle .lds-lifecycle-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start}',
    '#learnerDetailsLifecycle textarea{width:100%;min-height:64px;margin:6px 0 0}',
    '#learnerDetailsLifecycle .lds-danger{border:1px solid #b42318!important;color:#b42318!important;background:#fff!important}',
    '#learnerDetailsLifecycle .lds-lifecycle-note{font-size:11px;line-height:1.5;color:var(--cornhill-muted,#647568);margin:9px 0 0}',
    '@media(max-width:900px){#learnerDetailsWorkspace .lds-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '@media(max-width:620px){#learnerDetailsWorkspace .lds-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#learnerDetailsEditor{top:8px;left:8px;transform:none;width:calc(100vw - 16px);max-height:calc(100dvh - 16px);padding:14px;border-radius:14px}#learnerDetailsEditor .lds-editor-grid{grid-template-columns:1fr}#learnerDetailsEditor .lds-field.full{grid-column:auto}#learnerDetailsEditor .lds-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#learnerDetailsEditor .lds-actions button{width:100%!important;min-height:38px;padding:8px 9px!important}#learnerDetailsWorkspace .lds-toolbar select{width:100%;min-width:0}}',
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
          '<div class="lds-metric"><strong id="ldsDobMissing">0</strong><span>Missing exact date of birth</span></div>' +
          '<div class="lds-metric"><strong id="ldsBirthYearMissing">0</strong><span>Missing birth year</span></div>' +
          '<div class="lds-metric"><strong id="ldsGuardianMissing">0</strong><span>Missing parent / guardian name</span></div>' +
          '<div class="lds-metric"><strong id="ldsContactMissing">0</strong><span>Missing guardian contact</span></div>' +
          '<div class="lds-metric"><strong id="ldsLinMissing">0</strong><span>Missing Ministry LIN</span></div>' +
        '</div>' +
        '<div class="lds-toolbar"><div><label for="ldsRecordStatusFilter">Record status</label><select id="ldsRecordStatusFilter"><option value="active">Non-archived records</option><option value="archived">Archived records</option><option value="all">All records</option></select></div><div><label for="learnerDetailsFilter">Show learners</label><select id="learnerDetailsFilter">' +
          '<option value="all">All learners in this class</option><option value="needs_attention">Any missing information</option>' +
          '<option value="missing_dob">Missing full date of birth</option><option value="missing_year">Missing birth year</option><option value="missing_guardian">Missing parent / guardian name</option>' +
          '<option value="missing_contact">Missing guardian contact</option><option value="missing_lin">Missing Ministry LIN</option>' +
          '<option value="complete">All selected details recorded</option></select></div>' +
          '<p id="learnerDetailsSheetStatus" class="muted" style="margin:0" role="status">Choose a class above or use the existing register search.</p></div>' +
        '<div class="lds-table-wrap"><table><thead><tr><th>No.</th><th>Learner</th><th>Class</th><th>Date of birth</th><th>Birth year</th><th>Parent / guardian</th><th>Relationship</th><th>Guardian contact</th><th>LIN</th><th>Fee arrangement</th><th>Profile</th><th>Open</th></tr></thead>' +
        '<tbody id="learnerDetailsSheetRows"><tr><td colspan="11">Learner records will appear after the register loads.</td></tr></tbody></table></div>' +
        '<p class="lds-note">Enter only information confirmed by the learner’s parent / guardian or an official school record. When only the year is known, enter the year and leave the exact date blank. Do not guess a day or month. Corrections to verified birth year or gender may regenerate the pupil code; the system keeps the old code linked to the learner’s history.</p>' +
      '</section>' +
      '<section id="learnerDetailsEditor" class="hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="learnerDetailsEditorTitle" tabindex="-1">' +
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
            '<div class="lds-field full"><label for="ldsClassId">Class assignment *</label><select id="ldsClassId" name="class_id" required><option value="">Choose class</option></select><div class="lds-hint">Assign the learner here. The selected class is saved together with the other learner details.</div></div>' +
            '<div class="lds-field"><label for="ldsLearnerType">Learner package</label><select id="ldsLearnerType" name="learner_type"><option value="Day">Day learner</option><option value="Boarding">Boarding learner</option></select></div>' +
            '<div class="lds-field"><label for="ldsAdmissionDate">Admission date</label><input id="ldsAdmissionDate" name="admission_date" type="date"></div>' +
            '<div class="lds-field"><label class="lds-checkbox"><input type="checkbox" id="ldsBreakfast" name="takes_breakfast"> Takes breakfast</label></div>' +
            '<div class="lds-field"><label class="lds-checkbox"><input type="checkbox" id="ldsLunch" name="takes_lunch"> Takes lunch</label></div>' +
            '<div class="lds-field full" id="ldsFeePreview" aria-live="polite"><strong>Current-term fee estimate</strong><div class="lds-hint">Choose a class to view day fees or the complete boarding package.</div></div>' +
            '<div class="lds-field full"><label for="ldsPreviousSchool">Previous school (if any)</label><input id="ldsPreviousSchool" name="previous_school" maxlength="180"></div>' +
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
            '<div class="lds-field full" id="ldsBursaryArrangementField"><label for="ldsFeeArrangement">School fee arrangement</label><select id="ldsFeeArrangement"><option value="regular">Regular fees</option><option value="bursary">Bursary / sponsored learner</option></select><div id="ldsBursaryArrangementStatus" class="lds-hint" role="status">Loading the learner’s current bursary status…</div><button type="button" id="ldsOpenBursaryApproval" class="tab" hidden style="margin-top:9px">Open bursary approval</button><div class="lds-hint">Selecting bursary reveals an action to open the approved Finance workflow. It does not directly change fees, receipts or previous payment allocations.</div></div>' +
          '</div>' +
          '<div class="lds-actions"><button type="submit" class="primary" id="learnerDetailsSave">Save learner information</button><button type="submit" id="learnerDetailsSaveNext" class="primary">Save &amp; open next learner</button><button type="button" id="learnerDetailsCancel" class="tab">Cancel</button></div>' +
          '<p class="lds-note">Learner details are saved through the protected Learner Register. Bursary awards are managed separately through Finance approval so previous charges, receipts and payment allocations remain protected.</p>' +
        '</form>' +
        '<section id="learnerDetailsLifecycle" aria-labelledby="ldsLifecycleHeading">' +
          '<div class="lds-lifecycle-head"><div><h4 id="ldsLifecycleHeading" style="margin:0 0 4px">Archive or permanently delete this learner</h4><p id="ldsLifecycleStatus" class="muted" role="status" style="margin:0">Choose an action for the selected learner.</p></div></div>' +
          '<label for="ldsLifecycleReason" style="display:block;font-size:12px;font-weight:800;margin-top:10px">Reason for this action (required)</label>' +
          '<textarea id="ldsLifecycleReason" rows="2" maxlength="500" placeholder="Enter at least 5 characters explaining why this action is needed"></textarea>' +
          '<div class="lds-actions"><button type="button" id="ldsArchiveRestore" class="tab">Archive learner</button><button type="button" id="ldsDeletePermanently" class="lds-danger">Delete permanently</button></div>' +
          '<p class="lds-lifecycle-note">Archive hides a learner from the normal register while retaining school history; an administrator can restore an archived learner. Permanent deletion removes the learner and linked guardian, academic, attendance, fee, payment, receipt and history records. It cannot be undone. Use it only for confirmed test records, duplicates or records created in error. Any attached private files must also be removed successfully.</p>' +
        '</section>' +
      '</section>'
    );

    const $ = id => document.getElementById(id);
    const editor = $('learnerDetailsEditor');
    const quickForm = $('learnerDetailsQuickForm');
    let selectedId = null;
    let dirty = false;
    let returnFocusElement = null;
    function restoreEditorFocus() {
      const target = returnFocusElement;
      returnFocusElement = null;
      if (target && target.isConnected && typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
      }
    }
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

    let activeBursaryAwards = new Map();
    let activeBursaryAwardsLoaded = false;
    let activeBursaryAwardsLoading = false;
    let activeBursaryAwardsError = null;
    let activeBursaryAwardsOwner = null;
    let bursaryApprovalOpening = false;
    let bursaryReturnLearnerId = null;
    let feeScheduleRows = null;
    let feeScheduleLoading = false;
    let feeSchedulePromise = null;
    let feeScheduleError = null;
    let feeScheduleTermLabel = '';
    let feePreviewRequest = 0;

    function currentBursaryArrangement(learner) {
      if (!activeBursaryAwardsLoaded || activeBursaryAwardsError || activeBursaryAwardsOwner !== state().userId) {
        return { value: 'unknown', label: 'Fee status unavailable', description: 'The current bursary register could not be verified. Refresh or check Finance before changing this learner’s fee arrangement.' };
      }
      const award = activeBursaryAwards.get(learner.id) || null;
      if (award) {
        return {
          value: 'bursary',
          label: award.bursary_category + ' · UGX ' + Number(award.amount_payable_ugx || 0).toLocaleString('en-UG') + ' payable',
          description: 'Approved for ' + award.billing_period_label + ' · valid ' + fmtDate(award.effective_from) + ' to ' + fmtDate(award.effective_until) + '.'
        };
      }
      if (learner.is_bursary) {
        return {
          value: 'bursary',
          label: (learner.bursary_category || 'Bursary recorded at admission') + ' · UGX ' + Number(learner.bursary_fee_ugx || 0).toLocaleString('en-UG') + ' payable',
          description: 'This learner was admitted on a bursary. The current term approval should be confirmed in Finance before changing the arrangement.'
        };
      }
      return {
        value: 'regular',
        label: 'Regular fees',
        description: 'Regular school fees currently apply. A bursary can be requested through the school’s approved Finance workflow.'
      };
    }

    function updateBursaryEditor(learner) {
      const select = $('ldsFeeArrangement');
      const note = $('ldsBursaryArrangementStatus');
      const action = $('ldsOpenBursaryApproval');
      if (!select || !note || !action || !learner) return;
      const current = currentBursaryArrangement(learner);
      select.value = current.value === 'unknown' ? '' : current.value;
      select.disabled = current.value === 'unknown';
      select.dataset.currentValue = current.value;
      note.textContent = current.label + '. ' + current.description;
      action.hidden = true;
      action.disabled = false;
      action.textContent = 'Open bursary approval';
    }

    async function refreshBursaryAwards() {
      if (activeBursaryAwardsLoading || state().role !== 'Admin' || typeof db === 'undefined' || !db) return;
      activeBursaryAwardsLoading = true;
      try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
        const { data, error } = await db.from('learner_bursary_awards')
          .select('id,student_id,bursary_category,amount_payable_ugx,billing_period_label,effective_from,effective_until,approved_at')
          .lte('effective_from', today)
          .or('effective_until.is.null,effective_until.gte.' + today)
          .order('effective_from', { ascending: false })
          .limit(1000);
        if (error) throw error;
        const next = new Map();
        (data || []).forEach(award => {
          if (award.student_id && !next.has(award.student_id)) next.set(award.student_id, award);
        });
        activeBursaryAwards = next;
        activeBursaryAwardsError = null;
        activeBursaryAwardsOwner = state().userId;
        activeBursaryAwardsLoaded = true;
        renderSheet();
        if (selectedId) {
          const learner = state().students.find(x => x.id === selectedId);
          if (learner) updateBursaryEditor(learner);
        }
      } catch (error) {
        activeBursaryAwardsError = error;
        activeBursaryAwardsOwner = state().userId;
        activeBursaryAwardsLoaded = true;
        const note = $('ldsBursaryArrangementStatus');
        if (note) note.textContent = 'Current bursary approval details could not be loaded. No fee arrangement was changed. Refresh the learner register or check Finance.';
      } finally {
        activeBursaryAwardsLoading = false;
      }
    }

    async function openExistingBursaryApproval() {
      const action = $('ldsOpenBursaryApproval');
      const note = $('ldsBursaryArrangementStatus');
      if (!selectedId || state().role !== 'Admin' || state().demo || bursaryApprovalOpening) return;
      if (!activeBursaryAwardsLoaded || activeBursaryAwardsError) {
        note.textContent = 'The current bursary register has not been verified. Refresh the learner register or check Finance before starting a new award.';
        action.hidden = true;
        return;
      }
      if (dirty) {
        $('ldsFeeArrangement').value = currentBursaryArrangement(state().students.find(x => x.id === selectedId)).value;
        note.textContent = 'Save or cancel the learner information edits first. The bursary approval screen is separate so fee decisions are not mixed with profile edits.';
        action.hidden = true;
        return;
      }
      const learner = state().students.find(x => x.id === selectedId);
      if (!learner) return;
      if (currentBursaryArrangement(learner).value === 'bursary') {
        updateBursaryEditor(learner);
        return;
      }
      if (!learner.class_id) {
        action.hidden = false;
        action.disabled = true;
        action.textContent = 'Assign class first';
        note.textContent = 'Bursary approval has not started. This learner has no class assigned. Use “Open full learner record” below, assign the correct class, save the learner, then return here. Finance needs the class to identify the correct current-term fee. No bursary has been recorded.';
        return;
      }
      bursaryApprovalOpening = true;
      action.disabled = true;
      action.textContent = 'Opening Finance…';
      try {
        if (typeof loadFinance === 'function') await loadFinance();
        const select = $('existingBursaryStudent');
        if (!select) throw new Error('The Finance bursary approval form is unavailable.');
        const option = Array.from(select.options).find(item => item.value === learner.id);
        if (!option) throw new Error('Finance did not return this active learner. Refresh the learner register and try again.');
        select.value = learner.id;
        bursaryReturnLearnerId = learner.id;
        closeEditor(false);
        if (typeof tab === 'function') tab('finance');
        window.setTimeout(() => {
          const refreshedSelect = $('existingBursaryStudent');
          if (refreshedSelect && Array.from(refreshedSelect.options).some(item => item.value === learner.id)) refreshedSelect.value = learner.id;
          const form = $('existingBursaryAwardForm');
          if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const category = $('existingBursaryCategory');
          if (category) category.focus({ preventScroll: true });
          if (typeof message === 'function') message('financeMsg', 'Selected ' + [learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ') + '. Complete the approved bursary details and submit to record the award. The learner sheet will reopen after a successful approval.');
        }, 450);
      } catch (error) {
        bursaryReturnLearnerId = null;
        action.disabled = false;
        action.textContent = 'Open bursary approval';
        if (typeof message === 'function') message('appMsg', 'Could not open bursary approval: ' + (error.message || 'Please try again.'), true);
      } finally {
        bursaryApprovalOpening = false;
        if (editor.contains(action) && !editor.classList.contains('hidden')) {
          action.disabled = false;
          if (action.textContent === 'Opening Finance…') action.textContent = 'Open bursary approval';
        }
      }
    }

    function currentLearners() {
      const st = state();
      if (st.role !== 'Admin') return [];
      const q = String($('search') && $('search').value || '').trim().toLowerCase();
      let list = st.students.slice();
      const statusMode = $('ldsRecordStatusFilter') && $('ldsRecordStatusFilter').value || 'active';
      if (statusMode === 'active') list = list.filter(item => item.status !== 'Archived');
      else if (statusMode === 'archived') list = list.filter(item => item.status === 'Archived');
      if (st.classFilter === 'unassigned') list = list.filter(item => !item.class_id);
      else if (st.classFilter !== 'all') list = list.filter(item => item.class_id === st.classFilter);
      if (q) list = list.filter(item => {
        const full = [item.first_name, item.middle_name, item.last_name, item.admission_number, item.lin,
          item.p7_index_number, item.guardian_name, item.guardian_phone].join(' ').toLowerCase();
        return full.includes(q);
      });
      const mode = $('learnerDetailsFilter') && $('learnerDetailsFilter').value || 'all';
      const hasDob = x => !!x.date_of_birth;
      const hasBirthYear = x => !!(x.birth_year || (x.date_of_birth && String(x.date_of_birth).length >= 4));
      const hasGuardian = x => !!String(x.guardian_name || '').trim();
      const hasContact = x => !!(String(x.guardian_phone || '').trim() || String(x.guardian_email || '').trim());
      const hasLin = x => !!String(x.lin || '').trim();
      if (mode === 'missing_dob') list = list.filter(x => !hasDob(x));
      if (mode === 'missing_year') list = list.filter(x => !hasBirthYear(x));
      if (mode === 'missing_guardian') list = list.filter(x => !hasGuardian(x));
      if (mode === 'missing_contact') list = list.filter(x => !hasContact(x));
      if (mode === 'missing_lin') list = list.filter(x => !hasLin(x));
      if (mode === 'needs_attention') list = list.filter(x => !hasDob(x) || !hasBirthYear(x) || !hasGuardian(x) || !hasContact(x) || !hasLin(x));
      if (mode === 'complete') list = list.filter(x => hasDob(x) && hasBirthYear(x) && hasGuardian(x) && hasContact(x) && hasLin(x));
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
      if (st.role === 'Admin' && (!activeBursaryAwardsLoaded || activeBursaryAwardsOwner !== st.userId) && !activeBursaryAwardsLoading) refreshBursaryAwards();
      if (st.role !== 'Admin') {
        if (st.role) setAdvancedVisible(true);
        editor.classList.add('hidden');
        return;
      }
      setAdvancedVisible(advancedVisible);
      const metrics = metricLearners();
      const dobMissing = metrics.filter(x => !x.date_of_birth).length;
      const birthYearMissing = metrics.filter(x => !(x.birth_year || (x.date_of_birth && String(x.date_of_birth).length >= 4))).length;
      const guardianMissing = metrics.filter(x => !String(x.guardian_name || '').trim()).length;
      const contactMissing = metrics.filter(x => !(String(x.guardian_phone || '').trim() || String(x.guardian_email || '').trim())).length;
      const linMissing = metrics.filter(x => !String(x.lin || '').trim()).length;
      $('ldsTotal').textContent = metrics.length.toLocaleString();
      $('ldsDobMissing').textContent = dobMissing.toLocaleString();
      $('ldsBirthYearMissing').textContent = birthYearMissing.toLocaleString();
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
        const missing = !x.date_of_birth || !(x.birth_year || (x.date_of_birth && String(x.date_of_birth).length >= 4)) || !String(x.guardian_name || '').trim() ||
          !(String(x.guardian_phone || '').trim() || String(x.guardian_email || '').trim()) || !String(x.lin || '').trim();
        const dob = x.date_of_birth ? fmtDate(x.date_of_birth) : 'Not recorded';
        const year = x.birth_year || (x.date_of_birth ? String(x.date_of_birth).slice(0, 4) : '—');
        const guardian = String(x.guardian_name || '').trim() || 'Not recorded';
        const contact = [x.guardian_phone, x.guardian_email].filter(Boolean).join(' · ') || 'Not recorded';
        const feeArrangement = currentBursaryArrangement(x);
        return '<tr tabindex="0" data-learner-sheet-id="' + htmlEscape(x.id) + '" aria-label="Open details for ' + htmlEscape(fullName) + '">' +
          '<td>' + (i + 1) + '</td><td><span class="lds-name">' + htmlEscape(fullName || 'Unnamed learner') + '</span><span class="lds-sub">' + htmlEscape(x.admission_number || 'No pupil code') + '</span></td>' +
          '<td>' + htmlEscape(className(x.class_id)) + '</td><td>' + htmlEscape(dob) + '</td><td>' + htmlEscape(year) + '</td>' +
          '<td>' + htmlEscape(guardian) + (x.alternate_guardian_name ? '<span class="lds-sub">Alternative: ' + htmlEscape(x.alternate_guardian_name) + '</span>' : '') + '</td>' +
          '<td>' + htmlEscape(x.guardian_relationship || '—') + '</td><td>' + htmlEscape(contact) + '</td><td>' + htmlEscape(x.lin || 'Not entered') + '</td>' +
          '<td><span class="lds-state ' + (feeArrangement.value === 'unknown' ? 'pending' : '') + '">' + htmlEscape(feeArrangement.value === 'bursary' ? 'Bursary' : (feeArrangement.value === 'regular' ? 'Regular fees' : 'Review')) + '</span><span class="lds-sub">' + htmlEscape(feeArrangement.label) + '</span></td>' +
          '<td><span class="lds-state ' + (missing ? 'pending' : '') + '">' + (missing ? 'Needs details' : 'Recorded') + '</span></td>' +
          '<td><button type="button" class="lds-open" data-learner-sheet-open="' + htmlEscape(x.id) + '">Select</button></td></tr>';
      }).join('') || '<tr><td colspan="12">No learners match this class, search and information filter.</td></tr>';
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

    function populateEditorClasses(selectedClassId) {
      const control = $('ldsClassId');
      const classesList = state().classes || [];
      if (!control) return;
      control.innerHTML = '<option value="">Choose class</option>' + classesList
        .slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map(item => '<option value="' + htmlEscape(item.id) + '">' + htmlEscape(item.name + (item.stream ? ' · ' + item.stream : '')) + '</option>').join('');
      control.value = selectedClassId || '';
    }

    function ugx(value) {
      return 'UGX ' + Math.round(Number(value) || 0).toLocaleString('en-UG');
    }

    async function loadFeeScheduleRows() {
      if (feeScheduleRows || feeScheduleError) return;
      if (feeSchedulePromise) {
        await feeSchedulePromise;
        return;
      }
      if (typeof db === 'undefined' || !db) {
        feeScheduleError = new Error('Finance connection is unavailable.');
        return;
      }
      feeScheduleLoading = true;
      feeSchedulePromise = (async () => {
        try {
          const { data: terms, error: termError } = await db.from('academic_terms')
            .select('id,name,academic_year_id').eq('is_current', true).eq('is_closed', false)
            .order('starts_on', { ascending: false }).limit(1);
          if (termError) throw termError;
          const term = (terms || [])[0];
          if (!term) throw new Error('There is no open current academic term.');
          const { data, error } = await db.from('fee_schedules')
            .select('class_group,learner_type,amount_ugx,fee_items(name)')
            .eq('is_active', true)
            .or('term_id.is.null,term_id.eq.' + term.id)
            .or('academic_year_id.is.null,academic_year_id.eq.' + term.academic_year_id);
          if (error) throw error;
          feeScheduleRows = data || [];
          feeScheduleTermLabel = term.name || 'Current term';
        } catch (error) {
          feeScheduleError = error;
        }
      })();
      try {
        await feeSchedulePromise;
      } finally {
        feeScheduleLoading = false;
        feeSchedulePromise = null;
      }
    }

    async function renderLearnerFeePreview() {
      const host = $('ldsFeePreview');
      if (!host) return;
      const requestId = ++feePreviewRequest;
      const classId = $('ldsClassId').value;
      const selectedClass = state().classes.find(item => item.id === classId);
      if (!selectedClass) {
        host.innerHTML = '<strong>Current-term fee estimate</strong><div class="lds-hint">Choose a class to view the applicable fee schedule.</div>';
        return;
      }
      host.innerHTML = '<strong>Current-term fee estimate</strong><div class="lds-hint">Loading the approved fee schedule…</div>';
      await loadFeeScheduleRows();
      if (requestId !== feePreviewRequest) return;
      if (feeScheduleError) {
        host.innerHTML = '<strong>Current-term fee estimate</strong><div class="lds-hint">Could not verify the current fee schedule: ' + htmlEscape(feeScheduleError.message || 'Please check Finance.') + '</div>';
        return;
      }
      const type = $('ldsLearnerType').value || 'Day';
      const boarding = type === 'Boarding';
      const meals = !boarding;
      const rows = feeScheduleRows.filter(row =>
        row.class_group === selectedClass.name &&
        (row.learner_type === 'Any' || row.learner_type === type) &&
        (row.fee_items && ['School fees', 'Boarding', 'Breakfast', 'Lunch'].includes(row.fee_items.name))
      );
      const amountFor = name => {
        const match = rows.filter(row => row.fee_items.name === name)
          .sort((a, b) => (a.learner_type === type ? -1 : 1) - (b.learner_type === type ? -1 : 1))[0];
        return match ? Number(match.amount_ugx) || 0 : 0;
      };
      const learner = state().students.find(item => item.id === selectedId);
      const currentAward = learner && activeBursaryAwards.get(learner.id);
      const isAwarded = $('ldsFeeArrangement').value === 'bursary' && currentAward;
      const schoolFee = isAwarded ? Number(currentAward.amount_payable_ugx) || 0 :
        ($('ldsFeeArrangement').value === 'bursary' && learner && learner.is_bursary
          ? Number(learner.bursary_fee_ugx) || amountFor('School fees') : amountFor('School fees'));
      const items = [];
      if (boarding) {
        const packageAmount = isAwarded ? Number(currentAward.amount_payable_ugx) || 0 : amountFor('Boarding');
        if (isAwarded || packageAmount) {
          items.push(['Boarding package' + (isAwarded ? ' / bursary payable' : ' (includes school fees)'), packageAmount]);
        }
      } else {
        if (schoolFee) items.push(['School fees' + (isAwarded || $('ldsFeeArrangement').value === 'bursary' ? ' / bursary payable' : ''), schoolFee]);
        if ($('ldsBreakfast').checked && amountFor('Breakfast')) items.push(['Breakfast', amountFor('Breakfast')]);
        if ($('ldsLunch').checked && amountFor('Lunch')) items.push(['Lunch', amountFor('Lunch')]);
      }
      const total = items.reduce((sum, item) => sum + item[1], 0);
      host.innerHTML = '<strong>Current-term fee estimate · ' + htmlEscape(feeScheduleTermLabel) + '</strong>' +
        (items.length ? '<div class="lds-hint">' + items.map(item => '<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0"><span>' + htmlEscape(item[0]) + '</span><strong>' + htmlEscape(ugx(item[1])) + '</strong></div>').join('') +
          '<div style="display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--cornhill-line,#dce7de);padding-top:8px;margin-top:5px"><strong>Estimated total</strong><strong>' + htmlEscape(ugx(total)) + '</strong></div></div>'
          : '<div class="lds-hint">No matching fee schedule rows were found for this class and package. Check Finance → Fee items / Fee schedules before saving charges.</div>');
      if ($('ldsFeeArrangement').value === 'bursary' && !currentAward) {
        host.insertAdjacentHTML('beforeend', '<div class="lds-hint">Bursary is selected but not yet approved. This estimate is provisional; the approved payable amount will be set in Finance.</div>');
      }
      if (boarding) host.insertAdjacentHTML('beforeend', '<div class="lds-hint">The boarding package already includes school fees. It is the single total for a boarder; no separate school-fees charge is added.</div>');
    }

    function syncLearnerPackageControls() {
      const type = $('ldsLearnerType');
      const breakfast = $('ldsBreakfast');
      const lunch = $('ldsLunch');
      const classId = $('ldsClassId').value;
      const classItem = state().classes.find(item => item.id === classId);
      const isP7 = classItem && classItem.name === 'P7';
      if (isP7) type.value = 'Boarding';
      const boarding = type.value === 'Boarding';
      breakfast.disabled = boarding;
      lunch.disabled = boarding;
      if (boarding) {
        breakfast.checked = false;
        lunch.checked = false;
      }
      const form = $('studentForm');
      if (form) {
        writeMainValue(form, 'learner_type', type.value);
        writeMainValue(form, 'takes_breakfast', breakfast.checked);
        writeMainValue(form, 'takes_lunch', lunch.checked);
      }
      renderLearnerFeePreview();
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
      populateEditorClasses(learner.class_id);
      $('ldsLearnerType').value = learner.learner_type || 'Day';
      $('ldsBreakfast').checked = !!learner.takes_breakfast;
      $('ldsLunch').checked = !!learner.takes_lunch;
      syncLearnerPackageControls();
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
      if (editor.classList.contains('hidden') && !editor.contains(document.activeElement)) {
        returnFocusElement = document.activeElement;
      }
      try {
        await prepareExistingEdit(learner);
        selectedId = id;
        dirty = false;
        editor.dataset.saving = '0';
        editor.classList.remove('hidden');
        document.body.classList.add('lds-editor-open');
        editor.setAttribute('aria-hidden', 'false');
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
        updateBursaryEditor(learner);
        updateLifecycleControls(learner);
        $('ldsLifecycleReason').value = '';
        $('ldsLifecycleStatus').textContent = 'Selected record status: ' + (learner.status || 'Unknown') + '.';
        $('learnerDetailsSheetStatus').textContent = 'Editing ' + [learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ') + '. Assign class and package here; the current-term fee estimate updates automatically.';
        try { quickForm.elements.first_name.focus({ preventScroll: true }); }
        catch (_) { quickForm.elements.first_name.focus(); }
      } catch (error) {
        if (typeof message === 'function') message('appMsg', 'Could not open learner information: ' + (error.message || 'Please refresh the register.'), true);
      }
    }


    function updateLifecycleControls(learner) {
      const archiveButton = $('ldsArchiveRestore');
      const deleteButton = $('ldsDeletePermanently');
      const status = $('ldsLifecycleStatus');
      if (!archiveButton || !deleteButton || !learner) return;
      const archived = learner.status === 'Archived';
      archiveButton.textContent = archived ? 'Restore learner' : 'Archive learner';
      archiveButton.disabled = state().role !== 'Admin' || state().demo;
      deleteButton.disabled = state().role !== 'Admin' || state().demo;
      if (status) status.textContent = archived
        ? 'This learner is archived. You can restore the record or permanently delete it.'
        : 'This learner is not archived. You can archive it or permanently delete it.';
    }

    function lifecycleStoragePath(bucket, value) {
      const rawValue = String(value || '').trim();
      if (!rawValue) return null;
      let path = rawValue;
      if (/^https?:\/\//i.test(rawValue)) {
        let parsed;
        try { parsed = new URL(rawValue); } catch (_) {
          throw new Error('An attached file has an unreadable storage URL. No learner data was deleted.');
        }
        const marker = '/storage/v1/object/';
        const start = parsed.pathname.indexOf(marker);
        if (start < 0) throw new Error('An attached file is outside the supported private storage location. No learner data was deleted.');
        const parts = parsed.pathname.slice(start + marker.length).split('/');
        if (!['public', 'sign', 'authenticated'].includes(parts[0]) || parts[1] !== bucket || parts.length < 3) {
          throw new Error('An attached file is not in the expected ' + bucket + ' storage bucket. No learner data was deleted.');
        }
        path = parts.slice(2).join('/');
        try { path = decodeURIComponent(path); } catch (_) {}
      } else {
        path = path.replace(/^\/+/, '');
        if (path.startsWith(bucket + '/')) path = path.slice(bucket.length + 1);
      }
      if (!path || path.includes('..')) throw new Error('An attached file has an invalid storage path. No learner data was deleted.');
      return path;
    }

    async function removeLearnerStorageAttachments(learnerId) {
      if (typeof db === 'undefined' || !db || !db.storage) throw new Error('Private file storage is unavailable. No learner data was deleted.');
      const [studentResult, awardsResult] = await Promise.all([
        db.from('students').select('photo_path').eq('id', learnerId).single(),
        db.from('learner_bursary_awards').select('support_document_path').eq('student_id', learnerId)
      ]);
      if (studentResult.error) throw studentResult.error;
      if (awardsResult.error) throw awardsResult.error;
      const groups = new Map();
      const add = (bucket, value) => {
        const path = lifecycleStoragePath(bucket, value);
        if (!path) return;
        if (!groups.has(bucket)) groups.set(bucket, new Set());
        groups.get(bucket).add(path);
      };
      add('learner-photos', studentResult.data && studentResult.data.photo_path);
      (awardsResult.data || []).forEach(row => add('bursary-evidence', row.support_document_path));
      let removed = 0;
      for (const [bucket, paths] of groups.entries()) {
        const list = Array.from(paths);
        const { error } = await db.storage.from(bucket).remove(list);
        if (error) throw new Error('Could not remove attached files from ' + bucket + ': ' + error.message + '. The learner record was not deleted.');
        removed += list.length;
      }
      return removed;
    }

    async function runLearnerLifecycleAction(action) {
      const st = state();
      if (st.role !== 'Admin' || st.demo || !selectedId) return;
      if (dirty) {
        $('ldsLifecycleStatus').textContent = 'Save or cancel your unsaved profile edits before archiving or deleting this learner.';
        return;
      }
      if (typeof db === 'undefined' || !db || typeof db.rpc !== 'function') {
        $('ldsLifecycleStatus').textContent = 'The secure school database connection is unavailable.';
        return;
      }
      const learner = st.students.find(item => item.id === selectedId);
      if (!learner) {
        $('ldsLifecycleStatus').textContent = 'Refresh the register. This learner is no longer available.';
        return;
      }
      const reason = String($('ldsLifecycleReason').value || '').trim();
      if (reason.length < 5 || reason.length > 500) {
        $('ldsLifecycleStatus').textContent = 'Enter a reason between 5 and 500 characters.';
        $('ldsLifecycleReason').focus();
        return;
      }
      const archiveButton = $('ldsArchiveRestore');
      const deleteButton = $('ldsDeletePermanently');
      archiveButton.disabled = true;
      deleteButton.disabled = true;
      $('ldsLifecycleStatus').textContent = 'Checking the learner record and linked data…';
      let attachmentsRemoved = false;
      try {
        if (action === 'archive') {
          const archived = learner.status !== 'Archived';
          const { error } = await db.rpc('admin_set_learner_archived', {
            p_student_id: learner.id,
            p_archived: archived,
            p_reason: reason
          });
          if (error) throw error;
          $('ldsLifecycleStatus').textContent = archived
            ? 'Learner archived. Refreshing the register…'
            : 'Learner restored. Refreshing the register…';
          window.location.reload();
          return;
        }

        if (action !== 'delete') return;
        const code = String(learner.admission_number || '').trim();
        if (!code) throw new Error('This learner has no pupil code to confirm against. Ask the administrator to correct the identity record first.');

        const [paymentsResult, chargesResult] = await Promise.all([
          db.from('school_payments').select('amount_ugx,status,receipt_no').eq('student_id', learner.id),
          db.from('learner_charges').select('amount_ugx,description').eq('student_id', learner.id)
        ]);
        if (paymentsResult.error) throw paymentsResult.error;
        if (chargesResult.error) throw chargesResult.error;
        const payments = paymentsResult.data || [];
        const charges = chargesResult.data || [];
        const paymentTotal = payments.reduce((sum, row) => sum + (Number(row.amount_ugx) || 0), 0);
        const chargeTotal = charges.reduce((sum, row) => sum + (Number(row.amount_ugx) || 0), 0);
        const fullName = [learner.first_name, learner.middle_name, learner.last_name].filter(Boolean).join(' ');
        const confirmation = [
          'PERMANENTLY DELETE THIS LEARNER?',
          '',
          fullName + ' · ' + code,
          '',
          payments.length + ' payment/receipt record(s): UGX ' + paymentTotal.toLocaleString('en-UG'),
          charges.length + ' fee/bursary charge(s): UGX ' + chargeTotal.toLocaleString('en-UG'),
          '',
          'This also removes guardian links, parent portal sessions, marks, report links, attendance/operational records and the learner history. Daily collection summaries will be recalculated so other learners remain.',
          'This cannot be undone. Use Archive instead when the learner record may be needed later.',
          '',
          'Continue to the exact-code confirmation?'
        ].join('\n');
        if (!window.confirm(confirmation)) return;
        const typedCode = window.prompt('Type this exact pupil code to confirm permanent deletion:\n' + code);
        if (typedCode !== code) {
          $('ldsLifecycleStatus').textContent = 'The exact code did not match. No learner records were deleted.';
          return;
        }
        if (!window.confirm('Final confirmation: permanently delete ' + fullName + ' (' + code + ') and the linked transactions/history?')) return;

        $('ldsLifecycleStatus').textContent = 'Removing attached private files and learner records…';
        const attachmentCount = await removeLearnerStorageAttachments(learner.id);
        attachmentsRemoved = attachmentCount > 0;
        const { data, error } = await db.rpc('admin_delete_learner_permanently', {
          p_student_id: learner.id,
          p_confirmation_code: typedCode,
          p_reason: reason,
          p_storage_cleanup_confirmed: attachmentCount > 0
        });
        if (error) {
          const note = attachmentsRemoved ? ' Private attachments were removed, but the database record was not deleted.' : '';
          throw new Error((error.message || 'Permanent deletion failed.') + note);
        }
        $('ldsLifecycleStatus').textContent = 'Permanent deletion completed. Refreshing the register…';
        window.location.reload();
      } catch (error) {
        $('ldsLifecycleStatus').textContent = (error && error.message ? error.message : 'The learner action failed. No database deletion was confirmed.');
        archiveButton.disabled = false;
        deleteButton.disabled = false;
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
      editor.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lds-editor-open');
      restoreEditorFocus();
    }

    function closeEditor(askDiscard) {
      if (!selectedId) {
        editor.classList.add('hidden');
        return;
      }
      if (askDiscard && dirty && !window.confirm('Close this editor and discard unsaved changes?')) return;
      discardMainDraft();
    }

    $('ldsArchiveRestore').addEventListener('click', () => runLearnerLifecycleAction('archive'));
    $('ldsDeletePermanently').addEventListener('click', () => runLearnerLifecycleAction('delete'));
    $('ldsRecordStatusFilter').addEventListener('change', renderSheet);
    $('ldsClassId').addEventListener('change', () => {
      const form = $('studentForm');
      if (form) writeMainValue(form, 'class_id', $('ldsClassId').value);
      syncLearnerPackageControls();
    });
    $('ldsLearnerType').addEventListener('change', syncLearnerPackageControls);
    $('ldsBreakfast').addEventListener('change', () => {
      const form = $('studentForm');
      if (form) writeMainValue(form, 'takes_breakfast', $('ldsBreakfast').checked);
      renderLearnerFeePreview();
    });
    $('ldsLunch').addEventListener('change', () => {
      const form = $('studentForm');
      if (form) writeMainValue(form, 'takes_lunch', $('ldsLunch').checked);
      renderLearnerFeePreview();
    });

    $('ldsFeeArrangement').addEventListener('change', event => {
      const learner = state().students.find(x => x.id === selectedId);
      if (!learner) return;
      const current = currentBursaryArrangement(learner);
      const action = $('ldsOpenBursaryApproval');
      const note = $('ldsBursaryArrangementStatus');
      if (event.target.value === 'regular' && current.value === 'bursary') {
        event.target.value = 'bursary';
        action.hidden = true;
        note.textContent = 'This learner has a bursary recorded. The award cannot be cancelled by changing this selector. A return to regular fees needs an approved amendment and reconciliation of the current term charges; no fee or receipt has been changed.';
        return;
      }
      if (event.target.value === 'bursary' && current.value === 'regular') {
        const learner = state().students.find(x => x.id === selectedId);
        action.hidden = false;
        if (!learner || !learner.class_id) {
          action.disabled = true;
          action.textContent = 'Assign class first';
          note.textContent = 'This learner has not been assigned to a class. Before approving a bursary, use “Open full learner record” below to assign the correct class and save. The Finance system needs the class to calculate the correct current-term fee. No approval has been submitted.';
          return;
        }
        action.disabled = false;
        action.textContent = 'Open bursary approval';
        note.textContent = 'Bursary / sponsored learner selected. The class and package are shown above. Open Finance approval below and complete the effective dates, category, approved payable amount and reason. The learner remains on regular fees until that approval is submitted.';
        renderLearnerFeePreview();
        return;
      }
      action.hidden = true;
      action.disabled = false;
      action.textContent = 'Open bursary approval';
      note.textContent = current.label + '. ' + current.description;
      renderLearnerFeePreview();
    });
    $('ldsOpenBursaryApproval').addEventListener('click', openExistingBursaryApproval);
    window.addEventListener('cornhill:bursary-award-updated', async () => {
      const returnLearnerId = bursaryReturnLearnerId;
      await refreshBursaryAwards();
      if (!returnLearnerId) return;
      bursaryReturnLearnerId = null;
      if (typeof tab === 'function') tab('students');
      window.setTimeout(() => {
        const learner = state().students.find(item => item.id === returnLearnerId);
        if (learner) openEditor(returnLearnerId);
        else if (typeof message === 'function') message('appMsg', 'The bursary was recorded, but this learner is no longer available in the active register. Refresh the register to continue.');
      }, 180);
    });

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
      if (!quickForm.elements.class_id.value) {
        $('learnerDetailsSheetStatus').textContent = 'Choose the learner’s class before saving. The class is used to calculate the correct school fee and meal / boarding package.';
        $('ldsClassId').focus();
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
    document.addEventListener('keydown', event => {
      if (editor.classList.contains('hidden')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor(true);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(editor.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'))
          .filter(node => node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null);
        if (!focusable.length) { event.preventDefault(); editor.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !editor.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    });
    $('learnerDetailsCancel').addEventListener('click', () => closeEditor(true));

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
        editor.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('lds-editor-open');
        if (nextId) window.setTimeout(() => openEditor(nextId), 80);
        else restoreEditorFocus();
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