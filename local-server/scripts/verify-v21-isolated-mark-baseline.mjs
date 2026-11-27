// CI-ONLY PostgreSQL 17 verification. All synthetic data live in a TEMP table
// inside a rolled-back transaction in a separately identified isolated test DB.
// NEVER run against cornhill_local or Supabase.
import assert from "node:assert/strict";
import {
  readLocalDatabaseConfig, readIsolatedTestDatabaseTarget
} from "../src/db/config.mjs";
import { assertIsolatedPostgresServerIdentity } from "../src/db/migrations.mjs";
import { createPostgresAcademicDraftVerifier } from "../src/db/academic-draft-verifier.mjs";

if (process.env.CORNHILL_DB_TARGET !== "isolated-test" ||
    process.env.CORNHILL_ALLOW_ISOLATED_TEST_MIGRATIONS !== "true") {
  throw new Error("Refusing academic draft acceptance outside a disposable CI database");
}
const target = readIsolatedTestDatabaseTarget(process.env);
const config = readLocalDatabaseConfig(process.env);
if (!target || !/^cornhill_isolated_test_[0-9a-f]{32}$/.test(config.database) ||
    config.host !== "127.0.0.1" || config.port === 5432) {
  throw new Error("Not an approved local isolated PostgreSQL service");
}

const { Pool } = await import("pg");
const pool = new Pool({...config,max:1,application_name:"cornhill-v21-isolated-draft-smoke"});
let client, inTransaction=false, roleAssumed=false;
try {
  client = await pool.connect();
  const identity = await client.query(
    "SELECT current_database() AS database, inet_server_addr()::text AS server_address, " +
    "inet_server_port() AS port, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier, " +
    "current_setting('data_directory') AS data_directory, " +
    "current_setting('server_version_num') AS pg_version"
  );
  assert.equal(identity.rowCount,1);
  // Only boolean field diagnoses; never echo paths, cluster fingerprints or passwords.
  const actual = identity.rows[0];
  const preflightFields = {
    database: actual.database === target.database,
    tcp_port: Number(actual.port) === target.serverPort,
    system_id: String(actual.system_identifier) === target.systemIdentifier,
    data_directory: String(actual.data_directory) === String(target.dataDirectory),
    server_address_present: typeof actual.server_address === "string" && actual.server_address.length > 0
  };
  for (const [key,ok] of Object.entries(preflightFields)) {
    if (!ok) console.error("ISOLATED_PREFLIGHT_FIELD_FAILED=" + key);
  }
  assertIsolatedPostgresServerIdentity(actual,target);
  assert.match(String(identity.rows[0].pg_version),/^17[0-9]{4}$/);
  await client.query("BEGIN");
  inTransaction=true;
  await client.query("SET LOCAL statement_timeout='10000ms'");
  const checks=await client.query(
    "SELECT " +
    "EXISTS (SELECT 1 FROM information_schema.columns " +
      "WHERE table_schema='cornhill_school' AND table_name='learner_marks' " +
      "AND column_name='offline_sync_revision' AND data_type='bigint') AS has_revision, " +
    "EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='cornhill_school.learner_marks'::regclass " +
      "AND tgname='learner_mark_offline_revision_guard' AND NOT tgisinternal) AS has_trigger, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.learner_marks'," +
      "'offline_sync_revision','SELECT') AS scoped_read"
  );
  assert.equal(checks.rows[0]?.has_revision,true);
  assert.equal(checks.rows[0]?.has_trigger,true);
  assert.equal(checks.rows[0]?.scoped_read,true);

  await client.query(
    "CREATE TEMP TABLE cornhill_v21_revision_fixture (" +
    "id integer PRIMARY KEY, score numeric NOT NULL, " +
    "offline_sync_revision bigint NOT NULL DEFAULT 1) ON COMMIT DROP"
  );
  await client.query(
    "CREATE TRIGGER cornhill_v21_revision_fixture_trigger BEFORE INSERT OR UPDATE " +
    "ON cornhill_v21_revision_fixture FOR EACH ROW " +
    "EXECUTE FUNCTION cornhill_school.bump_learner_mark_offline_revision()"
  );
  const inserted=await client.query(
    "INSERT INTO cornhill_v21_revision_fixture (id,score,offline_sync_revision) " +
    "VALUES (1,75,999) RETURNING offline_sync_revision"
  );
  assert.equal(inserted.rows[0]?.offline_sync_revision,"1");
  const first=await client.query(
    "UPDATE cornhill_v21_revision_fixture SET score=80,offline_sync_revision=888 " +
    "WHERE id=1 RETURNING offline_sync_revision"
  );
  assert.equal(first.rows[0]?.offline_sync_revision,"2");
  const second=await client.query(
    "UPDATE cornhill_v21_revision_fixture SET score=85 WHERE id=1 " +
    "RETURNING offline_sync_revision"
  );
  assert.equal(second.rows[0]?.offline_sync_revision,"3");
  await client.query("ROLLBACK");
  inTransaction=false;

  // A restricted caller must be able to execute exactly the read-only
  // source mapping lookup without any learner, payment or mark data input.
  await client.query("SET ROLE cornhill_auth_runtime");
  roleAssumed=true;
  const role=await client.query("SELECT current_user AS role");
  assert.equal(role.rows[0]?.role,"cornhill_auth_runtime");
  const verifier=createPostgresAcademicDraftVerifier({
    pool:{async connect(){return {
      query:(sql,params)=>client.query(sql,params),
      release(){}
    }}},
    fingerprintSecret:"isolated-only-test-fingerprint-do-not-use-on-real-records"
  });
  const absent=await verifier.verifyDraftSourceMapping({
    learnerSourceId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
    assessmentSourceId:"ffffffff-ffff-4fff-8fff-ffffffffffff",
    subjectSourceId:"ffffffff-ffff-4fff-8fff-ffffffffffff"
  });
  assert.equal(absent,null);
  await client.query("RESET ROLE");
  roleAssumed=false;
  console.log("CORNHILL_V21_ISOLATED_REVISION_TRIGGER=PASS");
  console.log("CORNHILL_V21_RESTRICTED_READ_ONLY_SOURCE_LOOKUP=PASS");
  console.log("DATABASE=isolated-test");
  console.log("SCHOOL_DATA_WRITES=0");
  console.log("LIVE_SYNC_ENABLED=false");
} finally {
  if(client){
    if(inTransaction) {try{await client.query("ROLLBACK")}catch{}}
    if(roleAssumed){try{await client.query("RESET ROLE")}catch{}}
    client.release();
  }
  await pool.end();
}
