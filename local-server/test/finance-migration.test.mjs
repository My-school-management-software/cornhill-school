import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const foundation=await readFile(new URL("../migrations/007_local_finance_foundation.sql",import.meta.url),"utf8");
const posting=await readFile(new URL("../migrations/010_local_finance_payment_posting.sql",import.meta.url),"utf8");
const lookup=await readFile(new URL("../migrations/011_local_finance_learner_lookup_api.sql",import.meta.url),"utf8");
const reprint=await readFile(new URL("../migrations/012_local_finance_audited_receipt_reprints.sql",import.meta.url),"utf8");
test("finance foundation has protected UGX obligations and bursary rules",()=>{
 assert.match(foundation,/CREATE TABLE cornhill_school\.fee_catalogue/);
 assert.match(foundation,/CREATE TABLE cornhill_school\.fee_obligations/);
 assert.match(foundation,/UNIQUE \(learner_id, academic_term_id, fee_item_id\)/);
 assert.match(foundation,/learner_record\.is_bursary AND fee_category = 'tuition'/);
 assert.match(foundation,/NEW\.amount_ugx <> learner_record\.bursary_fee_ugx/);
 assert.match(foundation,/currency char\(3\) NOT NULL DEFAULT 'UGX' CHECK \(currency = 'UGX'\)/);
});
test("finance supports MTN/Airtel, unique idempotency and payment methods",()=>{
 assert.match(foundation,/'cash', 'mobile_money', 'bank_transfer', 'card', 'cheque'/);
 assert.match(foundation,/mobile_money_provider IN \('MTN', 'Airtel'\)/);
 assert.match(foundation,/idempotency_key uuid NOT NULL UNIQUE/);
 assert.match(foundation,/payment_external_reference_unique/);
});
test("receipt snapshots and guardian SMS are immutable and consent-gated",()=>{
 assert.match(foundation,/CREATE TABLE cornhill_school\.payment_receipts/);
 assert.match(foundation,/receipt_data_snapshot jsonb NOT NULL/);
 assert.match(foundation,/Receipt content is immutable/);
 assert.match(foundation,/gc\.sms_opt_in = true/);
 assert.match(foundation,/gc\.phone_e164 IS NOT NULL/);
 assert.doesNotMatch(foundation,/https?:\/\/|fetch\(|sendSms|sendSMS/i);
});
test("finance balance view is security-invoker and role grants are explicit",()=>{
 assert.match(foundation,/WITH \(security_invoker = true\)/);
 assert.match(foundation,/REVOKE ALL ON ALL TABLES IN SCHEMA cornhill_school FROM PUBLIC/);
 assert.doesNotMatch(foundation,/INSERT INTO cornhill_auth\.staff_role_permissions/);
});
test("payment posting reconciles allocated and unallocated sums",()=>{
 assert.match(posting,/unallocated_amount_ugx bigint NOT NULL DEFAULT 0/);
 assert.ok(posting.includes("allocated+credit<>amt"));
 assert.ok(posting.includes("NEW.unallocated_amount_ugx"));
});
test("atomic posting checks staff permission, learner, row locks and idempotency",()=>{
 assert.match(posting,/post_local_payment/);assert.match(posting,/SECURITY DEFINER/);
 assert.ok(posting.includes("finance.payments_record"));assert.match(posting,/pg_advisory_xact_lock/);
 assert.match(posting,/FOR UPDATE/);assert.ok(posting.includes("idempotency_key=p_idempotency_key"));
});
test("receipt snapshots include payer, collection item and unallocated credit",()=>{
 assert.ok(posting.includes("'payer_name',NEW.payer_name"));
 assert.ok(posting.includes("'collection_item',NEW.collection_item"));
 assert.ok(posting.includes("'unallocated_amount_ugx',NEW.unallocated_amount_ugx"));
});
test("finance learner lookups are permission-gated security-definer routines",()=>{
 assert.match(lookup,/finance_search_learners/);assert.match(lookup,/finance_get_learner_account/);
 assert.match(lookup,/SECURITY DEFINER/);assert.match(lookup,/finance\.payments_record/);
 assert.match(lookup,/LIMIT 25/);assert.match(lookup,/fee_obligation_balances/);
 assert.match(lookup,/REVOKE ALL ON FUNCTION cornhill_school\.finance_search_learners/);
 assert.match(lookup,/GRANT EXECUTE ON FUNCTION cornhill_school\.finance_search_learners/);
});
test("finance API gets function execution but not direct access to school finance tables",()=>{
 assert.match(posting,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_school/);
 assert.match(posting,/REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cornhill_school/);
 assert.ok(posting.includes("FROM cornhill_finance_runtime,cornhill_finance_api"));
 assert.match(lookup,/GRANT EXECUTE ON FUNCTION cornhill_school\.finance_get_learner_account/);
});

test("receipt reprinting has independent permission, reason and immutable snapshot audit",()=>{
 assert.match(reprint,/reprint_local_payment_receipt/);
 assert.match(reprint,/finance\.receipts_reprint/);
 assert.match(reprint,/p_reason/);
 assert.match(reprint,/receipt\.reprinted/);
 assert.match(reprint,/UPDATE cornhill_school\.payment_receipts/);
 assert.match(reprint,/receipt_data_snapshot/);
 assert.match(reprint,/FOR UPDATE OF r, p/);
 assert.match(reprint,/REVOKE ALL ON FUNCTION cornhill_school\.reprint_local_payment_receipt/);
 assert.match(reprint,/GRANT EXECUTE ON FUNCTION cornhill_school\.reprint_local_payment_receipt/);
});

const credit=await readFile(new URL("../migrations/013_local_finance_credit_allocation.sql",import.meta.url),"utf8");
test("retained credit uses an immutable append-only allocation ledger and separate permission",()=>{
 assert.match(credit,/finance\.credit_allocate/);
 assert.match(credit,/CREATE TABLE cornhill_school\.payment_credit_allocation_batches/);
 assert.match(credit,/CREATE TABLE cornhill_school\.payment_credit_allocations/);
 assert.match(credit,/prevent_credit_ledger_mutation/);
 assert.match(credit,/payment\.credit_allocated/);
 assert.match(credit,/allocate_local_payment_credit/);
 assert.match(credit,/pg_advisory_xact_lock/);
 assert.match(credit,/FOR UPDATE/);
 assert.match(credit,/remaining unallocated amount/);
 assert.match(credit,/Combined payment and retained-credit allocations exceed a fee obligation/);
 assert.doesNotMatch(credit,/UPDATE cornhill_school[.]payment_receipts/);
 assert.match(credit,/REVOKE ALL ON TABLE/);
 assert.match(credit,/GRANT EXECUTE ON FUNCTION cornhill_school\.allocate_local_payment_credit/);
});
