const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('main dashboard does not render or update the removed top connection status banner', () => {
  assert.doesNotMatch(html, /id=["']connectionStatus["']/);
  assert.doesNotMatch(html, /Pending teacher marks and attendance requests will be synchronised/);
  assert.doesNotMatch(html, /OFFLINE MODE · Saved CORNHILL app is available/);
  assert.doesNotMatch(html, /getElementById\(['"]connectionStatus['"]\)/);
});

const bridge = fs.readFileSync(path.join(__dirname, '..', 'assets', 'main-school-workspace-bridge.js'), 'utf8');
const offlineClient = fs.readFileSync(path.join(__dirname, '..', 'assets', 'cornhill-offline.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');

test('App Centre remains in navigation while dashboard application cards are removed for every role', () => {
  assert.match(html, /id=["']appCentre["']/);
  assert.match(html, /data-tab=["']appCentre["']/);
  assert.match(bridge, /function enforceDashboardAppCentreOnly\(\)/);
  assert.match(bridge, /dashboardApplicationsObserver=new MutationObserver/);
  assert.match(bridge, /\.app-centre-grid/);
  const build = bridge.indexOf('function buildDashboardPanels()');
  const roleSpecificAdminPanel = bridge.indexOf("if(profile?.role==='Admin'", build);
  assert.ok(build >= 0 && roleSpecificAdminPanel > build);
  assert.ok(bridge.indexOf('enforceDashboardAppCentreOnly();', build) < roleSpecificAdminPanel);
  assert.match(bridge, /textContent='SCHOOL APPLICATIONS'/);
});

test('connection indicator is a compact Online / Offline chip', () => {
  assert.match(offlineClient, /offline \? 'Offline' : 'Online'/);
  assert.match(offlineClient, /#cornhillOfflineIndicator::before/);
  assert.match(offlineClient, /button\[hidden\]/);
  assert.doesNotMatch(offlineClient, /Connected · ready/);
  assert.doesNotMatch(offlineClient, /Offline · drafts stay on this device/);
});

test('service worker installs a fresh shell cache so older installed banners are discarded', () => {
  assert.match(serviceWorker, /cornhill-shell-v82/);
  assert.match(serviceWorker, /cornhill-static-v82/);
  assert.doesNotMatch(serviceWorker, /cornhill-shell-v74/);
  assert.doesNotMatch(serviceWorker, /cornhill-static-v74/);
});
