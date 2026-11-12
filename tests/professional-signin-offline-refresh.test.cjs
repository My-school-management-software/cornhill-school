const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const services = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

test('dashboard sign-in uses the new professional split layout', () => {
  assert.ok(dashboard.includes('cornhill-professional-signin-v2'));
  assert.ok(dashboard.includes('#login.login-design-surface:before'));
  assert.ok(dashboard.includes('WE SHARE ONE DREAM'));
  assert.ok(dashboard.includes('@media(max-width:760px)'));
});

test('main sign-in keeps every existing account and recovery control', () => {
  for (const id of [
    'classLoginDirectory','staffLoginOpen','staffLoginPanel','schoolStaffRoleChoices',
    'schoolStaffRoleKey','schoolStaffAccessCode','staffLoginEmail','staffLoginPassword',
    'staffSignIn','selectedTeacherLogin','teacherAccessCode','teacherClassCode',
    'adminLoginOpen','adminLoginPanel','adminEmail','adminPassword',
    'adminSignIn','forgotAdminPassword','passwordRecoveryForm'
  ]) assert.ok(dashboard.includes('id="' + id + '"'), 'Missing login control: ' + id);
  for (const role of [
    'Headteacher','Deputy Headteacher','DOS','Main Bursar','Deputy Bursar','Other Staff'
  ]) assert.ok(dashboard.includes('data-school-staff-role="' + role + '"'));
});

test('services sign-in uses the matching professional layout and preserves role checks', () => {
  assert.ok(services.includes('cornhill-services-professional-signin-v2'));
  assert.ok(services.includes('#loginPanel.login:before'));
  assert.ok(services.includes('validateSelectedLoginRole'));
  for (const role of [
    'Teacher','Headteacher','Deputy Headteacher','DOS','Main Bursar','Deputy Bursar','Other Staff','Director'
  ]) assert.ok(services.includes('data-login-role="' + role + '"'));
  assert.ok(services.includes("await validateSelectedLoginRole();"));
});

test('PWA cache version is advanced and online asset refresh is network-first', () => {
  assert.ok(worker.includes("cornhill-shell-v99"));
  assert.ok(worker.includes("cornhill-static-v99"));
  assert.ok(worker.includes("new Request(request, { cache: 'no-store' })"));
  assert.ok(worker.includes('const cached = await cache.match(request);'));
  assert.ok(worker.includes('installed PWA receives current files immediately'));
});

test('service worker continues to keep authentication and database traffic network-only', () => {
  assert.ok(worker.includes('Do not cache Supabase, authentication, uploads, payments or any unknown API.'));
  assert.ok(worker.includes("if (request.method !== 'GET') return;"));
  assert.ok(worker.includes("if (!STATIC_HOSTS.has(url.hostname) || !STATIC_CDN.some(asset => url.href.startsWith(asset))) return;"));
});
