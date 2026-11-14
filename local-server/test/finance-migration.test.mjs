import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../migrations/007_local_finance_foundation.sql", import.meta.url), "utf8");

test("finance migration is transactional and contains no destructive data operations", () => {
  assert.match(sql, /^--[\s\S]*?BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DROP SCHEMA|DELETE FROM public\./i);
});

test("fee obligations are linked to one learner, academic term and catalogue item in UGX", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.fee_catalogue/);
  assert.match(sql, /CREATE TABLE cornhill_school\.fee_obligations/);
  assert.match(sql, /UNIQUE \(learner_id, academic_term_id, fee_item_id\)/);
  assert.match(sql, /amount_ugx bigint NOT NULL CHECK \(amount_ugx > 0\)/);
  assert.match(sql, /learner_record\.is_bursary AND fee_category = 'tuition'/);
  assert.match(sql, /NEW\.amount_ugx <> learner_record\.bursary_fee_ugx/);
});

test("payment records support UGX, multiple methods, MTN and Airtel mobile money", () => {
  assert.match(sql, /currency char\(3\) NOT NULL DEFAULT 'UGX' CHECK \(currency = 'UGX'\)/);
  assert.match(sql, /'cash', 'mobile_money', 'bank_transfer', 'card', 'cheque'/);
  assert.match(sql, /mobile_money_provider IN \('MTN', 'Airtel'\)/);
  assert.match(sql, /idempotency_key uuid NOT NULL UNIQUE/);
  assert.match(sql, /payment_external_reference_unique/);
});

test("payment allocations require same learner and a draft payment", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.payment_allocations/);
  assert.match(sql, /Allocations can only be added to a draft payment/);
  assert.match(sql, /Payment and fee obligation must belong to the same learner/);
  assert.match(sql, /A posted payment must be fully allocated to fee obligations/);
  assert.match(sql, /Payment allocations cannot exceed the fee obligation balance/);
});

test("posting a payment issues an immutable receipt with previous and current term allocations", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.payment_receipts/);
  assert.match(sql, /receipt_data_snapshot jsonb NOT NULL/);
  assert.match(sql, /receipt_code := 'CR-'/);
  assert.match(sql, /'pupil_code', learner_record\.pupil_code/);
  assert.match(sql, /'learner_name', learner_record\.learner_name/);
  assert.match(sql, /'allocations', allocation_snapshot/);
  assert.match(sql, /Receipt content is immutable/);
  assert.match(sql, /payment_receipt_immutable/);
});

test("posting queues guardian SMS only when the guardian opted in", () => {
  assert.match(sql, /CREATE TABLE cornhill_school\.payment_notification_outbox/);
  assert.match(sql, /gc\.sms_opt_in = true/);
  assert.match(sql, /gc\.phone_e164 IS NOT NULL/);
  assert.match(sql, /ON CONFLICT \(payment_id, guardian_contact_id, channel\) DO NOTHING/);
  assert.doesNotMatch(sql, /https?:\/\/|fetch\(|sendSms|sendSMS/i);
});

test("fee balance view is security-invoker and reports paid and outstanding amounts", () => {
  assert.match(sql, /CREATE OR REPLACE VIEW cornhill_school\.fee_obligation_balances/);
  assert.match(sql, /WITH \(security_invoker = true\)/);
  assert.match(sql, /AS paid_ugx/);
  assert.match(sql, /AS balance_ugx/);
  assert.match(sql, /pr\.status = 'Posted'/);
});
test("finance permissions are catalogued but not granted to roles", () => {
  for (const permission of [
    "finance.fees_manage", "finance.bursary_manage", "finance.receipts_reprint",
    "finance.expenses_manage", "finance.banking_manage"
  ]) assert.ok(sql.includes("'" + permission + "'"));
  assert.doesNotMatch(sql, /INSERT INTO cornhill_auth\.staff_role_permissions/);
});

test("PUBLIC and browser roles receive no direct finance database grants", () => {
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA cornhill_school FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated|PUBLIC)/i);
});
