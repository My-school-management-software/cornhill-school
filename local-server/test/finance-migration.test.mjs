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

const creditLookup=await readFile(new URL("../migrations/014_local_finance_credit_source_lookup.sql",import.meta.url),"utf8");
test("retained-credit source lookup exposes only remaining posted credit to its separate permission",()=>{
 assert.match(creditLookup,/finance_list_learner_credit_sources/);
 assert.match(creditLookup,/finance[.]credit_allocate/);
 assert.match(creditLookup,/p[.]status = 'Posted'/);
 assert.match(creditLookup,/remaining_credit_ugx/);
 assert.match(creditLookup,/REVOKE ALL ON FUNCTION/);
 assert.match(creditLookup,/GRANT EXECUTE ON FUNCTION/);
});

const creditStatus=await readFile(new URL("../migrations/015_local_finance_credit_allocation_recovery.sql",import.meta.url),"utf8");
test("retained-credit recovery lookup is scoped to the authenticated actor and opaque idempotency key",()=>{
 assert.match(creditStatus,/finance_get_credit_allocation_by_key/);
 assert.match(creditStatus,/finance[.]credit_allocate/);
 assert.match(creditStatus,/b[.]actor_staff_id = p_actor_staff_id/);
 assert.match(creditStatus,/b[.]idempotency_key = p_idempotency_key/);
 assert.match(creditStatus,/SECURITY DEFINER/);
 assert.match(creditStatus,/REVOKE ALL ON FUNCTION/);
 assert.match(creditStatus,/GRANT EXECUTE ON FUNCTION/);
 assert.doesNotMatch(creditStatus,/UPDATE cornhill_school[.]payment_receipts/);
});

const paymentRecovery=await readFile(new URL("../migrations/016_local_finance_payment_recovery.sql",import.meta.url),"utf8");
test("payment recovery is actor-scoped, permission-gated and returns the original receipt snapshot",()=>{
 assert.match(paymentRecovery,/finance_get_payment_by_key/);
 assert.match(paymentRecovery,/finance[.]payments_record/);
 assert.match(paymentRecovery,/p[.]idempotency_key = p_idempotency_key/);
 assert.match(paymentRecovery,/p[.]received_by_staff_id = p_actor_staff_id/);
 assert.match(paymentRecovery,/receipt_data_snapshot/);
 assert.match(paymentRecovery,/SECURITY DEFINER/);
 assert.match(paymentRecovery,/REVOKE ALL ON FUNCTION/);
 assert.match(paymentRecovery,/GRANT EXECUTE ON FUNCTION/);
 assert.doesNotMatch(paymentRecovery,/UPDATE cornhill_school[.]payment_receipts/);
});


const evidence=await readFile(new URL("../migrations/017_local_finance_evidence_foundation.sql",import.meta.url),"utf8");
test("private evidence metadata enforces opaque keys, integrity hashes and upload size limits",()=>{
 assert.match(evidence,/storage_object_key uuid NOT NULL UNIQUE/);
 assert.match(evidence,/sha256 char\(64\) NOT NULL CHECK/);
 assert.match(evidence,/size_bytes BETWEEN 1 AND 15728640/);
 assert.ok(evidence.includes("content_type IN ('image/jpeg','image/png','image/webp','application/pdf')"));
 assert.match(evidence,/finance\.evidence_manage/);
 assert.match(evidence,/finance\.evidence_review/);
});
test("evidence requests require active assigned staff and immutable file history",()=>{
 assert.match(evidence,/employment_status='Active'/);
 assert.match(evidence,/prevent_evidence_history_mutation/);
 assert.match(evidence,/BEFORE UPDATE OR DELETE ON cornhill_school\.evidence_capture_files/);
 assert.match(evidence,/BEFORE UPDATE OR DELETE ON cornhill_school\.evidence_capture_reviews/);
 assert.match(evidence,/BEFORE UPDATE OR DELETE ON cornhill_school\.evidence_capture_events/);
});
test("evidence review enforces separation of duties and request expiry",()=>{
 assert.match(evidence,/v_request\.requested_by_staff_id=p_actor_staff_id/);
 assert.match(evidence,/uploaded_by_staff_id=p_actor_staff_id/);
 assert.match(evidence,/v_request\.expires_at<=now\(\)/);
 assert.match(evidence,/Needs clearer photo/);
});
test("finance API receives only evidence workflow function execution, not table grants",()=>{
 assert.match(evidence,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api/);
 assert.match(evidence,/GRANT EXECUTE ON FUNCTION cornhill_school\.register_local_evidence_file/);
 assert.match(evidence,/GRANT EXECUTE ON FUNCTION cornhill_school\.review_local_evidence_request/);
 assert.doesNotMatch(evidence,/GRANT SELECT, INSERT|GRANT ALL ON TABLE/);
 assert.doesNotMatch(evidence,/REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA cornhill_school/);
});

const evidenceFileLookup=await readFile(new URL("../migrations/018_local_finance_evidence_file_lookup.sql",import.meta.url),"utf8");
test("evidence file lookup is security-definer, actor-scoped and never grants table access",()=>{
 assert.match(evidenceFileLookup,/finance_get_evidence_file/);
 assert.match(evidenceFileLookup,/SECURITY DEFINER/);
 assert.match(evidenceFileLookup,/finance[.]evidence_review/);
 assert.match(evidenceFileLookup,/finance[.]evidence_manage/);
 assert.match(evidenceFileLookup,/assigned_staff_id,v_file[.]requested_by_staff_id/);
 assert.match(evidenceFileLookup,/REVOKE ALL ON FUNCTION/);
 assert.match(evidenceFileLookup,/GRANT EXECUTE ON FUNCTION/);
 assert.doesNotMatch(evidenceFileLookup,/GRANT SELECT|GRANT ALL ON TABLE/);
});

const expenseBank=await readFile(new URL("../migrations/019_local_finance_expense_banking_foundation.sql",import.meta.url),"utf8");
test("expense and banking foundation keeps UGX amounts, daily operator limits and evidence links",()=>{
 assert.match(expenseBank,/finance_operator_limits/);
 assert.match(expenseBank,/daily_limit_ugx bigint NOT NULL CHECK\(daily_limit_ugx > 0\)/);
 assert.match(expenseBank,/timezone\('Africa\/Kampala',now\(\)\)/);
 assert.match(expenseBank,/evidence_request_id uuid REFERENCES cornhill_school\.evidence_capture_requests/);
 assert.match(expenseBank,/finance\.expenses_request/);
 assert.match(expenseBank,/finance\.expenses_review/);
 assert.match(expenseBank,/finance\.banking_verify/);
});
test("expense and bank ledgers are append-only and duplicate postings are constrained",()=>{
 assert.match(expenseBank,/expense_request_id uuid NOT NULL UNIQUE/);
 assert.match(expenseBank,/bank_transaction_id uuid NOT NULL UNIQUE/);
 assert.match(expenseBank,/prevent_expense_banking_history_mutation/);
 assert.match(expenseBank,/expense_ledger_immutable/);
 assert.match(expenseBank,/bank_ledger_immutable/);
 assert.match(expenseBank,/expense_request_events_immutable/);
 assert.match(expenseBank,/bank_transaction_events_immutable/);
});
test("bank ledger records only verified actor-stamped signed UGX transactions",()=>{
 assert.match(expenseBank,/verified_by_staff_id uuid NOT NULL/);
 assert.match(expenseBank,/verified_at timestamptz NOT NULL/);
 assert.match(expenseBank,/signed_amount_ugx=-amount_ugx/);
 assert.match(expenseBank,/status IN \('Pending','Approved','Rejected','Verified'\)/);
 assert.match(expenseBank,/reviewed_by_staff_id<>requested_by_staff_id/);
});
test("expense and banking permissions are explicit and runtime table access remains revoked",()=>{
 assert.match(expenseBank,/finance\.expenses_post/);
 assert.match(expenseBank,/finance\.banking_manage/);
 assert.match(expenseBank,/finance\.banking_review/);
 assert.match(expenseBank,/REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api/);
 assert.doesNotMatch(expenseBank,/GRANT SELECT|GRANT INSERT|GRANT ALL ON TABLE/);
});


const expenseBankWorkflows=await readFile(new URL("../migrations/020_local_expense_banking_workflows.sql",import.meta.url),"utf8");
test("expense requests serialize daily limit checks and require active permission",()=>{
 assert.match(expenseBankWorkflows,/finance_actor_has_permission/);
 assert.match(expenseBankWorkflows,/FOR UPDATE/);
 assert.match(expenseBankWorkflows,/timezone\('Africa\\/Kampala',now\(\)\)/);
 assert.match(expenseBankWorkflows,/Daily expense limit would be exceeded/);
});
test("expense approval and posting enforce separation of duties and approved evidence",()=>{
 assert.match(expenseBankWorkflows,/requester cannot approve or reject their own request/);
 assert.match(expenseBankWorkflows,/e[.]status='Approved'/);
 assert.match(expenseBankWorkflows,/ON CONFLICT\(expense_request_id\) DO NOTHING/);
});
test("bank workflows require independent review and approved evidence before verified ledger posting",()=>{
 assert.match(expenseBankWorkflows,/entrant cannot approve or reject their own transaction/);
 assert.match(expenseBankWorkflows,/e[.]status='Approved'/);
 assert.match(expenseBankWorkflows,/ON CONFLICT\(bank_transaction_id\) DO NOTHING/);
 assert.match(expenseBankWorkflows,/FOR UPDATE/);
});
test("financial evidence attachment is scoped to the matching request and account",()=>{
 assert.match(expenseBankWorkflows,/attach_local_finance_evidence/);
 assert.match(expenseBankWorkflows,/context_record_id=p_record/);
 assert.match(expenseBankWorkflows,/GRANT EXECUTE ON FUNCTION/);
});

test("expense and bank posting retries return existing ledger rows",()=>{
 assert.match(expenseBankWorkflows,/v_row[.]status='Posted'[\s\S]*?WHERE expense_request_id=p_request/);
 assert.match(expenseBankWorkflows,/v_row[.]status='Verified'[\s\S]*?WHERE bank_transaction_id=p_transaction/);
});

test("expense limit administration and bank account creation are permission-gated",()=>{
 assert.match(expenseBankWorkflows,/set_local_expense_operator_limit/);
 assert.match(expenseBankWorkflows,/finance[.]expenses_manage/);
 assert.match(expenseBankWorkflows,/create_local_bank_account/);
 assert.match(expenseBankWorkflows,/account_number_last4/);
 assert.match(expenseBankWorkflows,/GRANT EXECUTE ON FUNCTION cornhill_school[.]set_local_expense_operator_limit/);
});

test("expense and banking workflow SQL has balanced function bodies and valid account routine",()=>{
 assert.equal((expenseBankWorkflows.match(/\$fn\$/g)||[]).length%2,0);
 assert.match(expenseBankWorkflows,/p_last4 !~ '\^\[0-9\]\{4\}\$'/);
 assert.match(expenseBankWorkflows,/account_number_last4,opening_balance_ugx,created_by_staff_id/);
 assert.match(expenseBankWorkflows,/CREATE OR REPLACE FUNCTION cornhill_school[.]create_local_expense_request/);
});
test("daily limit excludes cancelled and rejected requests while counting pending and posted",()=>{
 assert.match(expenseBankWorkflows,/status NOT IN \('Cancelled','Rejected'\)/);
});
test("permission helper uses the actual local role and employment tables",()=>{
 assert.match(expenseBankWorkflows,/cornhill_auth[.]staff_role_assignments/);
 assert.match(expenseBankWorkflows,/cornhill_auth[.]staff_role_permissions/);
 assert.match(expenseBankWorkflows,/cornhill_school[.]staff_profiles/);
 assert.match(expenseBankWorkflows,/employment_status='Active'/);
});

const expenseBankPermissions=await readFile(new URL("../migrations/021_local_expense_banking_permission_catalog.sql",import.meta.url),"utf8");
test("expense and banking permission catalog includes every workflow capability",()=>{
 for(const code of ["finance.expenses_manage","finance.expenses_request","finance.expenses_review","finance.expenses_post","finance.banking_manage","finance.banking_review","finance.banking_verify"])
  assert.ok(expenseBankPermissions.includes("('"+code+"'"),"missing permission "+code);
 assert.match(expenseBankPermissions,/ON CONFLICT\(permission_code\) DO NOTHING/);
});

const bankConcurrency=await readFile(new URL("../migrations/022_local_bank_balance_concurrency_guard.sql",import.meta.url),"utf8");
test("bank withdrawals serialize on the shared bank-account row before checking posted balance",()=>{
 assert.match(bankConcurrency,/FROM cornhill_school[.]bank_accounts[\s\S]*?FOR UPDATE/);
 assert.match(bankConcurrency,/FROM cornhill_school[.]bank_ledger[\s\S]*?sum\(signed_amount_ugx\)/);
 assert.ok(bankConcurrency.indexOf("FOR UPDATE")<bankConcurrency.indexOf("SELECT coalesce(sum(signed_amount_ugx)"));
 assert.match(bankConcurrency,/Withdrawal would make the verified bank balance negative/);
 assert.match(bankConcurrency,/GRANT EXECUTE ON FUNCTION cornhill_school[.]verify_local_bank_transaction/);
 assert.match(bankConcurrency,/REVOKE ALL ON FUNCTION cornhill_school[.]verify_local_bank_transaction/);
});

const financeLookups=await readFile(new URL("../migrations/023_local_finance_workspace_lookups.sql",import.meta.url),"utf8");
test("finance workspace lookups are permission-checked and expose only active records",()=>{
 assert.match(financeLookups,/finance_list_expense_categories/);
 assert.match(financeLookups,/finance_list_bank_accounts/);
 assert.match(financeLookups,/WHERE c[.]is_active/);
 assert.match(financeLookups,/WHERE b[.]is_active/);
 assert.match(financeLookups,/GRANT EXECUTE ON FUNCTION cornhill_school[.]finance_list_expense_categories/);
 assert.match(financeLookups,/GRANT EXECUTE ON FUNCTION cornhill_school[.]finance_list_bank_accounts/);
});

const financeQueues=await readFile(new URL("../migrations/024_local_finance_review_queues.sql",import.meta.url),"utf8");
test("expense and bank review queues enforce reviewer or posting permissions and cap returned records",()=>{
 assert.match(financeQueues,/finance_list_expense_review_queue/);
 assert.match(financeQueues,/finance_list_bank_review_queue/);
 assert.match(financeQueues,/finance[.]expenses_review/);
 assert.match(financeQueues,/finance[.]expenses_post/);
 assert.match(financeQueues,/finance[.]banking_review/);
 assert.match(financeQueues,/finance[.]banking_verify/);
 assert.match(financeQueues,/LIMIT 100/);
});
const reviewerEvidence=await readFile(new URL("../migrations/025_local_finance_reviewer_evidence_attachment.sql",import.meta.url),"utf8");
test("reviewers may attach only evidence requests already linked to the exact finance record",()=>{
 assert.match(reviewerEvidence,/context_record_id=p_record/);
 assert.match(reviewerEvidence,/requested_by_staff_id=p_actor OR cornhill_school[.]finance_actor_has_permission/);
 assert.match(reviewerEvidence,/status IN \('Pending','Submitted','Approved'\)/);
 assert.match(reviewerEvidence,/REVOKE ALL ON FUNCTION cornhill_school[.]attach_local_finance_evidence/);
 assert.match(reviewerEvidence,/GRANT EXECUTE ON FUNCTION cornhill_school[.]attach_local_finance_evidence/);
});

const approvedExpenseEvidence=await readFile(new URL("../migrations/026_local_finance_approved_expense_evidence_link.sql",import.meta.url),"utf8");
test("approved expenses can receive matching evidence before ledger posting",()=>{
 assert.match(approvedExpenseEvidence,/status IN \('Pending','Approved'\)/);
 assert.match(approvedExpenseEvidence,/context_record_id=p_record/);
 assert.match(approvedExpenseEvidence,/finance[.]expenses_review/);
 assert.match(approvedExpenseEvidence,/GRANT EXECUTE ON FUNCTION cornhill_school[.]attach_local_finance_evidence/);
});


test("migration 027 limits the expense-limit staff directory to authorised administrators and active staff",async()=>{
 const sql=await readFile(new URL("../migrations/027_local_finance_expense_limit_staff_lookup.sql",import.meta.url),"utf8");
 assert.match(sql,/finance_actor_has_permission\(p_actor,'finance[.]expenses_manage'\)/);
 assert.match(sql,/sa[.]account_status='active'/);
 assert.match(sql,/sp[.]employment_status='Active'/);
 assert.match(sql,/LIMIT 250/);
 assert.match(sql,/REVOKE ALL ON FUNCTION cornhill_school[.]finance_list_expense_limit_staff/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION cornhill_school[.]finance_list_expense_limit_staff\(uuid\)\s+TO cornhill_finance_runtime/);
});
