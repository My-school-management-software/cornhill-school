import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = relative => readFile(new URL(relative, import.meta.url), "utf8");
const [yearFees, postedIncome, classifiedAccount, financeUi, bursarHtml, financeApi, financeRepo, authRepo] =
  await Promise.all([
    file("../migrations/098_local_annual_school_fees_income_b_prices.sql"),
    file("../migrations/099_local_income_group_receipt_breakdown.sql"),
    file("../migrations/100_local_finance_account_income_classification.sql"),
    file("../public/bursar.js"),
    file("../public/bursar.html"),
    file("../src/security/finance-http-handler.mjs"),
    file("../src/db/finance-repositories.mjs"),
    file("../src/db/auth-repositories.mjs")
  ]);

test("annual school fee decisions are year-scoped, approved before year activation, and immutable", () => {
  assert.match(yearFees, /annual_school_fee_rates/);
  assert.match(yearFees, /UNIQUE \(academic_year_id,class_id,learner_type\)/);
  assert.match(yearFees, /y\.status<>'Planned'/);
  assert.match(yearFees, /r\.role_code='director'/);
  assert.match(yearFees, /decision='Continued' AND NEW\.amount_ugx<>previous_rate\.amount_ugx/);
  assert.match(yearFees, /annual_school_fee_rates_append_only/);
  assert.match(yearFees, /annual_fee_policy_enabled SET DEFAULT true/);
});

test("Income B item prices can change during the school year without rewriting past charges", () => {
  for (const item of ["TOP_CLASS_GRADUATION","MOCK_EXAMS","PRE_MOCK_EXAMS",
      "MUNICIPALITY_EXAMS","SCHOOL_TRIP","GRADUATION_TRIP","WESTERN_PARADISE"]) {
    assert.ok(yearFees.includes(item), item);
  }
  assert.match(yearFees, /income_b_item_price_history/);
  assert.match(yearFees, /NEW\.effective_on NOT BETWEEN y\.starts_on AND y\.ends_on/);
  assert.match(yearFees, /income_b_item_prices_append_only/);
  assert.doesNotMatch(yearFees, /UPDATE cornhill_school\.payment_records/i);
});

test("a mixed payment has a single immutable receipt with paid and remaining per item", () => {
  assert.match(postedIncome, /CREATE OR REPLACE FUNCTION cornhill_school\.issue_payment_receipt/);
  assert.match(postedIncome, /'fee_item_code',fc\.item_code/);
  assert.match(postedIncome, /'income_group',fc\.income_group/);
  assert.match(postedIncome, /'allocated_ugx',pa\.amount_ugx/);
  assert.match(postedIncome, /'balance_after_ugx'/);
  assert.match(postedIncome, /'received_by_staff_name',receiver_name/);
  assert.doesNotMatch(postedIncome, /UPDATE cornhill_school\.payment_receipts/);
  assert.match(financeUi, /Income " \+ group/);
  assert.match(financeUi, /item\.balance_after_ugx/);
  assert.match(bursarHtml, /Multiple items — School fees/);
});

test("Income A/B reporting counts allocated retained credits once and excludes reversals", () => {
  assert.match(postedIncome, /finance_posted_income_allocations/);
  assert.match(postedIncome, /payment_credit_allocations pca/);
  assert.match(postedIncome, /source\.status='Posted'/);
  assert.match(postedIncome, /pr\.status='Posted'/);
  assert.match(postedIncome, /finance_income_group_summary/);
  assert.match(postedIncome, /finance_staff_can_read/);
  assert.match(classifiedAccount, /'income_group',fc\.income_group/);
  assert.match(financeApi, /\/api\/v1\/finance\/income-summary/);
  assert.match(financeRepo, /finance_income_group_summary/);
  assert.match(bursarHtml, /id="income-summary-form"/);
});

test("staff accounts show the staff profile legal name while preserving login fallback", () => {
  assert.match(authRepo, /NULLIF\(btrim\(sp\.legal_name\), ''\), sa\.username, ga\.guardian_name/);
  assert.match(authRepo, /LEFT JOIN cornhill_school\.staff_profiles sp/);
  assert.match(financeUi, /principal\.displayName/);
});
