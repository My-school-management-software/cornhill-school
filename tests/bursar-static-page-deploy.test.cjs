const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'bursar-account.html'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-bursar-setup-pages.yml'), 'utf8');

test('bursar account setup uses the existing Supabase callback for invite and recovery redirects', () => {
  assert.match(page, /const SETUP_REDIRECT="https:\/\/yemhortbudwbcrzsoozk\.supabase\.co\/functions\/v1\/bursar-account-web"/);
  assert.match(page, /redirectTo:SETUP_REDIRECT/);
  assert.match(page, /detectSessionInUrl:true/);
  assert.match(page, /resetPasswordForEmail/);
});

test('the public bursar page exposes no server-side Supabase credentials', () => {
  assert.match(page, /sb_publishable_/);
  assert.doesNotMatch(page, /service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(page, /bursar-account-admin/);
});

test('GitHub Pages workflow publishes only the bursar setup page', () => {
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions\/configure-pages@/);
  assert.match(workflow, /cp bursar-account\.html site\/bursar-account\.html/);
  assert.match(workflow, /actions\/upload-pages-artifact@/);
  assert.match(workflow, /actions\/deploy-pages@/);
  assert.doesNotMatch(workflow, /cp -R \. site|upload-pages-artifact[\s\S]*path:\s*\./);
});

test('GitHub Pages publishing is restricted to the production website source branch', () => {
  assert.match(workflow, /feat\/role-based-staff-access-subject-teachers-20261111/);
  assert.match(workflow, /workflow_dispatch:/);
});
