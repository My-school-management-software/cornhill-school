const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const parentUi = fs.readFileSync(path.join(root, 'parents.html'), 'utf8');
const parentApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'parent-portal-api', 'index.ts'), 'utf8');

test('Parent Portal uses its dedicated server API rather than direct browser database access', () => {
  assert.match(parentUi, /const PARENT_API=SUPABASE_URL\+'\/functions\/v1\/parent-portal-api'/);
  assert.match(parentUi, /async function parentApi\(action,payload=\{\}\)/);
  assert.doesNotMatch(parentUi, /createClient\s*\(|supabase\.from\s*\(/i);
});

test('guardian sign-in requires the permanent pupil code and registered phone', () => {
  assert.match(parentUi, /id="pupilCodeBeforeVerify"/);
  assert.match(parentUi, /id="phone" type="tel"/);
  assert.match(parentApi, /const code = String\(input\.pupil_code \|\| ""\)\.trim\(\)/);
  assert.match(parentApi, /const phone = normalizePhone\(String\(input\.phone \|\| ""\)\)/);
});

test('guardian PIN policy is loaded before the sign-in button is enabled', () => {
  assert.match(parentUi, /button\.disabled=true;[\s\S]*?parentApi\('auth-method'\)[\s\S]*?button\.disabled=false/);
  assert.match(parentApi, /parent_portal_guardian_pin_required/);
});

test('Parent Portal fails closed when the school sign-in setting cannot be verified', () => {
  assert.match(parentUi, /guardianPinRequired=null;[\s\S]*?guardianPinEntry[\s\S]*?message\('loginMessage'/);
  assert.match(parentApi, /if \(settingError \|\| typeof pinRequired !== "boolean"\)[\s\S]*?503/);
});

test('Ugandan local phone numbers are normalized to the +256 international format', () => {
  const match = parentUi.match(/function normalizePhone\(raw\)\{([\s\S]*?)\}\s*function safe/);
  assert.ok(match, 'phone normalizer should be present in the parent page');
  const normalizePhone = new Function('raw', match[1]);
  assert.equal(normalizePhone('0772 123 456'), '+256772123456');
  assert.equal(normalizePhone('+256 772 123 456'), '+256772123456');
  assert.equal(normalizePhone('256772123456'), '+256772123456');
  assert.equal(normalizePhone('12345'), null);
});

test('guardian verification rejects missing, overlong or malformed identity details', () => {
  assert.match(parentApi, /if \(!code \|\| code\.length > 32 \|\| !phone\)/);
  assert.match(parentApi, /Guardian verification failed/);
});

test('an eight-digit Guardian PIN is required when the school enables PIN protection', () => {
  assert.match(parentApi, /if \(pinRequired\)[\s\S]*?if \(!\/\^\\d\{8\}\$\//);
  assert.match(parentUi, /!\/\^\\d\{8\}\$\//);
});

test('the PIN is omitted from the verification payload when PIN protection is disabled', () => {
  assert.match(parentUi, /if\(guardianPinRequired\)[\s\S]*?payload\.pin=pin[\s\S]*?\}else\{[\s\S]*?guardianPin.*?value=''/);
  assert.match(parentApi, /parent_portal_get_learner_by_code_and_phone/);
});

test('guardian session tokens are generated with a cryptographically secure 32-byte random value', () => {
  assert.match(parentApi, /function randomToken\(\)[\s\S]*?new Uint8Array\(32\)[\s\S]*?crypto\.getRandomValues/);
});

test('only a SHA-256 token hash is stored for a guardian session', () => {
  assert.match(parentApi, /const token=randomToken\(\),tokenHash=await sha256\(token\)/);
  assert.match(parentApi, /p_token_hash:tokenHash/);
  assert.match(parentApi, /return reply\(\{session_token:token/);
});

test('parent API accepts only correctly shaped bearer tokens for parent sessions', () => {
  assert.match(parentApi, /const token = \(req\.headers\.get\("authorization"\)[\s\S]*?\/\^\[a-f0-9\]\{64\}\$\//);
  assert.match(parentApi, /const tokenHash = await sha256\(token\)/);
});

test('expired and revoked parent sessions are rejected', () => {
  assert.match(parentApi, /\.is\("revoked_at", null\)\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
});

test('parent session guardian contact must be active and linked to the same learner', () => {
  assert.match(parentApi, /from\("parent_guardian_contacts"\)[\s\S]*?\.eq\("id",data\.guardian_contact_id\)\.eq\("student_id",data\.student_id\)\.eq\("is_active",true\)/);
});

test('session creation rechecks guardian and learner state in a database transaction', () => {
  assert.match(parentApi, /parent_portal_create_session/);
  assert.match(parentApi, /p_guardian_contact_id:contact\.id/);
  assert.match(parentApi, /p_student_id:student\.id/);
});

test('learner photo retrieval is scoped to the learner in the verified parent session', () => {
  assert.match(parentApi, /if \(action === "photo"\)[\s\S]*?\.eq\("id",session\.student_id\)/);
  assert.match(parentApi, /createSignedUrl\(learner\.photo_path,300\)/);
});

test('parent message history is filtered by both verified guardian and learner identifiers', () => {
  assert.match(parentApi, /if \(action === "history"\)[\s\S]*?\.eq\("guardian_contact_id",session\.guardian_contact_id\)\.eq\("student_id",session\.student_id\)/);
});

test('new parent messages are always attached to the verified learner and guardian', () => {
  assert.match(parentApi, /from\("parent_school_messages"\)\.insert\(\{[\s\S]*?guardian_contact_id:session\.guardian_contact_id, student_id:session\.student_id/);
});

test('parent messaging enforces both short-window and daily message limits', () => {
  assert.match(parentApi, /Date\.now\(\)-10\*60\*1000/);
  assert.match(parentApi, /Date\.now\(\)-24\*60\*60\*1000/);
  assert.match(parentApi, /\(recent \|\| 0\) >= 5 \|\| \(daily \|\| 0\) >= 20/);
});

test('signing out revokes the current parent session', () => {
  assert.match(parentApi, /if \(action === "signout"\)[\s\S]*?\.update\(\{ revoked_at:new Date\(\)\.toISOString\(\) \}\)\.eq\("id",session\.id\)/);
});

test('staff inbox operations require a separate active school staff authentication session', () => {
  assert.match(parentApi, /if \(action === "staff-inbox" \|\| action === "staff-reply" \|\| action === "staff-status"\)[\s\S]*?getStaffSession\(req\)/);
  assert.match(parentApi, /db\.auth\.getUser\(token\)/);
});

test('non-admin staff can see only parent messages assigned to their own staff account', () => {
  assert.match(parentApi, /if\(!isAdmin\)query=query\.eq\("recipient_kind","staff"\)\.eq\("recipient_user_id",uid\)/);
  assert.match(parentApi, /target\.recipient_user_id!==uid/);
});

test('the parent contact directory displays phone numbers only when the school has made them visible', () => {
  assert.match(parentApi, /\.eq\("employment_status","Active"\)/);
  assert.match(parentApi, /public_phone:p\.parent_contact_visible===true\?String\(p\.parent_contact_phone\|\|""\)\.trim\(\)\|\|null:null/);
});

test('the portal does not expose the school administration system to guardians', () => {
  assert.match(parentUi, /Private learner access/);
  assert.match(parentUi, /It does not provide access to the school's administration system/);
  assert.doesNotMatch(parentUi, /href="[^"]*(school-services\.html|admin-dashboard)/i);
});

test('public school and admission links are separate from the child private record area', () => {
  assert.match(parentUi, /id="parentResourceLinks"/);
  assert.match(parentUi, /https:\/\/school-website-cornhill-school\.vercel\.app\/apps\/school-website\//);
  assert.match(parentUi, /https:\/\/admissions-cornhill-school\.vercel\.app\/apps\/admissions\//);
  assert.match(parentUi, /Sharing these links does not share your child's private records/);
});

test('external public links opened in a new tab use safe opener and referrer attributes', () => {
  const links = parentUi.match(/<a class="tile" href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer">/g) || [];
  assert.equal(links.length, 2);
});

test('the parent portal provides native sharing with a clipboard fallback', () => {
  assert.match(parentUi, /navigator\.share/);
  assert.match(parentUi, /navigator\.clipboard\.writeText/);
});

test('guardian-to-school communication is messaging and voice notes, not calls', () => {
  assert.match(parentUi, /This is messaging only, not an audio or video call/);
  assert.match(parentUi, /Record voice note/);
});

test('voice notes have a maximum 3-minute duration and 4 MB upload size', () => {
  assert.match(parentApi, /duration > 180/);
  assert.match(parentApi, /bytes\.length > 4194304/);
  assert.match(parentUi, /up to 3 minutes and 4 MB/);
});

test('parent API only accepts POST requests and applies a request size limit', () => {
  assert.match(parentApi, /if \(req\.method !== "POST"\) return jsonError\("Method not allowed",405\)/);
  assert.match(parentApi, /declaredLength > 6_000_000/);
});

test('parent API restricts browser origins and prevents caching of private responses', () => {
  assert.match(parentApi, /const PROD_ORIGINS = new Set/);
  assert.match(parentApi, /cornhill-school-\[a-z0-9-\].*cypher-projects1/);
  assert.match(parentApi, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(parentApi, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
});

test('end-of-term results are released only when fee-clearance policy permits them', () => {
  assert.match(parentApi, /period==="beginning" \|\| period==="mid" \|\| termStatus\(row\.term_id\)\.cleared===true/);
  assert.match(parentApi, /published_reports = reportTerms\.filter\(\(row:any\)=>termStatus\(row\.term_id\)\.cleared===true\)/);
  assert.match(parentApi, /locked_reports = reportTerms\.filter\(\(row:any\)=>termStatus\(row\.term_id\)\.cleared!==true\)/);
});
