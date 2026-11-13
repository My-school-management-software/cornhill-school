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
    "security_audit_events",
    "staff_accounts",
    "staff_role_assignments",
    "staff_roles"
  ];
  const actual = tables.rows.map(row => row.table_name);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Identity schema table list does not match the expected eight tables.");
  }

  const roles = await pool.query("SELECT count(*)::int AS count FROM cornhill_auth.staff_roles");
  if (roles.rows[0]?.count !== 17) {
    throw new Error("Expected 17 seeded staff roles.");
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

  const constraints = await pool.query(`
    SELECT count(*)::int AS count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'cornhill_auth'
  `);
  if (constraints.rows[0]?.count < 20) {
    throw new Error("Expected identity constraints were not installed.");
  }

  console.log("PostgreSQL identity schema verified: 8 tables, 17 roles, no PUBLIC schema access.");
} finally {
  await pool.end();
}
