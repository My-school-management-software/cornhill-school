import { readLocalDatabaseConfig } from "../src/db/config.mjs";
const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());
try {
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
