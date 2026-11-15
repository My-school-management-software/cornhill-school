import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";

export async function getDirectorBootstrapStatus(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required.");
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM cornhill_auth.staff_role_assignments
       WHERE role_code = 'director') AS director_assignments,
      (SELECT count(*)::int FROM cornhill_auth.staff_accounts a
       JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = a.id
       WHERE ra.role_code = 'director' AND a.account_status = 'active') AS active_directors,
      (SELECT count(*)::int FROM cornhill_auth.staff_role_permissions) AS all_role_grants,
      (SELECT count(*)::int FROM cornhill_auth.staff_role_permissions
       WHERE role_code = 'director') AS director_grants,
      (SELECT count(*)::int FROM cornhill_auth.permission_catalog) AS permission_count
  `);
  const row = result.rows[0] ?? {};
  const assignments = Number(row.director_assignments ?? 0);
  const active = Number(row.active_directors ?? 0);
  const allGrants = Number(row.all_role_grants ?? 0);
  const directorGrants = Number(row.director_grants ?? 0);
  const permissions = Number(row.permission_count ?? 0);
  if (assignments === 0 && active === 0 && allGrants === 0 && permissions > 0) {
    return Object.freeze({ status: "READY", activeDirectors: active, permissionCount: permissions });
  }
  if (assignments === 1 && active === 1 && directorGrants === permissions &&
      permissions > 0 && allGrants >= directorGrants) {
    return Object.freeze({ status: "CONFIGURED", activeDirectors: active, permissionCount: permissions });
  }
  return Object.freeze({
    status: "REVIEW_REQUIRED", activeDirectors: active, permissionCount: permissions
  });
}

export async function runDirectorBootstrapStatus() {
  const pool = new Pool(readLocalDatabaseConfig(process.env));
  try {
    const result = await getDirectorBootstrapStatus(pool);
    console.log(result.status);
    console.log("Active Director accounts: " + result.activeDirectors);
    console.log("Permission catalogue entries: " + result.permissionCount);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDirectorBootstrapStatus().catch(error => {
    console.error("Could not verify Director setup: " + error.message);
    process.exitCode = 1;
  });
}
