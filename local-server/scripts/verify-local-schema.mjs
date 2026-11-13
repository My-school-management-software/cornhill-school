import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());

try {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'cornhill_auth' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const expected = [
    "auth_sessions",
    "guardian_accounts",
    "guardian_learner_access",
    "login_attempts",
    "permission_catalog",
    "security_audit_events",
    "staff_accounts",
    "staff_class_assignments",
    "staff_role_assignments",
    "staff_role_permissions",
    "staff_roles"
  ];
  const actual = tables.rows.map(row => row.table_name);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Local identity and authorization schema table list does not match the expected eleven tables.");
  }

  const roles = await pool.query("SELECT count(*)::int AS count FROM cornhill_auth.staff_roles");
  if (roles.rows[0]?.count !== 17) {
    throw new Error("Expected 17 seeded staff roles.");
  }

  const permissionCount = await pool.query("SELECT count(*)::int AS count FROM cornhill_auth.permission_catalog");
  if (permissionCount.rows[0]?.count !== 19) {
    throw new Error("Expected 19 catalogued permission codes.");
  }

  const roleGrants = await pool.query("SELECT count(*)::int AS count FROM cornhill_auth.staff_role_permissions");
  if (roleGrants.rows[0]?.count !== 0) {
    throw new Error("Role permissions must remain empty until the school approves a permission matrix.");
  }

  const publicAccess = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'cornhill_auth'
        AND a.grantee = 0
        AND a.privilege_type IN ('USAGE', 'CREATE')
    ) AS public_access
  `);
  if (publicAccess.rows[0]?.public_access !== false) {
    throw new Error("PUBLIC unexpectedly has access to the cornhill_auth schema.");
  }

  const rateLimitIndexes = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'cornhill_auth'
      AND indexname IN (
        'login_attempts_identifier_failures_idx',
        'login_attempts_source_failures_idx'
      )
    ORDER BY indexname
  `);
  if (rateLimitIndexes.rows.length !== 2) {
    throw new Error("Expected both identifier and source rate-limit indexes.");
  }

  const constraints = await pool.query(`
    SELECT count(*)::int AS count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'cornhill_auth'
  `);
  if (constraints.rows[0]?.count < 35) {
    throw new Error("Expected identity and authorization constraints were not installed.");
  }

  console.log("PostgreSQL schema verified: 11 tables, 17 roles, 19 permission codes, 0 role grants, rate-limit indexes, no PUBLIC schema access.");
} finally {
  await pool.end();
}
