const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tracker = fs.readFileSync(path.join(root, 'assets', 'cornhill-usage-analytics.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'usage-analytics', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261113140500_first_party_school_usage_analytics.sql'), 'utf8');
const outcomes = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261113140627_school_usage_analytics_admission_outcomes.sql'), 'utf8');
const reports = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261113141248_school_usage_analytics_report_refinements.sql'), 'utf8');
const parent = fs.readFileSync(path.join(root, 'parents.html'), 'utf8');
const services = fs.readFileSync(path.join(root, 'school-services.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

test('usage analytics is opt-in by default', () => {
  assert.match(tracker, /function consent\(\)[\s\S]*?localStorage\.getItem\(CONSENT_KEY\) === 'allow'/);
  assert.match(tracker, /if \(!consent\(\)\) return false/);
});

test('parents are shown an understandable usage analytics consent choice', () => {
  assert.match(tracker, /Allow basic statistics/);
  assert.match(tracker, /Not now/);
  assert.match(tracker, /You may choose not to participate/);
});

test('usage notice explains pseudonymised account/browser identifiers and retention', () => {
  assert.match(tracker, /pseudonymised identifier/);
  assert.match(tracker, /up to 90 days/);
});

test('analytics does not collect full URLs, query strings or raw IP addresses', () => {
  assert.doesNotMatch(tracker, /location\.href|document\.URL|remoteAddress|x-forwarded-for/i);
  assert.match(tracker, /location\.pathname/);
  assert.match(edge, /do not log request bodies, session tokens or user identifiers/i);
});

test('browser identifiers are HMAC-hashed before being written to the database', () => {
  assert.match(edge, /crypto\.subtle\.importKey[\s\S]*?name: "HMAC"/);
  assert.match(edge, /visitorHash = await hmac/);
  assert.match(edge, /sessionHash = await hmac/);
  assert.match(edge, /actorHash = await hmac/);
});

test('staff analytics requires a valid active staff JWT and active staff profile', () => {
  assert.match(edge, /db\.auth\.getUser\(token\)/);
  assert.match(edge, /employment_status !== "Active"/);
  assert.match(edge, /if \(!\["Admin", "Teacher", "Staff"\]\.includes/);
});

test('guardian analytics validates the Parent Portal session token against its stored hash', () => {
  assert.match(edge, /parent_portal_sessions/);
  assert.match(edge, /token_hash/);
  assert.match(edge, /revoked_at/);
  assert.match(edge, /expires_at/);
  assert.match(edge, /parent_guardian_contacts/);
});

test('only the Director can request analytics reports', () => {
  assert.match(edge, /async function isDirector/);
  assert.match(edge, /async function usageReport[\s\S]*?await isDirector\(staff\)/);
  assert.match(edge, /Only the active Director can view usage analytics/);
});

test('analytics endpoint allows only known workspace, event and device categories', () => {
  assert.match(edge, /const WORKSPACES = new Set/);
  assert.match(edge, /const EVENTS = new Set/);
  assert.match(edge, /const DEVICES = new Set/);
  assert.match(edge, /Invalid usage event/);
});

test('anonymous Parent Portal events cannot claim a successful guardian login', () => {
  assert.match(edge, /if \(eventType === "parent_login_success"\)[\s\S]*?Guardian sign-in session is required/);
});

test('analytics database table has RLS and no client table access', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.school_usage_events from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, delete on table public\.school_usage_events to service_role/i);
});

test('analytics report function is not executable by anonymous or authenticated users', () => {
  assert.match(migration, /revoke all on function public\.get_school_usage_analytics_report\(date,date\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.get_school_usage_analytics_report\(date,date\) to service_role/i);
});

test('analytics retention cleanup is scheduled for 90 days', () => {
  assert.match(migration, /cornhill-usage-analytics-90-day-retention/);
  assert.match(migration, /interval '90 days'/);
});

test('admissions outcome event types include started, attempted, received and errors', () => {
  for (const event of ['admissions_form_started','admissions_form_submitted','admissions_form_accepted','admissions_form_error']) {
    assert.ok(outcomes.includes("'" + event + "'"), 'missing event ' + event);
  }
});

test('usage reports distinguish admission starts, attempts, successful enquiries and errors', () => {
  assert.match(reports, /admission_form_starts/);
  assert.match(reports, /admission_form_attempts/);
  assert.match(reports, /admission_form_accepted/);
  assert.match(reports, /admission_form_errors/);
});

test('analytics date range is limited to 90 calendar days and Kampala time', () => {
  assert.match(reports, /p_end_date - p_start_date > 89/);
  assert.match(reports, /Africa\/Kampala/);
});

test('guardian sign-in success and failure are tracked without exposing learner data', () => {
  assert.match(parent, /trackParentSession\?\.\(parentSessionToken,'parent_login_success'\)/);
  assert.match(parent, /track\?\.\('parent_login_failure','parent_portal'\)/);
});

test('parent account displays public school website and admissions links', () => {
  assert.match(parent, /id="parentResourceLinks"/);
  assert.match(parent, /href="https:\/\/school-website-cornhill-school\.vercel\.app\/apps\/school-website\//);
  assert.match(parent, /href="https:\/\/admissions-cornhill-school\.vercel\.app\/apps\/admissions\//);
});

test('parent can share public school and admission links', () => {
  assert.match(parent, /data-share-resource="school"/);
  assert.match(parent, /data-share-resource="admissions"/);
  assert.match(parent, /navigator\.share/);
  assert.match(parent, /navigator\.clipboard\.writeText/);
});

test('Director usage report is hidden until Director authorization succeeds', () => {
  assert.match(services, /class="card hidden" id="schoolUsageAnalyticsCard"/);
  assert.match(services, /db\.rpc\('is_school_director'\)/);
  assert.match(services, /panel\.classList\.remove\('hidden'\)/);
});

test('Director report shows site, parent, staff and admissions measures', () => {
  for (const id of ['usagePublicVisitors','usageGuardianAccounts','usageStaffAccounts','usageAdmissionStarts','usageAdmissionAttempts','usageAdmissionAccepted']) {
    assert.ok(services.includes('id="' + id + '"'), 'missing metric ' + id);
  }
  assert.match(services, /Most-used workspaces/);
  assert.match(services, /Daily usage trend/);
  assert.match(services, /Device categories/);
});

test('staff app visits are counted after sign-in and workspace navigation', () => {
  assert.match(tracker, /installStaffPageUseTracking/);
  assert.match(tracker, /getCurrentStaffToken\(\)/);
  assert.match(tracker, /data-service/);
  assert.match(tracker, /send\('page_view', target\[1\], token\)/);
});

test('usage analytics tracker JavaScript parses', () => {
  assert.doesNotThrow(() => new Function(tracker));
});

test('service worker injects the usage analytics tracker without a syntax error', () => {
  assert.match(sw, /cornhill-usage-analytics\.js/);
  assert.doesNotThrow(() => new Function(sw));
});
