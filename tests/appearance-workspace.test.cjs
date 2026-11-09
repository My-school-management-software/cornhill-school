const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'assets', 'cornhill-appearance.js');
const helperSource = fs.readFileSync(helperPath, 'utf8');

function makeStyle() {
  const values = {};
  return { setProperty(name, value) { values[name] = value; }, getPropertyValue(name) { return values[name] || ''; }, values };
}

function loadAppearance() {
  const stored = new Map();
  const listeners = {};
  const body = { style: makeStyle(), dataset: {} };
  const documentElement = { style: makeStyle() };
  const themeMeta = { content: '', setAttribute(name, value) { if (name === 'content') this.content = value; } };
  const document = {
    body,
    documentElement,
    querySelector(selector) { return selector === 'meta[name="theme-color"]' ? themeMeta : null; }
  };
  const localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); }
  };
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }
  const window = {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); }
  };
  const context = { window, document, localStorage, CustomEvent, console, Object, String, Set, Array };
  vm.runInNewContext(helperSource, context, { filename: 'cornhill-appearance.js' });
  return { api: window.CornhillAppearance, body, documentElement, themeMeta, stored, listeners };
}

test('shared appearance helper parses and exposes the full theme, font and dashboard-layout catalogue', () => {
  assert.doesNotThrow(() => new vm.Script(helperSource, { filename: 'cornhill-appearance.js' }));
  const { api } = loadAppearance();
  assert.equal(api.themeCount, 22);
  assert.equal(api.fontCount, 24);
  assert.equal(api.layoutCount, 18);
  assert.equal(typeof api.saveForUser, 'function');
  assert.equal(typeof api.applyForUser, 'function');
  assert.equal(typeof api.mountSettings, 'function');
});

test('preferences save and apply to the page using the same per-user key as the main dashboard', () => {
  const { api, body, documentElement, themeMeta, stored } = loadAppearance();
  assert.equal(api.saveForUser('staff-1', {
    theme: 'midnight', font: 'georgia', fontSize: '18',
    density: 'compact', motion: 'on', dashboardLayout: 'bento-grid'
  }), true);
  assert.equal(api.applyForUser('staff-1', { mount: false }), true);
  assert.equal(body.dataset.theme, 'midnight');
  assert.equal(body.dataset.density, 'compact');
  assert.equal(body.dataset.motion, 'on');
  assert.equal(body.dataset.dashboardLayout, 'bento-grid');
  assert.equal(body.style.getPropertyValue('--cornhill-page'), '#111827');
  assert.equal(body.style.getPropertyValue('--panel'), '#1f2937');
  assert.equal(documentElement.style.fontSize, '18px');
  assert.match(documentElement.style.fontFamily, /Georgia/);
  assert.equal(themeMeta.content, '#0f172a');
  assert.ok(stored.has('cornhill_appearance_v1:staff-1'));
  assert.deepEqual(JSON.parse(stored.get('cornhill_appearance_v1:staff-1')).theme, 'midnight');
});

test('appearance preferences stay scoped to the active staff account', () => {
  const { api, body, listeners } = loadAppearance();
  api.saveForUser('staff-a', { theme: 'ruby' });
  api.saveForUser('staff-b', { theme: 'ocean' });
  api.applyForUser('staff-a', { mount: false });
  assert.equal(body.dataset.theme, 'ruby');
  api.applyForUser('staff-b', { mount: false });
  assert.equal(body.dataset.theme, 'ocean');
  api.saveForUser('staff-a', { theme: 'graphite' });
  assert.equal(body.dataset.theme, 'ocean', 'saving another account must not repaint this account');
  (listeners.storage || []).forEach(fn => fn({ key: 'cornhill_appearance_v1:staff-a' }));
  assert.equal(body.dataset.theme, 'ocean', 'storage events for another account must be ignored');
});

test('invalid stored choices are normalised safely to the school defaults', () => {
  const { api, body } = loadAppearance();
  api.saveForUser('staff-1', { theme: 'not-a-real-theme', font: 'invalid-font', fontSize: '99', dashboardLayout: 'invalid-layout' });
  api.applyForUser('staff-1', { mount: false });
  assert.equal(body.dataset.theme, 'forest');
  assert.equal(body.dataset.dashboardLayout, 'executive');
  assert.equal(body.style.getPropertyValue('--cornhill-page'), '#f3f7f3');
});

test('all authenticated staff side-apps load and apply the shared appearance helper', () => {
  const staffApps = ['banking.html', 'evidence.html', 'school-services.html', 'notifications.html', 'records.html'];
  for (const file of staffApps) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(html.includes('/assets/cornhill-appearance.js'), file + ' must load shared appearance');
    assert.ok(html.includes('/assets/cornhill-design-system.css'), file + ' must load shared theme CSS');
    assert.ok(html.includes('CornhillAppearance?.applyForUser?.(profile.id)'), file + ' must apply the signed-in staff preference');
  }
});

test('parent-facing portals remain isolated from staff appearance settings', () => {
  for (const file of ['parents.html', 'admissions.html', 'school.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!html.includes('/assets/cornhill-appearance.js'), file + ' must not load the staff preference helper');
  }
});

test('main dashboard shares the same preference namespace and listens for changes from other staff apps', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes("const APPEARANCE_KEY='cornhill_appearance_v1'"));
  assert.ok(html.includes("function appearanceStorageKey(){return APPEARANCE_KEY+':'+(currentUserId||'signed-out')}"));
  assert.ok(html.includes("window.addEventListener('storage',event=>"));
  assert.ok(html.includes("event.key!==appearanceStorageKey()"));
  assert.ok(html.includes("id=\"themeChoice\""));
  assert.ok(html.includes("id=\"dashboardLayoutChoice\""));
});
