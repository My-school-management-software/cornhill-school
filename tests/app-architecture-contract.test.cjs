const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const guard = fs.readFileSync(path.join(root, 'assets/app-isolation-guard.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function localDestination(destination) {
  return destination.split('?')[0].split('#')[0].replace(/^\//, '');
}

test('every Vercel rewrite points to an existing local page or asset', () => {
  assert.ok(Array.isArray(config.rewrites) && config.rewrites.length > 0);
  for (const route of config.rewrites) {
    assert.ok(route.source && route.destination, 'Rewrite must have source and destination');
    const destination = localDestination(route.destination);
    assert.ok(destination && !destination.startsWith('../'), 'Rewrite destination must stay inside the app');
    assert.ok(fs.existsSync(path.join(root, destination)), 'Missing rewrite destination: ' + route.destination);
  }
});

test('Vercel rewrite sources are unique', () => {
  const sources = config.rewrites.map(x => x.source);
  assert.equal(new Set(sources).size, sources.length, 'A route source must not be declared more than once');
});

test('every application-host redirect is backed by a Vercel route', () => {
  const match = guard.match(/const routes=(\{[\s\S]*?\});const host=/);
  assert.ok(match, 'The app-isolation host map must be present');
  const aliases = JSON.parse(match[1]);
  for (const [host, target] of Object.entries(aliases)) {
    assert.ok(host.includes('.'), 'Host alias must be a complete hostname');
    const bare = target.endsWith('/') ? target.slice(0, -1) : target;
    assert.ok(
      config.rewrites.some(x => x.source === target || x.source === bare || x.source === bare + '/'),
      'No Vercel rewrite backs ' + host + ' → ' + target
    );
  }
});

test('specialist School Services app links share one canonical workspace instead of copied pages', () => {
  const serviceAliases = config.rewrites.filter(x =>
    x.destination.startsWith('/school-services.html?workspace=')
  );
  assert.ok(serviceAliases.length >= 10, 'Expected the specialist app aliases to resolve into School Services');
  const groups = new Map();
  for (const route of serviceAliases) {
    const appPath = route.source.replace(/\/$/, '');
    const previous = groups.get(appPath);
    if (previous) assert.equal(route.destination, previous, 'Slash/no-slash routes must resolve identically: ' + appPath);
    groups.set(appPath, route.destination);
  }
  const workspaceKeys = [...new Set([...groups.values()].map(x => new URL(x, 'https://cornhill.invalid').searchParams.get('workspace')))];
  assert.equal(workspaceKeys.length, groups.size, 'Different specialist app paths must open distinct workspace sections');
});

test('the legacy communications page is a redirect wrapper, not a second communication database or workspace', () => {
  const page = fs.readFileSync(path.join(root, 'school-communications.html'), 'utf8');
  assert.match(page, /location\.replace\('\/apps\/staff-communications\/'\)/);
  assert.match(config.rewrites.find(x => x.source === '/apps/staff-communications/').destination, /school-services\.html\?workspace=staff-feed/);
});

test('all root web manifests remain valid JSON with a name and start URL', () => {
  const manifests = fs.readdirSync(root).filter(name => name.endsWith('.webmanifest'));
  assert.ok(manifests.length >= 15, 'Expected CORNHILL installable app manifests');
  for (const name of manifests) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    assert.ok(manifest.name || manifest.short_name, name + ' needs an app name');
    assert.ok(manifest.start_url, name + ' needs a start URL');
  }
});

test('Director retains finance oversight but the payment collection desk is Bursar-only', () => {
  assert.match(dashboard, /function isCornhillFinanceOperator\(\)\{return profile\?\.role==='Admin'/);
  assert.match(dashboard, /function isCornhillBursar\(\)\{return profile\?\.role==='Staff'/);
  assert.match(dashboard, /id="financeCollectionDesk"/);
  assert.match(dashboard, /id="directorFinanceCollectionNotice"/);
  assert.match(dashboard, /financeCollectionDesk'\)\?\.classList\.toggle\('hidden',!bursar\)/);
  assert.match(dashboard, /directorFinanceCollectionNotice'\)\?\.classList\.toggle\('hidden',role!=='Admin'\)/);
  const start = dashboard.indexOf("$('schoolPaymentForm').addEventListener('submit'");
  assert.notEqual(start, -1, 'Payment submit handler must exist');
  const end = dashboard.indexOf('let bulkLearnerRows=[];', start);
  assert.ok(end > start, 'Payment submit handler boundary must exist');
  const handler = dashboard.slice(start, end);
  assert.match(handler, /!isCornhillBursar\(\)/);
  assert.match(handler, /Only the Main or Deputy Bursar can post learner payments/);
});

test('main, banking, evidence and School Services staff workspaces isolate sessions per browser tab', () => {
  const main = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const banking = fs.readFileSync(path.join(root, 'banking.html'), 'utf8');
  const evidence = fs.readFileSync(path.join(root, 'evidence.html'), 'utf8');
  const services = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');

  assert.match(main, /authTabStorageKey='cornhill-auth-tab-'\+authTabId/);
  assert.match(main, /storage:authTabStorage,persistSession:true/);
  assert.match(main, /persistSession:false/);
  assert.match(main, /Remove the previous shared project-wide session key/);

  assert.match(banking, /bankAuthStorageKey='cornhill-bank-tab-'\+tabId/);
  assert.match(banking, /storage:bankAuthStorage,persistSession:true/);
  assert.match(banking, /persistSession:false/);

  assert.match(evidence, /evidenceAuthStorageKey='cornhill-evidence-tab-'\+tabId/);
  assert.match(evidence, /storage:evidenceAuthStorage,persistSession:true/);
  assert.match(evidence, /persistSession:false/);

  assert.match(services, /authStorageKey='cornhill-services-tab-'\+tabId/);
  assert.match(services, /storage:authStorage,persistSession:true/);
  assert.match(services, /persistSession:false/);
});

test('Notifications and Guardian PIN administration share staff sign-in but retain separate server-side role checks', () => {
  const notifications = fs.readFileSync(path.join(root, 'notifications.html'), 'utf8');
  const guardian = fs.readFileSync(path.join(root, 'guardian-accounts.html'), 'utf8');

  assert.match(notifications, /storageKey:'cornhill-notifications-v1'/);
  assert.match(guardian, /storageKey:'cornhill-notifications-v1'/);
  assert.match(notifications, /list_school_notification_center/);
  assert.match(guardian, /admin_parent_contact_directory/);
  assert.match(guardian, /admin_get_parent_portal_security_settings/);
  assert.match(guardian, /admin_issue_guardian_pin/);
  assert.match(guardian, /An administrator-only RPC is the authoritative access check/);
});

test('public parent admissions accounts use a separate authentication storage key from staff workspaces', () => {
  const admissions = fs.readFileSync(path.join(root, 'admissions.html'), 'utf8');
  assert.match(admissions, /storageKey:'cornhill-parent-admissions-v1'/);
  assert.doesNotMatch(admissions, /cornhill-notifications-v1|cornhill-auth-tab-|cornhill-services-tab-/);
});
