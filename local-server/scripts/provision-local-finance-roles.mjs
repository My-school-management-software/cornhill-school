import { readLocalDatabaseConfig } from "../src/db/config.mjs";
const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());
try {
  await pool.query(`
    DO $roles$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cornhill_finance_runtime') THEN
        CREATE ROLE cornhill_finance_runtime NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='cornhill_finance_api') THEN
        CREATE ROLE cornhill_finance_api NOLOGIN INHERIT;
      END IF;
    END
    $roles$;
    ALTER ROLE cornhill_finance_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ALTER ROLE cornhill_finance_api NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT cornhill_finance_runtime TO cornhill_finance_api;
  `);
  console.log("Temporary CI finance roles provisioned and kept NOLOGIN.");
} finally {
  await pool.end();
}
