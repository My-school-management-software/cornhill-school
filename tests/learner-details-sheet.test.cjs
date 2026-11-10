'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('learner information completion sheet is connected to the main Learner Register', () => {
  const index = read('index.html');
  const script = '/assets/cornhill-learner-details-sheet.js';
  assert.ok(index.includes('<script src="' + script + '"></script>'));
  assert.ok(index.indexOf('/assets/main-school-workspace-bridge.js') < index.indexOf(script));
  const source = read('assets/cornhill-learner-details-sheet.js');
  try { new vm.Script(source, { filename: 'cornhill-learner-details-sheet.js' }); } catch (error) { console.error(error.stack, error.lineNumber, error.columnNumber, error.pos); throw error; }
});

test('the class sheet supports DOB, verified birth year, guardian details and safe save reuse', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  for (const field of [
    'date_of_birth', 'birth_year', 'guardian_name', 'guardian_relationship',
    'guardian_phone', 'guardian_email', 'alternate_guardian_name',
    'alternate_guardian_phone', 'lin', 'p7_index_number'
  ]) assert.ok(source.includes(field), field + ' must be editable or displayed in the sheet');
  assert.match(source, /profile\?\.role !== 'Admin'/);
  assert.match(source, /form\.requestSubmit\(submit\)/);
  assert.match(source, /restoreLocalAutosaveForm/);
  assert.match(source, /Learner information completion sheet/);
  assert.match(source, /Do not guess/);
});

test('offline app shell includes the new learner details sheet and refreshes old caches', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /cornhill-shell-v87/);
  assert.match(sw, /cornhill-static-v87/);
  assert.ok(sw.includes('/assets/cornhill-learner-details-sheet.js'));
});


test('full date of birth and verified birth year are tracked as separate completion states', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes('Missing exact date of birth'));
  assert.ok(source.includes('Missing birth year'));
  assert.ok(source.includes('value="missing_year"'));
  assert.match(source, /const hasDob = x => !!x\.date_of_birth/);
  assert.match(source, /const hasBirthYear = x => !!\(x\.birth_year/);
});


test('class-sheet data entry supports previous, next and validated save-and-next navigation', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes('id="learnerDetailsPrevious"'));
  assert.ok(source.includes('id="learnerDetailsNext"'));
  assert.ok(source.includes('type="submit" id="learnerDetailsSaveNext"'));
  assert.ok(source.includes("event.submitter.id === 'learnerDetailsSaveNext'"));
  assert.ok(source.includes("editor.dataset.nextLearnerId"));
  assert.ok(source.includes("window.setTimeout(() => openEditor(nextId), 80)"));
});


test('select opens the same learner in a centered accessible editor instead of jumping below the sheet', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.match(source, /role="dialog" aria-modal="true" aria-hidden="true"/);
  assert.match(source, /#learnerDetailsEditor\{position:fixed/);
  assert.match(source, /body\.lds-editor-open::before/);
  assert.match(source, /document\.body\.classList\.add\('lds-editor-open'\)/);
  assert.match(source, /quickForm\.elements\.first_name\.focus/);
  assert.doesNotMatch(source, /editor\.scrollIntoView/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key === 'Tab'/);
  assert.match(source, /restoreEditorFocus/);
});

test('learner editor action buttons use compact sizing on desktop and mobile', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.match(source, /\.lds-actions button\{[^}]*width:auto!important/);
  assert.match(source, /\.lds-actions button\{[^}]*min-height:36px/);
  assert.match(source, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /\.lds-actions button\{width:100%!important;min-height:38px/);
});


test('completion sheet shows regular-fee and bursary status from current approved awards', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  for (const text of [
    'id="ldsFeeArrangement"',
    'value="regular">Regular fees',
    'value="bursary">Bursary / sponsored learner',
    "db.from('learner_bursary_awards')",
    ".lte('effective_from', today)",
    ".or('effective_until.is.null,effective_until.gte.' + today)",
    'Fee arrangement'
  ]) assert.ok(source.includes(text), text + ' must be present in the learner editor');
});

test('bursary selection routes to the existing Finance approval instead of directly changing learner fees', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  const index = read('index.html');
  assert.ok(source.includes('openExistingBursaryApproval'));
  assert.ok(source.includes("tab('finance')"));
  assert.ok(source.includes("select.value = learner.id"));
  assert.ok(source.includes('learner remains on regular fees until that approval is submitted'));
  assert.doesNotMatch(source, /db\.from\('students'\)\.update/);
  assert.ok(index.includes("db.rpc('admin_award_bursary_to_existing_learner'"));
  assert.ok(index.includes("cornhill:bursary-award-updated"));
});

test('an active bursary cannot be switched to regular fees by editing the profile selector', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes("event.target.value === 'regular' && current.value === 'bursary'"));
  assert.ok(source.includes('The award cannot be cancelled by changing this selector'));
  assert.ok(source.includes('no fee or receipt has been changed'));
  const fieldNames = source.match(/const fieldNames = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(fieldNames, /is_bursary|bursary_category|bursary_fee_ugx|bursary_reason/);
});

test('learner photographs on report cards remain inactive and are tracked in the private work plan', () => {
  const index = read('index.html');
  const start = index.indexOf('<section id="workPlan"');
  const end = index.indexOf('</section>', start);
  const workPlan = index.slice(start, end);
  assert.ok(workPlan.includes('Learner photographs on report cards'));
  assert.ok(workPlan.includes('Inactive · Not enabled'));
  assert.ok(workPlan.includes('Do not display or print learner photographs on report cards'));
  assert.ok(workPlan.includes('Pending / inactive'));
});


test('bursary approval is blocked with a clear class-assignment instruction when the learner has no class', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.match(source, /if \(!learner\.class_id\)/);
  assert.ok(source.includes('Assign class first'));
  assert.ok(source.includes('Open full learner record'));
  assert.ok(source.includes('Finance needs the class to identify the correct current-term fee'));
  assert.ok(source.includes('No bursary has been recorded'));
});

test('repeated bursary approval taps cannot start overlapping Finance loads', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.match(source, /let bursaryApprovalOpening = false/);
  assert.match(source, /state\(\)\.demo \|\| bursaryApprovalOpening\) return/);
  assert.ok(source.includes("action.textContent = 'Opening Finance…'"));
  assert.ok(source.includes('bursaryApprovalOpening = false'));
});

test('a successful bursary award refreshes and reopens the same learner completion sheet', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.match(source, /window\.addEventListener\('cornhill:bursary-award-updated', async \(\) => \{/);
  assert.match(source, /await refreshBursaryAwards\(\);/);
  assert.match(source, /tab\('students'\)/);
  assert.match(source, /openEditor\(returnLearnerId\)/);
});


test('class assignment is available directly in the completion editor and saves through the protected learner form', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.ok(source.includes('id="ldsClassId" name="class_id"'));
  assert.ok(source.includes('populateEditorClasses(learner.class_id)'));
  assert.ok(source.includes("writeMainValue(form, 'class_id', $('ldsClassId').value)"));
  assert.ok(source.includes("quickForm.elements.class_id.value"));
  assert.ok(source.includes("form.requestSubmit(submit)"));
});

test('class and learner package selection previews the current term school, boarding and meal fees', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  for (const value of ["db.from('fee_schedules')", "db.from('academic_terms')", "fee_items(name)",
    "['School fees', 'Boarding', 'Breakfast', 'Lunch'].includes(row.fee_items.name)", "row.fee_items.name === name", "id=\"ldsLearnerType\"", "id=\"ldsBreakfast\"", "id=\"ldsLunch\"",
    "Current-term fee estimate", "Estimated total"]) assert.ok(source.includes(value), value);
  assert.ok(source.includes("if (isP7) type.value = 'Boarding'"));
  assert.ok(source.includes("breakfast.disabled = boarding"));
  assert.ok(source.includes("lunch.disabled = boarding"));
});

test('boarding learners see one all-inclusive boarding package without a separate school-fee line', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  const start = source.indexOf('const items = [];');
  const end = source.indexOf('const total = items.reduce', start);
  assert.ok(start >= 0 && end > start, 'fee preview item builder must exist');
  const builder = source.slice(start, end);
  const boardingStart = builder.indexOf('if (boarding) {');
  const dayStart = builder.indexOf('} else {', boardingStart);
  assert.ok(boardingStart >= 0 && dayStart > boardingStart, 'boarding and day fee logic must be separate');
  const boardingBranch = builder.slice(boardingStart, dayStart);
  const dayBranch = builder.slice(dayStart);
  assert.ok(boardingBranch.includes("amountFor('Boarding')"));
  assert.ok(boardingBranch.includes("currentAward.amount_payable_ugx"));
  assert.ok(boardingBranch.includes('includes school fees'));
  assert.doesNotMatch(boardingBranch, /schoolFee|Breakfast|Lunch/);
  assert.match(dayBranch, /if \(schoolFee\)/);
  assert.match(dayBranch, /amountFor\('Breakfast'\)/);
  assert.match(dayBranch, /amountFor\('Lunch'\)/);
});

test('P7 class selection enforces the existing boarding package rule in the editor', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.match(source, /const isP7 = classItem && classItem\.name === 'P7'/);
  assert.match(source, /if \(isP7\) type\.value = 'Boarding'/);
  assert.ok(source.includes("writeMainValue(form, 'takes_breakfast', breakfast.checked)"));
  assert.ok(source.includes("writeMainValue(form, 'takes_lunch', lunch.checked)"));
});

test('broken legacy full-record handoff is removed; learner details remain in the working editor', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  assert.doesNotMatch(source, /document\.querySelector\('\.editLearner\[data-id=/);
  assert.ok(source.includes('id="ldsClassId"'));
  assert.ok(source.includes('id="ldsAdmissionDate"'));
  assert.ok(source.includes('id="ldsPreviousSchool"'));
});
