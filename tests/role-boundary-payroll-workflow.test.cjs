const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const draft = fs.readFileSync(
  path.join(root, 'supabase/migration-drafts/cornhill_role_boundaries_payroll_workflow.sql'),
  'utf8'
);

function section(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, 'section start must exist: ' + start);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, 'section end must exist: ' + end);
  return source.slice(a, b);
}

test('Store Managers get the Inventory workspace without inheriting Bursar or teacher permissions', () => {
  assert.match(dashboard, /function isCornhillStoreManager\(\)\{return profile\?\.role==='Staff'/);
  assert.match(dashboard, /store manager/);
  assert.match(dashboard, /inventoryTab'\)\?\.classList\.toggle\('hidden',!\(role==='Admin'\|\|storeManager\)\)/);
  assert.match(dashboard, /storeManager&&key==='inventory'/);
  assert.match(dashboard, /const inventory=isCornhillStoreManager\(\)&&name==='inventory'/);
  assert.match(dashboard, /profile\?\.role==='Admin'\|\|isCornhillStoreManager\(\)/);
  assert.match(dashboard, /Director &amp; Store Manager/);
});

test('Bursar collection screen remains Bursar-only while Director retains finance overview', () => {
  assert.match(dashboard, /function isCornhillBursar\(\)/);
  assert.match(dashboard, /financeCollectionDesk'\)\?\.classList\.toggle\('hidden',!bursar\)/);
  assert.match(dashboard, /Only the Main or Deputy Bursar can post learner payments/);
  const handler = section(
    dashboard,
    "$('schoolPaymentForm').addEventListener('submit'",
    'let bulkLearnerRows=[];'
  );
  assert.match(handler, /!isCornhillBursar\(\)/);
});

test('only the Bursar prepares and submits payroll; only the Director approves or returns it', () => {
  assert.match(dashboard, /db\.rpc\('finance_list_payroll_staff'\)/);
  assert.match(dashboard, /if\(demoMode\|\|!isCornhillBursar\(\)\)return/);
  assert.match(dashboard, /db\.rpc\('submit_school_payroll',\{p_period_id:id\}\)/);
  assert.match(dashboard, /db\.rpc\('approve_school_payroll',\{p_period_id:id\}\)/);
  assert.match(dashboard, /db\.rpc\('return_school_payroll',\{p_period_id:id,p_reason:reason\.trim\(\)\}\)/);
  assert.match(dashboard, /period\.created_by===currentUserId/);
  assert.match(dashboard, /period\.status==='Submitted'/);
  assert.match(dashboard, /role!=='Admin'\)return/);
  assert.match(dashboard, /const directorFinanceControls=.*salaryAgreementForm.*salaryAdvanceForm/);
});

test('salary disbursement uses the narrow RPC and never edits approved payroll amounts in the payment handler', () => {
  const handler = section(
    dashboard,
    "$('payrollItemRows').addEventListener('click'",
    "$('loadExpenseReport').addEventListener"
  );
  assert.match(handler, /db\.rpc\('record_school_payroll_item_payment'/);
  assert.match(handler, /approved_net_pay_ugx/);
  assert.doesNotMatch(handler, /\.from\('payroll_items'\)\.update\(\{allowances_ugx/);
  assert.doesNotMatch(handler, /\.from\('payroll_items'\)\.update\(\{[^}]*status:'Paid'/);
});

test('draft SQL makes learner payment posting Bursar-only in both live application RPCs', () => {
  assert.match(draft, /create or replace function public\.is_school_bursar_operator\(\)/);
  const basic = section(draft, 'create or replace function public.post_school_payment(', '$function$;');
  const complete = section(draft, 'create or replace function public.post_school_payment_complete(', '$function$;');
  assert.match(basic, /public\.is_school_bursar_operator\(\)/);
  assert.match(complete, /public\.is_school_bursar_operator\(\)/);
  assert.doesNotMatch(basic, /public\.is_school_finance_operator\(\)/);
  assert.doesNotMatch(complete, /public\.is_school_finance_operator\(\)/);
  assert.match(draft, /revoke all on function public\.post_school_payment_complete\([\s\S]*?from public, anon/);
});

test('inventory RLS removes finance-operator policies and grants write access only to inventory managers', () => {
  assert.match(draft, /create or replace function public\.is_school_inventory_manager\(\)/);
  assert.match(draft, /drop policy if exists "Finance operators manage inventory categories"/);
  assert.match(draft, /drop policy if exists "Finance operators manage inventory items"/);
  assert.match(draft, /drop policy if exists "Finance operators manage inventory movements"/);
  assert.match(draft, /create policy "Inventory managers manage categories"[\s\S]*?using \(public\.is_school_inventory_manager\(\)\)[\s\S]*?with check \(public\.is_school_inventory_manager\(\)\)/);
  assert.match(draft, /create policy "Inventory managers manage items"[\s\S]*?using \(public\.is_school_inventory_manager\(\)\)[\s\S]*?with check \(public\.is_school_inventory_manager\(\)\)/);
  assert.match(draft, /create policy "Inventory managers record movements"[\s\S]*?using \(public\.is_school_inventory_manager\(\)\)[\s\S]*?with check \(public\.is_school_inventory_manager\(\)\)/);
});

test('payroll preparation, independent approval and return have separate state transitions', () => {
  assert.match(draft, /status = any \(array\['Draft','Submitted','Returned','Approved','Part-paid','Paid','Cancelled'\]\)/);
  const submit = section(draft, 'create or replace function public.submit_school_payroll', '$function$;');
  const approve = section(draft, 'create or replace function public.approve_school_payroll', '$function$;');
  const returned = section(draft, 'create or replace function public.return_school_payroll', '$function$;');
  assert.match(submit, /public\.is_school_bursar_operator\(\)/);
  assert.match(submit, /status in \('Draft','Returned'\)/);
  assert.match(submit, /status = 'Submitted'/);
  assert.match(approve, /public\.is_school_admin\(\)/);
  assert.match(approve, /v_period\.created_by = auth\.uid\(\)/);
  assert.match(approve, /approved_net_pay_ugx = net_pay_ugx/);
  assert.match(approve, /status = 'Approved'/);
  assert.match(returned, /public\.is_school_admin\(\)/);
  assert.match(returned, /status = 'Returned'/);
});

test('Bursar cannot edit a Director-submitted, Director-approved or another Bursars payroll draft', () => {
  const periodInsert = section(draft, 'create policy "Bursars create draft payroll periods"', 'drop policy if exists "School administrators update payroll_periods"');
  const periodUpdate = section(draft, 'create policy "Finance operators update draft payroll periods"', 'drop policy if exists "School administrators delete payroll_periods"');
  const itemUpdate = section(draft, 'create policy "Finance operators update draft payroll items"', 'drop policy if exists "School administrators delete payroll_items"');
  assert.match(periodInsert, /public\.is_school_bursar_operator\(\)/);
  assert.match(periodInsert, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(periodInsert, /status = 'Draft'/);
  assert.match(periodUpdate, /status in \('Draft','Returned'\)/);
  assert.match(periodUpdate, /public\.is_school_bursar_operator\(\)/);
  assert.match(periodUpdate, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(itemUpdate, /public\.is_school_bursar_operator\(\)/);
  assert.match(itemUpdate, /pp\.created_by = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(itemUpdate, /public\.is_school_admin\(\)/);
});

test('Director approval snapshots net pay; Bursar payment RPC can only record an unchanged approved amount', () => {
  const payment = section(draft, 'create or replace function public.record_school_payroll_item_payment', '$function$;');
  assert.match(draft, /add column if not exists approved_net_pay_ugx bigint/);
  assert.match(payment, /public\.is_school_bursar_operator\(\)/);
  assert.match(payment, /v_period\.status not in \('Approved','Part-paid'\)/);
  assert.match(payment, /v_item\.approved_net_pay_ugx is null/);
  assert.match(payment, /v_item\.net_pay_ugx is distinct from v_item\.approved_net_pay_ugx/);
  assert.match(payment, /set status = 'Paid'/);
  assert.doesNotMatch(payment, /set allowances_ugx/);
  assert.doesNotMatch(payment, /set deductions_ugx/);
  assert.doesNotMatch(payment, /set advance_recovery_ugx/);
  assert.match(payment, /payment_recorded_by = auth\.uid\(\)/);
});

test('the existing payroll triggers are retained for salary expenses, advance recovery and staff notices', () => {
  assert.match(draft, /Existing payroll triggers still create the salary expense, settle advance\s+recovery and notify the staff member/);
});
