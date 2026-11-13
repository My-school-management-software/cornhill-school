import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";
import {
  assertMigrationLedgerRow,
  migrationChecksum,
  MIGRATION_LOCK_ID,
  prepareTransactionalMigration
} from "../src/db/migrations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_NAME = "001_local_identity_foundation";
const MIGRATION_PATH = resolve(ROOT, "migrations/001_local_identity_foundation.sql");

async function run() {
  if (process.env.CORNHILL_ALLOW_LOCAL_MIGRATIONS !== "true" ||
      process.env.CORNHILL_DB_TARGET !== "local-development") {
    throw new Error("Refusing migration: explicitly set CORNHILL_ALLOW_LOCAL_MIGRATIONS=true and CORNHILL_DB_TARGET=local-development.");
  }

  const config = readLocalDatabaseConfig();
  const { Pool } = await import("pg");
  const pool = new Pool(config);
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    const identity = await client.query(
      "SELECT current_database() AS database, inet_server_addr()::text AS server_address"
    );
    const serverAddress = identity.rows[0]?.server_address;
    if (identity.rows[0]?.database !== "cornhill_local" ||
        !["127.0.0.1", "::1"].includes(serverAddress)) {
      throw new Error("Connected database is not the expected isolated loopback development database.");
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

    const source = await readFile(MIGRATION_PATH, "utf8");
    const checksum = migrationChecksum(source);
    const prior = await client.query(
      "SELECT migration_name, checksum FROM cornhill_meta.schema_migrations WHERE migration_name = $1",
      [MIGRATION_NAME]
    );

    if (prior.rowCount > 0) {
      assertMigrationLedgerRow(prior.rows[0], checksum, MIGRATION_NAME);
      console.log("CORNHILL local identity migration is already applied; no changes made.");
      return;
    }

    const sql = prepareTransactionalMigration(source);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO cornhill_meta.schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [MIGRATION_NAME, checksum]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log("CORNHILL local identity migration applied successfully.");
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
