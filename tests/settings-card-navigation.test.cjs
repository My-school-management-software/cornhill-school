const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('settings card workspaces can always return to the category launcher', () => {
  assert.match(html, /window\.cornhillResetSettingsCardWorkspaces\s*=\s*\(\)\s*=>/);
  assert.match(html, /root\.querySelectorAll\('\.settings-workspace-section'\)\.forEach\(x=>x\.classList\.add\('hidden'\)\)/);
  assert.match(html, /launcher\.classList\.remove\('hidden'\)/);
  assert.match(html, /intro\.classList\.remove\('hidden'\)/);
});

test('switching top-level dashboard workspaces resets an open settings sub-workspace', () => {
  assert.match(html, /function tab\(name\)\{\s*window\.cornhillResetSettingsCardWorkspaces\?\.\(\);/);
});

test('every settings card includes both a return-to-cards and dashboard control', () => {
  assert.match(html, /Back to settings cards/);
  assert.match(html, /Back to dashboard/);
  assert.match(html, /window\.tab\('dashboard'\)/);
});
