'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('administrator navigation clearly identifies the guardian PIN workspace', () => {
  const html = read('index.html');
  assert.ok(html.includes('Parent Access &amp; Guardian PINs'));
  assert.ok(html.includes('Guardian PIN issuance &amp; learner access'));
  assert.ok(html.includes('id="adminParentPortalDirectory"'));
  assert.ok(html.includes('id="refreshAdminParentPortalDirectory"'));
  assert.ok(html.includes('id="adminParentPortalOneTimeCredentials"'));
});

test('guardian PIN register is restricted to authenticated administrators and excluded from demo mode', () => {
  const html = read('index.html');
  assert.match(html, /profile\?\.role!=='Admin'\|\|demoMode/);
  assert.match(html, /adminParentPortalDirectory'\)\?\.classList\.toggle\('hidden',profile\?\.role!=='Admin'\)/);
  assert.match(html, /parentAccessTab'\)\?\.addEventListener\('click',\(\)=>\{if\(profile\?\.role==='Admin'&&!demoMode\)loadAdminParentPortalDirectory\(\)\}\)/);
});

test('PIN issuance requires an active guardian, valid Uganda phone and non-archived learner', () => {
  const html = read('index.html');
  const start = html.indexOf('function renderAdminParentPortalDirectory()');
  const end = html.indexOf('async function loadAdminParentPortalDirectory()', start);
  assert.ok(start >= 0 && end > start, 'administrator directory renderer must exist');
  const renderer = html.slice(start, end);
  assert.match(renderer, /\^\\\+256\[0-9\]\{9\}\$/);
  assert.match(renderer, /r\.guardian_is_active&&validGuardianPhone&&!archivedLearner/);
  assert.match(renderer, /Archived learner — PIN issuance is disabled/);
  assert.match(renderer, /db\.rpc\('admin_issue_guardian_pin'/);
});

test('PIN credentials are shown once in the administrator workspace with separate copy controls', () => {
  const html = read('index.html');
  const start = html.indexOf('function showAdminGuardianCredentials');
  const end = html.indexOf('let adminParentPortalRows=[];', start);
  assert.ok(start >= 0 && end > start, 'one-time credential renderer must exist');
  const renderer = html.slice(start, end);
  assert.match(renderer, /Guardian PIN/);
  assert.match(renderer, /Recovery code/);
  assert.match(renderer, /navigator\.clipboard\?\.writeText/);
  assert.match(renderer, /Hide one-time credentials/);
  assert.doesNotMatch(renderer, /localStorage|sessionStorage/);
});

test('general communication contact list does not offer a second PIN issuance route', () => {
  const html = read('index.html');
  const start = html.indexOf('function renderParentContacts');
  const end = html.indexOf('function showAdminGuardianCredentials', start);
  assert.ok(start >= 0 && end > start, 'communication contact renderer must exist');
  assert.doesNotMatch(html.slice(start, end), /admin_issue_guardian_pin/);
});

test('leaving the Parent Access workspace clears one-time credentials from the page', () => {
  const html = read('index.html');
  assert.match(html, /navButton\.dataset\.tab!=='parentAccess'\)\{const box=\$\('adminParentPortalOneTimeCredentials'\);box\?\.replaceChildren\(\);box\?\.classList\.add\('hidden'\)\}/);
});

test('guardian PIN UI script parses without syntax errors', () => {
  const html = read('index.html');
  const marker = html.indexOf('function showAdminGuardianCredentials');
  const open = html.lastIndexOf('<script>', marker);
  const close = html.indexOf('</script>', marker);
  assert.ok(open >= 0 && close > marker, 'guardian PIN script block must be present');
  new vm.Script(html.slice(open + '<script>'.length, close), { filename: 'index.html#guardian-pin-management' });
});

test('offline app shell cache is refreshed for the new administrator workspace', () => {
  const sw = read('service-worker.js');
  assert.match(sw, /cornhill-shell-v86/);
  assert.match(sw, /cornhill-static-v86/);
});
