const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const paymentSql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261106125535_current_term_first_payment_allocation.sql'),
  'utf8'
);

function section(source, start, end) {
  const a = source.indexOf(start);
  assert.notEqual(a, -1, 'section start must exist: ' + start);
  const b = source.indexOf(end, a + start.length);
  assert.notEqual(b, -1, 'section end must exist: ' + end);
  return source.slice(a, b);
}

test('new payment receipt reads its persisted Kampala timestamp, not the device clock', () => {
  const handler = section(
    html,
    "$('schoolPaymentForm').addEventListener('submit'",
    'let bulkLearnerRows=[];'
  );
  assert.match(handler, /select\('enrolment_period_id,received_at,learner_enrolment_periods\(class_id,school_classes\(name\)\)'\)/);
  assert.match(handler, /new Date\(paymentPeriod\.received_at\)\.toLocaleString\('en-GB',\{timeZone:'Africa\/Kampala'\}\)/);
  assert.match(handler, /<strong>Date:<\/strong> '\+esc\(receiptDate\)\+'/);
  assert.doesNotMatch(handler, /<strong>Date:<\/strong> '\+esc\(new Date\(\)/);
});

test('new payment receipt uses the class saved on the payment enrolment period', () => {
  const handler = section(
    html,
    "$('schoolPaymentForm').addEventListener('submit'",
    'let bulkLearnerRows=[];'
  );
  assert.match(handler, /learnerClass=paymentPeriod\?\.learner_enrolment_periods\?\.school_classes\?\.name\|\|'Class not recorded'/);
  assert.doesNotMatch(handler, /learnerClass=classRow\?\.name/);
});

test('receipt reprint prefers the historical enrolment class and only falls back for legacy receipts', () => {
  const handler = section(
    html,
    "$('receiptLookupButton').addEventListener('click'",
    "let feeReportTerms=[];"
  );
  assert.match(handler, /learner_enrolment_periods\(class_id,school_classes\(name\)\)/);
  assert.match(handler, /className=data\.learner_enrolment_periods\?\.school_classes\?\.name\|\|learner\.school_classes\?\.name\|\|'Class not recorded'/);
  assert.match(handler, /new Date\(data\.received_at\)\.toLocaleString\('en-GB',\{timeZone:'Africa\/Kampala'\}\)/);
});

test('payment entry keeps whole-UGX, positive amount, allocation sum and duplicate-submit guards', () => {
  const handler = section(
    html,
    "$('schoolPaymentForm').addEventListener('submit'",
    'let bulkLearnerRows=[];'
  );
  assert.match(handler, /Number\.isSafeInteger\(amount\)\|\|amount<=0/);
  assert.match(handler, /allocations\.some\(a=>!Number\.isSafeInteger\(a\.amount_ugx\)\|\|a\.amount_ugx<=0\)/);
  assert.match(handler, /allocations\.reduce\(\(n,a\)=>n\+a\.amount_ugx,0\)>amount/);
  assert.match(handler, /submitButton\?\.dataset\.busy==='1'/);
});

test('database posting stays administrator-guarded, atomic and limited to selected old charges plus current-term auto-allocation', () => {
  assert.match(paymentSql, /if v_uid is null or not coalesce\(public\.is_school_admin\(\),false\) then/i);
  assert.match(paymentSql, /pg_advisory_xact_lock\(hashtextextended\(p_student_id::text,0\)\)/i);
  assert.match(paymentSql, /v_charge_id=any\(v_seen_charge_ids\)/i);
  assert.match(paymentSql, /c\.enrolment_period_id=v_enrolment_period_id/i);
  assert.match(paymentSql, /v_amount>v_due-v_paid/i);
  assert.match(paymentSql, /v_sum>p_amount_ugx/i);
  assert.match(paymentSql, /if p_allocations is not null then/i);
  assert.match(paymentSql, /Automatic allocation is restricted to the current open term/i);
  assert.match(paymentSql, /v_current_term_id is not null\s+and c\.term_id=v_current_term_id/i);
  assert.match(paymentSql, /update public\.school_payments set unallocated_amount_ugx=v_remaining/i);
});
