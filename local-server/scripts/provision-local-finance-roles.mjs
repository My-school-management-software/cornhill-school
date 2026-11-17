import { readIsolatedTestDatabaseTarget, readLocalDatabaseConfig } from "../src/db/config.mjs";
import { assertIsolatedDatabaseIdentity } from "../src/db/migrations.mjs";
const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());
try {
  const isolatedTarget = readIsolatedTestDatabaseTarget();
  if (isolatedTarget) {
    if (process.env.CORNHILL_ALLOW_ISOLATED_TEST_MIGRATIONS !== "true") {
      throw new Error("Refusing isolated-test role provisioning without explicit CI test authorization.");
    }
    const identity = await pool.query(`
      SELECT current_database() AS database,
             inet_server_addr()::text AS server_address,
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
    assertIsolatedDatabaseIdentity(identity.rows[0], isolatedTarget);
    console.log("Isolated PostgreSQL test target and empty database verified before role provisioning.");
  }

  // The Docker PostgreSQL service runs this one-off bootstrap as its admin user.
  // All application runtime groups remain NOLOGIN and strictly unprivileged.
  await pool.query(`
    DO $roles$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cornhill_auth_runtime') THEN
        CREATE ROLE cornhill_auth_runtime NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cornhill_auth_api') THEN
        CREATE ROLE cornhill_auth_api NOLOGIN INHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cornhill_finance_runtime') THEN
        CREATE ROLE cornhill_finance_runtime NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cornhill_finance_api') THEN
        CREATE ROLE cornhill_finance_api NOLOGIN INHERIT;
      END IF;
    END
    $roles$;
    ALTER ROLE cornhill_auth_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ALTER ROLE cornhill_auth_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ALTER ROLE cornhill_finance_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ALTER ROLE cornhill_finance_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT cornhill_auth_runtime TO cornhill_auth_api;
    GRANT cornhill_finance_runtime TO cornhill_finance_api;
  `);
  console.log("Temporary CI authentication and finance role groups provisioned; every runtime role remains NOLOGIN.");
} finally {
  await pool.end();
}
