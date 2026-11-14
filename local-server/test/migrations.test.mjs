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
test("all nineteen migrations use valid outer transactions",async()=>{
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
 "019_local_finance_expense_banking_foundation.sql"]);
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
