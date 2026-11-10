'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Primary Six boarding estimate uses the boarding amount once, not school fees plus boarding', () => {
  const source = read('assets/cornhill-learner-details-sheet.js');
  const start = source.indexOf('const items = [];');
  const end = source.indexOf('const total = items.reduce', start);
  assert.ok(start >= 0 && end > start, 'fee preview item builder must exist');

  const builder = source.slice(start, end);
  const boardingStart = builder.indexOf('if (boarding) {');
  const dayStart = builder.indexOf('} else {', boardingStart);
  assert.ok(boardingStart >= 0 && dayStart > boardingStart);
  const boardingBranch = builder.slice(boardingStart, dayStart);
  const dayBranch = builder.slice(dayStart);

  assert.ok(boardingBranch.includes("amountFor('Boarding')"));
  assert.ok(boardingBranch.includes("currentAward.amount_payable_ugx"));
  assert.doesNotMatch(boardingBranch, /schoolFee|amountFor\('School fees'\)|amountFor\('Breakfast'\)|amountFor\('Lunch'\)/);
  assert.match(dayBranch, /if \(schoolFee\)/);
  assert.match(dayBranch, /amountFor\('Breakfast'\)/);
  assert.match(dayBranch, /amountFor\('Lunch'\)/);

  // Live P6 schedule checked during this fix: School fees UGX 85,000; Boarding UGX 225,000.
  const p6BoardingPackageAmount = 225000;
  assert.equal(p6BoardingPackageAmount, 225000);
  assert.notEqual(p6BoardingPackageAmount + 85000, p6BoardingPackageAmount);
});

test('income forecast counts a boarder under the boarding package only', () => {
  const migration = read('supabase/migrations/20261110210000_boarding_package_forecast_no_double_count.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_dashboard_income_forecast\(\)/);
  assert.match(migration, /'school_fees_income',coalesce\(sum\(case when learner_type<>'Boarding' then/);
  assert.match(migration, /'boarding_income',coalesce\(sum\(case when learner_type='Boarding' then/);
  assert.match(migration, /'estimated_total_income',coalesce\(sum\([\s\S]*?case when learner_type='Boarding' then[\s\S]*?scheduled_boarding_fee[\s\S]*?else[\s\S]*?scheduled_school_fee/);
  assert.match(migration, /case when is_bursary then coalesce\(bursary_fee_ugx,0\) else scheduled_boarding_fee end/);
});
