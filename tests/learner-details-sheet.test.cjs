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
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'cornhill-learner-details-sheet.js' }));
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
  assert.match(sw, /cornhill-shell-v80/);
  assert.match(sw, /cornhill-static-v80/);
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
