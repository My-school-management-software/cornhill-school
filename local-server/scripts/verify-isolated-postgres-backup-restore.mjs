import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIsolatedTestDatabaseTarget, readLocalDatabaseConfig } from "../src/db/config.mjs";
import {
  assertIsolatedDatabaseIdentity,
  assertIsolatedPostgresServerIdentity
} from "../src/db/migrations.mjs";

const EXPECTED_MIGRATION_COUNT = 94;

function quoteIdentifier(value) {
  if (!/^cornhill_isolated_test_[a-f0-9]{32}$/.test(value)) {
    throw new Error("Refusing an invalid isolated restore database name.");
  }
  return `"${value}"`;
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", error => reject(new Error(`${command} could not start: ${error.message}`)));
    child.once("close", code => {
      if (code !== 0) {
        reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim() || "no diagnostic output"}`));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function verifyToolVersion(command, env) {
  const { stdout } = await runCommand(command, ["--version"], env);
  if (!/PostgreSQL\) 17(?:\.|\s)/.test(stdout)) {
    throw new Error(`${command} must be a PostgreSQL 17 client tool.`);
  }
}

async function readIdentity(pool) {
  const result = await pool.query(`
    SELECT current_database() AS database,
           inet_server_addr()::text AS server_address,
           current_setting('port')::integer AS port,
           current_setting('data_directory') AS data_directory,
           (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
           (SELECT count(*)::integer
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p')
               AND n.nspname NOT IN ('pg_catalog', 'information_schema')
               AND n.nspname NOT LIKE 'pg_toast%') AS user_table_count
  `);
  return result.rows[0];
}

async function readSnapshot(pool, fixtureId, config, pgDump, toolEnv) {
  const tables = await pool.query(`
    SELECT table_schema, table_name, table_type
      FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_schema NOT LIKE 'pg_toast%'
     ORDER BY table_schema, table_name, table_type
  `);
  const ledger = await pool.query(`
    SELECT count(*)::integer AS count,
           COALESCE(string_agg(migration_name || ':' || checksum, E'\\n' ORDER BY migration_name), '') AS signature
      FROM cornhill_meta.schema_migrations
  `);
  const fixture = await pool.query(
    "SELECT count(*)::integer AS count FROM cornhill_auth.staff_accounts WHERE id = $1::uuid",
    [fixtureId]
  );
  const { stdout: schemaSql } = await runCommand(pgDump, [
    "--no-password", "--schema-only", "--no-owner", "--no-acl",
    "--host", config.host, "--port", String(config.port),
    "--username", config.user, "--dbname", config.database
  ], toolEnv);
  return {
    tables: tables.rows,
    schemaSha256: createHash("sha256").update(schemaSql, "utf8").digest("hex"),
    migrationCount: ledger.rows[0].count,
    migrationSignature: ledger.rows[0].signature,
    syntheticStaffAccountCount: fixture.rows[0].count
  };
}

async function run() {
  const target = readIsolatedTestDatabaseTarget();
  if (!target) {
    throw new Error("Backup/restore verification requires CORNHILL_DB_TARGET=isolated-test.");
  }

  const config = readLocalDatabaseConfig();
  const pgDump = process.env.CORNHILL_PG_DUMP_PATH ?? "pg_dump";
  const pgRestore = process.env.CORNHILL_PG_RESTORE_PATH ?? "pg_restore";
  const toolEnv = { ...process.env, PGPASSWORD: config.password };
  await verifyToolVersion(pgDump, toolEnv);
  await verifyToolVersion(pgRestore, toolEnv);

  const { Pool } = await import("pg");
  const sourcePool = new Pool(config);
  const restoreDatabase = `cornhill_isolated_test_${randomUUID().replaceAll("-", "")}`;
  const fixtureId = randomUUID();
  const fixtureUsername = `ci_backup_${randomBytes(12).toString("hex")}`;
  const dumpPath = join(tmpdir(), `cornhill-isolated-backup-${randomUUID()}.dump`);
  let ownsDumpFile = false;
  let restorePool;

  try {
    const sourceIdentity = await readIdentity(sourcePool);
    assertIsolatedPostgresServerIdentity(sourceIdentity, target);

    const existingRestore = await sourcePool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [restoreDatabase]
    );
    assert.equal(existingRestore.rowCount, 0, "The generated restore database name must be unused.");
    await sourcePool.query(`CREATE DATABASE ${quoteIdentifier(restoreDatabase)}`);

    restorePool = new Pool({ ...config, database: restoreDatabase });
    const restoreIdentity = await readIdentity(restorePool);
    assertIsolatedDatabaseIdentity(restoreIdentity, { ...target, database: restoreDatabase });

    await sourcePool.query(`
      INSERT INTO cornhill_auth.staff_accounts
        (id, username, username_normalized, password_hash, account_status, must_change_password)
      VALUES ($1::uuid, $2, $2, '$argon2id$ci-backup-placeholder', 'active', true)
    `, [fixtureId, fixtureUsername]);

    const { stdout: dumpVersion } = await runCommand(pgDump, ["--version"], toolEnv);
    const { stdout: restoreVersion } = await runCommand(pgRestore, ["--version"], toolEnv);
    const dumpArgs = [
      "--no-password", "--format=custom", "--host", config.host,
      "--port", String(config.port), "--username", config.user,
      "--dbname", config.database, "--file", dumpPath
    ];
    await writeFile(dumpPath, Buffer.alloc(0), { flag: "wx" });
    ownsDumpFile = true;
    await runCommand(pgDump, dumpArgs, toolEnv);

    const restoreArgs = [
      "--no-password", "--exit-on-error", "--host", config.host,
      "--port", String(config.port), "--username", config.user,
      "--dbname", restoreDatabase, dumpPath
    ];
    await runCommand(pgRestore, restoreArgs, toolEnv);

    const [sourceSnapshot, restoreSnapshot] = await Promise.all([
      readSnapshot(sourcePool, fixtureId, config, pgDump, toolEnv),
      readSnapshot(restorePool, fixtureId, { ...config, database: restoreDatabase }, pgDump, toolEnv)
    ]);
    assert.equal(sourceSnapshot.migrationCount, EXPECTED_MIGRATION_COUNT);
    assert.equal(restoreSnapshot.migrationCount, EXPECTED_MIGRATION_COUNT);
    assert.equal(sourceSnapshot.syntheticStaffAccountCount, 1);
    assert.equal(restoreSnapshot.syntheticStaffAccountCount, 1);
    assert.deepEqual(restoreSnapshot, sourceSnapshot);

    console.log(`PostgreSQL backup and restore verified with ${dumpVersion} / ${restoreVersion}.`);
    console.log(`Restored ${sourceSnapshot.tables.length} schema objects, ${sourceSnapshot.migrationCount} migration ledger entries, and one synthetic staff-account fixture.`);
    console.log(`Schema fingerprint: ${sourceSnapshot.schemaSha256}. Source and restored schema, migration checksums and synthetic fixture counts match.`);
  } finally {
    if (restorePool) await restorePool.end();
    await sourcePool.end();
    if (ownsDumpFile) {
      try {
        await access(dumpPath);
        await unlink(dumpPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
}

run().catch(error => {
  console.error("Isolated PostgreSQL backup/restore verification failed:", error.message);
  process.exitCode = 1;
});
