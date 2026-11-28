import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readIsolatedTestDatabaseTarget, readLocalDatabaseConfig } from "../src/db/config.mjs";
import {
  assertIsolatedDatabaseIdentity,
  assertIsolatedPostgresServerIdentity,
  assertMigrationLedgerRow,
  assertMigrationManifestCompatible,
  migrationChecksum,
  MIGRATION_LOCK_ID,
  prepareTransactionalMigration,
  sortMigrationFiles
} from "../src/db/migrations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = resolve(ROOT, "migrations");

async function run() {
  const isolatedTestTarget = process.env.CORNHILL_DB_TARGET === "isolated-test";
  if (isolatedTestTarget) {
    if (process.env.CORNHILL_ALLOW_ISOLATED_TEST_MIGRATIONS !== "true") {
      throw new Error("Refusing isolated-test migration without CORNHILL_ALLOW_ISOLATED_TEST_MIGRATIONS=true.");
    }
  } else if (process.env.CORNHILL_ALLOW_LOCAL_MIGRATIONS !== "true" ||
      process.env.CORNHILL_DB_TARGET !== "local-development") {
    throw new Error("Refusing migration: explicitly set CORNHILL_ALLOW_LOCAL_MIGRATIONS=true and CORNHILL_DB_TARGET=local-development.");
  }

  const config = readLocalDatabaseConfig();
  const expectedIsolatedTarget = readIsolatedTestDatabaseTarget();
  const migrationFiles = sortMigrationFiles(await readdir(MIGRATIONS_DIR));
  if (migrationFiles.length === 0) {
    throw new Error("No valid local SQL migrations were found.");
  }
  const { Pool } = await import("pg");
  const pool = new Pool(config);
  const client = await pool.connect();
  let isolatedDatabaseIsEmpty = null;

  try {
    if (expectedIsolatedTarget) {
      const identity = await client.query(`
        SELECT current_database() AS database,
               host(inet_server_addr()) AS server_address,
               current_setting('port')::integer AS port,
               current_setting('data_directory') AS data_directory,
               (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
               (SELECT count(*)::integer
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
                   AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                   AND n.nspname NOT LIKE 'pg_toast%') AS user_object_count
      `);
      assertIsolatedPostgresServerIdentity(identity.rows[0], expectedIsolatedTarget);
      if (Number(identity.rows[0]?.user_object_count) === 0) {
        assertIsolatedDatabaseIdentity(identity.rows[0], expectedIsolatedTarget);
        isolatedDatabaseIsEmpty = true;
        console.log("Isolated PostgreSQL test target and empty database verified before migration writes.");
      } else {
        isolatedDatabaseIsEmpty = false;
        const ledger = await client.query(`
          SELECT to_regclass('cornhill_meta.schema_migrations') IS NOT NULL AS exists
        `);
        if (ledger.rows[0]?.exists !== true) {
          throw new Error("Refusing isolated-test migration: the named test database is not empty and has no migration ledger.");
        }
      }
    } else {
      const identity = await client.query("SELECT current_database() AS database");
      if (identity.rows[0]?.database !== "cornhill_local") {
        throw new Error("Connected database is not the expected isolated local development database.");
      }
    }

    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);

    // READ-ONLY fail-closed lineage preflight, before CREATE SCHEMA or any DDL.
    // Some CORNHILL Windows machines already contain a distinct 140-migration
    // lineage. This candidate has 100 migrations and reuses versions 096–100
    // for unrelated features. Never treat equal version numbers as equivalent.
    const ledgerExists = await client.query(
      "SELECT to_regclass('cornhill_meta.schema_migrations') IS NOT NULL AS exists"
    );
    if (ledgerExists.rows[0]?.exists === true) {
      const applied = await client.query(
        "SELECT migration_name, checksum FROM cornhill_meta.schema_migrations ORDER BY migration_name"
      );
      const sourceDigests = new Map();
      for (const filename of migrationFiles) {
        const name = basename(filename, ".sql");
        const contents = await readFile(resolve(MIGRATIONS_DIR, filename), "utf8");
        sourceDigests.set(name, migrationChecksum(contents));
      }
      assertMigrationManifestCompatible(sourceDigests, applied.rows);
      console.log("Read-only migration lineage preflight verified " +
        applied.rowCount + " applied source identities before any schema writes.");
    }

    if (expectedIsolatedTarget && isolatedDatabaseIsEmpty === false) {
      const ledger = await client.query(
        "SELECT migration_name, checksum FROM cornhill_meta.schema_migrations ORDER BY migration_name"
      );
      if (ledger.rowCount !== migrationFiles.length) {
        throw new Error("Refusing isolated-test migration: a non-empty database must already contain the complete migration ledger.");
      }
      const entries = new Map(ledger.rows.map(row => [row.migration_name, row]));
      for (const fileName of migrationFiles) {
        const migrationName = basename(fileName, ".sql");
        const source = await readFile(resolve(MIGRATIONS_DIR, fileName), "utf8");
        assertMigrationLedgerRow(entries.get(migrationName), migrationChecksum(source), migrationName);
      }
      console.log(`Existing isolated-test migration ledger contains all ${migrationFiles.length} expected checksums; no migration changes were made.`);
      return;
    }

    await client.query("CREATE SCHEMA IF NOT EXISTS cornhill_meta");
    await client.query("REVOKE ALL ON SCHEMA cornhill_meta FROM PUBLIC");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cornhill_meta.schema_migrations (
        migration_name text PRIMARY KEY,
        checksum varchar(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    let appliedCount = 0;
    for (const fileName of migrationFiles) {
      const migrationName = basename(fileName, ".sql");
      const source = await readFile(resolve(MIGRATIONS_DIR, fileName), "utf8");
      const checksum = migrationChecksum(source);
      const prior = await client.query(
        "SELECT migration_name, checksum FROM cornhill_meta.schema_migrations WHERE migration_name = $1",
        [migrationName]
      );

      if (prior.rowCount > 0) {
        assertMigrationLedgerRow(prior.rows[0], checksum, migrationName);
        console.log("Already applied; checksum verified:", migrationName);
        continue;
      }

      const sql = prepareTransactionalMigration(source);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO cornhill_meta.schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [migrationName, checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      appliedCount += 1;
      console.log("Applied local migration:", migrationName);
    }

    console.log(appliedCount === 0
      ? "CORNHILL local database is already up to date."
      : `CORNHILL local database updated; ${appliedCount} migration(s) applied.`);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

run().catch(error => {
  console.error("Local database migration stopped:", error.message);
  process.exitCode = 1;
});
