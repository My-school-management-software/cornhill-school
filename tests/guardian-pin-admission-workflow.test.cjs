'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptAt = html.indexOf('async function ensureGuardianPinForAdmission');
const scriptOpen = html.lastIndexOf('<script', scriptAt);
const scriptStart = html.indexOf('>', scriptOpen) + 1;
const scriptEnd = html.indexOf('</script>', scriptAt);
const appScript = html.slice(scriptStart, scriptEnd);
const allJs = html;

test('administrator navigation names the integrated guardian PIN workspace', () => {
  assert.match(html, /Parent Access &amp; Guardian PINs/);
  assert.match(html, /id="parentAccessTab"/);
});

test('the administrator register includes all saved learners, not only completed admissions', () => {
  assert.match(html, /Every saved learner record appears in this register, including admissions still in progress/);
  assert.match(allJs, /db\.rpc\('admin_parent_portal_directory'\)/);
  assert.match(allJs, /students\|\|\[\]\)\.find\(x=>x\.id===r\.student_id\),incomplete=student\?\.admission_complete===false/);
});

test('the register visibly marks incomplete admissions', () => {
  assert.match(allJs, /ADMISSION IN PROGRESS/);
  assert.match(allJs, /Admission saved/);
});

test('the learner admission form explains automatic guardian PIN setup', () => {
  assert.match(html, /a guardian PIN is generated automatically when a guardian name and valid Ugandan phone are available/);
});

test('Ugandan local phone numbers are normalized to international format', () => {
  assert.match(allJs, /phone='\+256'\+phone\.slice\(1\)/);
  assert.match(allJs, /return \/\^\\\+256\[0-9\]\{9\}\$\/\.test\(phone\)\?phone:null/);
});

test('admission setup first checks for an existing guardian contact', () => {
  assert.match(allJs, /from\('parent_guardian_contacts'\)\.select\('id,guardian_name,relationship,phone_e164,whatsapp_e164,sms_opt_in,whatsapp_opt_in,is_primary,is_active,guardian_pin_issued_at'\)\.eq\('student_id',studentId\)/);
});

test('admission creates a guardian contact when none exists and details are valid', () => {
  assert.match(allJs, /if\(name\.length<2\|\|!formPhone\)return \{pending:true/);
  assert.match(allJs, /insert\(\{student_id:studentId,guardian_name:name/);
  assert.match(allJs, /phone_e164:formPhone/);
});

test('admission reactivates a matching inactive guardian contact instead of duplicating it', () => {
  assert.match(allJs, /admin_update_parent_contact/);
  assert.match(allJs, /Guardian contact reactivated during learner admission/);
});

test('admission does not replace a guardian PIN that has already been issued', () => {
  assert.match(allJs, /if\(contact\.guardian_pin_issued_at\)return \{already:true,contact\}/);
});

test('admission automatically issues a PIN through the protected administrator RPC', () => {
  assert.match(allJs, /admin_issue_guardian_pin/);
  assert.match(allJs, /ensureGuardianPinForAdmission\(result\.data\.id,record\)/);
});

test('a newly issued admission PIN opens the integrated Parent Access workspace', () => {
  assert.match(allJs, /if\(guardianPinSetup\.issued\)\{tab\('parentAccess'\)/);
  assert.match(allJs, /showAdminParentPortalCredentials\(pinRow,guardianPinSetup\.credentials\)/);
});

test('admission can be saved when guardian details are missing, with PIN setup marked pending', () => {
  assert.match(allJs, /Guardian PIN pending:/);
  assert.match(allJs, /Add a guardian name and valid Ugandan phone/);
});

test('the administrator can add a guardian contact for a learner without one', () => {
  assert.match(html, /id="adminParentGuardianContactForm"/);
  assert.match(html, /id="saveAdminParentGuardianContact"/);
  assert.match(allJs, /data-add-guardian-contact/);
});

test('guardian contact creation requires a valid Ugandan phone number', () => {
  assert.match(allJs, /Enter a valid Ugandan phone number, for example \+2567XXXXXXXX/);
  assert.match(allJs, /normalizeUgParentPhone\(\$\('adminParentGuardianPhone'\)\.value\)/);
});

test('manual contact creation uses the signed-in administrator database session', () => {
  assert.match(allJs, /db\.from\('parent_guardian_contacts'\)\.insert\(\{student_id:r\.student_id/);
  assert.match(allJs, /db\.rpc\('admin_issue_guardian_pin',\{p_contact_id:contactId\}\)/);
});

test('replacing a previously issued PIN requires confirmation', () => {
  assert.match(allJs, /This guardian already has a PIN\. Saving these details will replace that PIN/);
  assert.match(allJs, /Reset the PIN for /);
});

test('one-time PIN and recovery credentials are displayed with copy controls', () => {
  assert.match(allJs, /ONE-TIME GUARDIAN CREDENTIALS — CONFIDENTIAL/);
  assert.match(allJs, /Guardian PIN/);
  assert.match(allJs, /Recovery code/);
  assert.match(allJs, /navigator\.clipboard\.writeText\(value\)/);
});

test('leaving Parent Access clears one-time credentials from the page', () => {
  assert.match(allJs, /navButton\.dataset\.tab!=='parentAccess'/);
  assert.match(allJs, /box\?\.replaceChildren\(\);box\?\.classList\.add\('hidden'\)/);
});

test('guardian PIN secrets are not stored in browser local or session storage', () => {
  assert.doesNotMatch(allJs, /(localStorage|sessionStorage)\.(setItem|set)\s*\([^)]*(pin|recovery)/i);
  assert.doesNotMatch(allJs, /guardian_pin_hash|guardian_recovery_hash/);
});

test('the parent access directory automatically loads when its administrator tab opens', () => {
  assert.match(allJs, /parentAccessTab'\)\?\.addEventListener\('click',\(\)=>\{if\(profile\?\.role==='Admin'&&!demoMode\)loadAdminParentPortalDirectory\(\)\}\)/);
});

test('the updated administrator JavaScript parses without syntax errors', () => {
  assert.ok(scriptAt >= 0 && scriptEnd > scriptAt);
  new vm.Script(appScript, { filename: 'index.html#guardian-pin-admission' });
});
