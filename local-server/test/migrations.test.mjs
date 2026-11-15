import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { assertMigrationLedgerRow, migrationChecksum, prepareTransactionalMigration, sortMigrationFiles } from "../src/db/migrations.mjs";
const validSql="BEGIN;\nCREATE TABLE example (id integer);\nCOMMIT;";
test("migration filenames sort by version and reject duplicates",()=>{
 assert.deepEqual(sortMigrationFiles(["002_local_authorization_foundation.sql","001_local_identity_foundation.sql","README.md"]),["001_local_identity_foundation.sql","002_local_authorization_foundation.sql"]);
 assert.throws(()=>sortMigrationFiles(["001_identity.sql","001_permissions.sql"]),/prefixes must be unique/);
 assert.throws(()=>sortMigrationFiles("001_identity.sql"),/must be an array/);
 assert.throws(()=>sortMigrationFiles(["new_migration.sql"]),/numeric-prefix/);
});
test("migration checksums are stable SHA-256 values",()=>{
 const checksum=migrationChecksum(validSql);assert.match(checksum,/^[0-9a-f]{64}$/);
 assert.equal(migrationChecksum(validSql),checksum);assert.notEqual(migrationChecksum(validSql+" "),checksum);
});
test("runner strips outer transaction wrapper and accepts comment headers",()=>{
 assert.equal(prepareTransactionalMigration(validSql),"CREATE TABLE example (id integer);");
 assert.equal(prepareTransactionalMigration("-- header\n/* block */\nBEGIN;\nSELECT 1;\nCOMMIT;"),"SELECT 1;");
 assert.equal(prepareTransactionalMigration("\uFEFF-- header\r\nBEGIN;\r\nSELECT 1;\r\nCOMMIT;"),"SELECT 1;");
 assert.throws(()=>prepareTransactionalMigration("/* unterminated\nBEGIN; SELECT 1; COMMIT;"),/BEGIN\/COMMIT/);
});
test("all seventy-eight migrations use valid outer transactions",async()=>{
 const dir=new URL("../migrations/",import.meta.url);const names=sortMigrationFiles(await readdir(dir));
 assert.deepEqual(names,[
 "001_local_identity_foundation.sql","002_local_authorization_foundation.sql","003_local_auth_rate_limit_indexes.sql",
 "004_local_auth_runtime_role.sql","005_local_learner_admissions_foundation.sql","006_local_academics_foundation.sql",
 "007_local_finance_foundation.sql","008_local_staff_attendance_payroll_foundation.sql",
 "009_local_attendance_salary_governance.sql","010_local_finance_payment_posting.sql",
 "011_local_finance_learner_lookup_api.sql","012_local_finance_audited_receipt_reprints.sql",
 "013_local_finance_credit_allocation.sql","014_local_finance_credit_source_lookup.sql",
 "015_local_finance_credit_allocation_recovery.sql","016_local_finance_payment_recovery.sql",
 "017_local_finance_evidence_foundation.sql","018_local_finance_evidence_file_lookup.sql",
 "019_local_finance_expense_banking_foundation.sql","020_local_expense_banking_workflows.sql","021_local_expense_banking_permission_catalog.sql","022_local_bank_balance_concurrency_guard.sql","023_local_finance_workspace_lookups.sql","024_local_finance_review_queues.sql","025_local_finance_reviewer_evidence_attachment.sql","026_local_finance_approved_expense_evidence_link.sql","027_local_finance_expense_limit_staff_lookup.sql","028_local_finance_record_evidence_lookup.sql","029_local_finance_record_history.sql","030_local_finance_workflow_permissions.sql","031_local_finance_record_archive.sql","032_local_staff_date_range_integrity.sql","033_local_payroll_period_date_integrity.sql","034_local_saturday_attendance_hours.sql","035_local_special_session_review_payroll_link.sql","036_local_special_session_authority_guard.sql","037_local_special_session_assignment_guard.sql","038_local_special_session_assignment_integrity.sql","039_local_attendance_incident_authority_guard.sql","040_local_attendance_incident_identity_guard.sql","041_local_payroll_audit_append_only.sql","042_local_attendance_adjustment_history_guard.sql","043_local_attendance_adjustment_independent_review.sql","044_local_payroll_run_finality_guard.sql","045_local_attendance_event_evidence_guard.sql","046_local_payroll_period_identity_guard.sql","047_local_salary_agreement_range_guard.sql","048_local_payroll_detail_parent_guard.sql","049_local_staff_schedule_history_guard.sql","050_local_payroll_attendance_adjustment_single_use.sql","051_local_attendance_payroll_basis_guard.sql","052_local_attendance_payroll_basis_lock.sql","053_local_payroll_adjustment_attendance_lock.sql","054_local_attendance_device_staff_mapping.sql","055_local_attendance_event_mapping_guard.sql","056_local_attendance_import_batch_finality.sql","057_local_attendance_device_identity_guard.sql","058_local_attendance_incident_day_identity.sql","059_local_salary_agreement_history_guard.sql","060_local_employment_term_range_history_guard.sql","061_local_work_schedule_definition_history_guard.sql","062_local_payroll_attendance_source_employee_period_guard.sql","063_local_payroll_line_item_reapproval_guard.sql","064_local_staff_leave_request_foundation.sql","065_local_staff_leave_request_transition_guard.sql","066_local_staff_leave_overlap_guard.sql","067_local_staff_leave_balance_ledger.sql","068_local_attendance_day_review_events.sql","069_local_attendance_day_review_guard.sql","070_local_staff_attendance_leave_reporting_views.sql","071_local_payroll_disbursement_foundation.sql","072_local_payroll_disbursement_validation.sql","073_local_payroll_disbursement_finality.sql",
 "074_local_school_catalog_read_api.sql","075_local_learner_roster_read_api.sql","076_local_learner_admission_write_api.sql","077_local_academics_workspace_api.sql","078_local_academic_period_setup.sql"]);
 for(const name of names){const source=await readFile(new URL(name,dir),"utf8");assert.doesNotThrow(()=>prepareTransactionalMigration(source),name);}
});
test("runner rejects malformed or destructive SQL and ledger mismatches",()=>{
 assert.throws(()=>prepareTransactionalMigration(""),/non-empty/);
 assert.throws(()=>prepareTransactionalMigration("CREATE TABLE x(id int);"),/BEGIN\/COMMIT/);
 assert.throws(()=>prepareTransactionalMigration("BEGIN; SELECT 1;"),/BEGIN\/COMMIT/);
 assert.throws(()=>prepareTransactionalMigration("BEGIN; DROP DATABASE x; COMMIT;"),/Destructive SQL/);
 assert.throws(()=>prepareTransactionalMigration("BEGIN; TRUNCATE TABLE x; COMMIT;"),/Destructive SQL/);
 const checksum=migrationChecksum(validSql);
 assert.equal(assertMigrationLedgerRow({migration_name:"001",checksum},checksum,"001"),true);
 assert.throws(()=>assertMigrationLedgerRow({migration_name:"001",checksum:"bad"},checksum,"001"),/ledger mismatch/);
});
