// CORNHILL V57 — read-only Windows local school migration and finance gate.
// Run from local-server using: node --env-file=.env <temporary path to this script>
// The script does not run migrations, change source files, disclose personal data,
// create accounts, post payments or synchronize with cloud systems.
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const workingDir = resolve(process.cwd());
const appPackage = JSON.parse(await readFile(join(workingDir, "package.json"), "utf8"));
if (appPackage.name !== "cornhill-local-server") {
  throw new Error("Run this audit from the CORNHILL local-server directory only.");
}

const configModuleUrl = pathToFileURL(join(workingDir, "src", "db", "config.mjs")).href;
const { readLocalDatabaseConfig } = await import(configModuleUrl);
const requireFromServer = createRequire(join(workingDir, "package.json"));
const { Client } = requireFromServer("pg");
const report = {
  audit: "CORNHILL_V57_LOCAL_DB_READ_ONLY_ACCEPTANCE",
  generated_at: new Date().toISOString(),
  database_target: "cornhill_local",
  database_connection: "NOT_VERIFIED",
  database_transaction: "REPEATABLE_READ_READ_ONLY",
  migration_ledger: "NOT_VERIFIED",
  migrations_present_on_disk: 0,
  migration_disk_version_numbers: {},
  migrations_applied: null,
  migration_missing_disk_sources: [],
  migration_pending_in_database: [],
  migration_checksum_mismatches: [],
  learner_count: null,
  unique_learner_codes: null,
  payment_count: null,
  posted_payment_count: null,
  receipt_count: null,
  guardian_approved_links_count: null,
  locally_proven_finance_sync_safe: false,
  verified_loan_or_payment_identity_matches_to_cloud: false,
  formal_release_gates_cleared: 0,
  formal_release_gates_total: 5,
  writes_to_database: 0,
  writes_to_finance: 0,
  writes_to_cloud: 0,
  writes_to_existing_source_files: 0,
  secrets_or_personal_records_in_report: false,
  errors: []
};
const sourceMigrations = new Map();
try {
  const filenames = (await readdir(join(workingDir, "migrations")))
    .filter(file => /^\d{3,}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(file))
    .sort();
  report.migrations_present_on_disk = filenames.length;
  for (const filename of filenames) {
    const version = filename.split("_")[0];
    report.migration_disk_version_numbers[version] = true;
    const sql = await readFile(join(workingDir, "migrations", filename), "utf8");
    sourceMigrations.set(filename.slice(0,-4), createHash("sha256").update(sql,"utf8").digest("hex"));
  }
} catch {
  report.errors.push("Local migration source directory is missing or cannot be read.");
}

let client;
let inTransaction = false;
try {
  const config = readLocalDatabaseConfig();
  if (config.database !== "cornhill_local" ||
      !["127.0.0.1","localhost","::1"].includes(config.host)) {
    throw new Error("Unexpected database identity.");
  }
  client = new Client({ ...config, application_name: "cornhill-v57-readonly-audit" });
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  inTransaction = true;
  await client.query("SET LOCAL statement_timeout = '4000ms'");
  const identity = await client.query(
    "SELECT current_database() AS name, inet_server_port() AS port");
  if (identity.rows[0]?.name !== "cornhill_local") {
    throw new Error("Unexpected database identity.");
  }
  report.database_connection = "VERIFIED_LOCAL_LOOPBACK";
  async function relationExists(relation) {
    const r = await client.query("SELECT to_regclass($1) IS NOT NULL AS present",[relation]);
    return r.rows[0]?.present === true;
  }
  if (await relationExists("cornhill_meta.schema_migrations")) {
    try {
      const r = await client.query("SELECT migration_name,checksum FROM cornhill_meta.schema_migrations");
      report.migrations_applied = r.rowCount;
      report.migration_ledger = "READ_ONLY_VERIFIED";
      const stored = new Map(r.rows.map(row => [row.migration_name, row.checksum]));
      for (const [name,checksum] of sourceMigrations) {
        if (!stored.has(name)) report.migration_pending_in_database.push(name);
        else if (stored.get(name) !== checksum) report.migration_checksum_mismatches.push(name);
      }
      for (const name of stored.keys()) {
        if (!sourceMigrations.has(name)) report.migration_missing_disk_sources.push(name);
      }
    } catch {
      report.migration_ledger = "READ_NOT_AUTHORISED";
      report.errors.push("Migration ledger read unavailable.");
    }
  } else {
    report.migration_ledger = "NOT_FOUND";
  }
  async function countFrom(relation,sql,mapFn) {
    if (!(await relationExists(relation))) {
      report.errors.push(relation + " is not present.");
      return;
    }
    try { mapFn((await client.query(sql)).rows[0] ?? {}); }
    catch { report.errors.push(relation + " aggregate could not be read."); }
  }
  await countFrom("cornhill_school.learners",
    "SELECT count(*)::int AS total,count(DISTINCT pupil_code)::int AS codes FROM cornhill_school.learners",
    row => {
      report.learner_count = row.total;
      report.unique_learner_codes = row.codes;
    });
  await countFrom("cornhill_school.payment_records",
    "SELECT count(*)::int AS total,count(*) FILTER (WHERE status='Posted')::int AS posted FROM cornhill_school.payment_records",
    row => {
      report.payment_count = row.total;
      report.posted_payment_count = row.posted;
    });
  await countFrom("cornhill_school.payment_receipts",
    "SELECT count(*)::int AS total FROM cornhill_school.payment_receipts",
    row => { report.receipt_count = row.total; });
  await client.query("ROLLBACK");
  inTransaction = false;
} catch {
  report.errors.push("Unable to complete one or more read-only PostgreSQL checks. No migration or payment was attempted.");
  if (report.database_connection !== "VERIFIED_LOCAL_LOOPBACK") {
    report.database_connection = "NOT_VERIFIED";
  }
} finally {
  if (client) {
    if (inTransaction) { try { await client.query("ROLLBACK"); } catch {} }
    try { await client.end(); } catch {}
  }
}

report.local_migrations_source_and_ledger_match =
  report.migration_ledger === "READ_ONLY_VERIFIED" &&
  report.migration_pending_in_database.length === 0 &&
  report.migration_missing_disk_sources.length === 0 &&
  report.migration_checksum_mismatches.length === 0;
report.release_decision = "BLOCKED_REQUIRES_INDEPENDENT_ACCEPTANCE_AND_DIRECTOR_APPROVAL";
const folder = join(homedir(), "Downloads");
await mkdir(folder,{recursive:true});
const stamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,"").replace("T","-");
const outputFile = join(folder,`CORNHILL-V57-SAFE-LOCAL-DATABASE-AUDIT-${stamp}.json`);
await writeFile(outputFile,JSON.stringify(report,null,2)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});
console.log("CORNHILL_V57_READ_ONLY_DATABASE_AUDIT=COMPLETED");
console.log("DATABASE_CONNECTION="+report.database_connection);
console.log("MIGRATION_LEDGER="+report.migration_ledger);
console.log("MIGRATIONS_APPLIED="+(report.migrations_applied ?? "NOT_VERIFIED"));
console.log("MIGRATIONS_DISK="+report.migrations_present_on_disk);
console.log("MIGRATION_DISK_AND_LEDGER_MATCH="+report.local_migrations_source_and_ledger_match);
console.log("LOCAL_LEARNER_COUNT="+(report.learner_count ?? "NOT_VERIFIED"));
console.log("LOCAL_POSTED_PAYMENTS="+(report.posted_payment_count ?? "NOT_VERIFIED"));
console.log("LOCAL_RECEIPT_COUNT="+(report.receipt_count ?? "NOT_VERIFIED"));
console.log("FINANCE_SYNC_SAFE=false");
console.log("DIRECTOR_APPROVAL_REQUIRED_BEFORE_MIGRATIONS=true");
console.log("DATABASE_WRITES=0; FINANCE_WRITES=0; CLOUD_WRITES=0");
console.log("UPLOAD_SAFE_JSON_REPORT_ONLY="+outputFile);
