const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'assets', 'cornhill-app-centre.js');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadHelper() {
  const window = { location: { origin: 'https://cornhill-school.example' }, URL };
  vm.runInNewContext(helperSource, { window, URL, Set, Array, String, Object }, {
    filename: 'cornhill-app-centre.js'
  });
  return window.CornhillAppCentre;
}

test('App Centre hides inactive registry entries and displays the first active entry for duplicate destinations only once', () => {
  const helper = loadHelper();
  const rows = [
    { app_key: 'staff-communications', name: 'Staff Communications & Events', is_active: true,
      app_url: 'https://staff-communications-cornhill-school.vercel.app/apps/staff-communications/' },
    { app_key: 'staff-communication-hub', name: 'Staff Communication Feed', is_active: true,
      app_url: 'https://staff-communications-cornhill-school.vercel.app/apps/staff-communications' },
    { app_key: 'old-service-hub', name: 'Old School Services Hub', is_active: false,
      app_url: 'https://services-cornhill-school.vercel.app/apps/school-services/' },
    { app_key: 'banking', name: 'Banking & Daily Deposits', is_active: true,
      app_url: 'https://banking-cornhill-school.vercel.app/apps/banking/' }
  ];
  const visible = helper.getVisibleRows(rows);
  assert.deepEqual(Array.from(visible, app => app.app_key), ['staff-communications', 'banking']);
});

test('App Centre treats query parameter order and trailing slashes as the same destination', () => {
  const helper = loadHelper();
  const rows = [
    { app_key: 'one', is_active: true, app_url: '/apps/school-services/?workspace=library&mode=compact' },
    { app_key: 'two', is_active: true, app_url: '/apps/school-services?mode=compact&workspace=library' },
    { app_key: 'three', is_active: true, app_url: '/apps/school-services/?workspace=transport' }
  ];
  assert.deepEqual(Array.from(helper.getVisibleRows(rows), app => app.app_key), ['one', 'three']);
});

test('App Centre keeps separate workspaces and rejects malformed or non-web destinations', () => {
  const helper = loadHelper();
  const rows = [
    { app_key: 'library', is_active: true, app_url: 'https://services-cornhill-school.vercel.app/apps/school-services/?workspace=library' },
    { app_key: 'transport', is_active: true, app_url: 'https://services-cornhill-school.vercel.app/apps/school-services/?workspace=transport' },
    { app_key: 'javascript', is_active: true, app_url: 'javascript:alert(1)' },
    { app_key: 'broken', is_active: true, app_url: 'http://[invalid' }
  ];
  assert.deepEqual(Array.from(helper.getVisibleRows(rows), app => app.app_key), ['library', 'transport']);
});

test('main dashboard loads the shared App Centre helper before its inline application code', () => {
  const helper = dashboardSource.indexOf('/assets/cornhill-app-centre.js');
  const inline = dashboardSource.indexOf('<script>\nconst SUPABASE_URL=');
  assert.ok(helper >= 0, 'main dashboard must load the app-centre helper');
  assert.ok(inline > helper, 'helper must load before the App Centre renderer is defined');
  assert.ok(dashboardSource.includes('CornhillAppCentre?.getVisibleRows?.(appCentreRows)'));
});
