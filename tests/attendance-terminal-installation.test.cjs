const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('attendance-terminal/index.html');
const js = read('attendance-terminal/app.js');
const manifest = read('attendance-terminal/manifest.webmanifest');
const serviceWorker = read('attendance-terminal/sw.js');
const center = read('app-center.html');
const services = read('school-services.html');
const docs = read('docs/ATTENDANCE_TERMINAL_APP.md');

test('attendance terminal is a separately installable PWA', () => {
  assert.match(app, /rel="manifest" href="\.\/manifest\.webmanifest"/i);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"scope": "\/attendance-terminal\/"/);
});

test('attendance app has its own offline shell cache', () => {
  assert.match(js, /register\('\.\/sw\.js'/);
  assert.match(serviceWorker, /cornhill-attendance-terminal-v1/);
  assert.match(serviceWorker, /\/attendance-terminal\//);
});

test('App Center lists the attendance terminal', () => {
  assert.match(center, /CORNHILL Attendance Terminal/);
  assert.match(center, /attendance-terminal\//);
  assert.match(services, /App Center/);
});

test('clocking remains locked until secure pairing exists', () => {
  assert.match(app, /id="pairingStatus">Not paired/);
  assert.match(app, /<button type="button" disabled>Clock in/);
  assert.match(app, /<button type="button" disabled>Clock out/);
});

test('terminal explains Director-controlled capture methods', () => {
  assert.match(app, /Director's policy/);
  assert.match(app, /QR staff badge/);
  assert.match(app, /NFC card \/ tag/);
  assert.match(app, /Phone face \/ fingerprint/);
  assert.match(app, /External attendance machine/);
});

test('terminal does not capture or store biometric templates', () => {
  assert.match(app, /Biometric templates stay on the phone or external machine/);
  assert.match(docs, /do not upload raw templates or face images/);
  assert.doesNotMatch(js, /localStorage|indexedDB|supabase\.from\(['"]staff_attendance_events/);
});

test('offline state explicitly prevents attendance writes', () => {
  assert.match(js, /attendance events cannot be recorded/);
  assert.match(app, /server confirmation before they count as recorded/);
});

test('QR scanning and NFC capability checks are feature-detected and accessible actions', () => {
  assert.match(js, /BarcodeDetector/);
  assert.match(js, /NDEFReader/);
  assert.match(js, /isSecureContext/);
  assert.match(app, /<button id="qrCapability"/);
  assert.match(app, /<button id="nfcCapability"/);
});

test('phone biometrics are described as device authentication, not group identification', () => {
  assert.match(app, /not a shared multi-person fingerprint scanner/);
  assert.match(docs, /does not turn one ordinary phone fingerprint sensor into a multi-person staff identification reader/);
});