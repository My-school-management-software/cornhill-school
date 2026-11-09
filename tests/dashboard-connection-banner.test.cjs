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
