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

  const permissionCatalog = await pool.query(
    "SELECT permission_code FROM cornhill_auth.permission_catalog ORDER BY permission_code"
  );
  if (permissionCatalog.rows.length !== 50) {
    throw new Error(
      `Expected 50 catalogued permission codes; found ${permissionCatalog.rows.length}: ${permissionCatalog.rows.map(row => row.permission_code).join(", ")}`
    );
  }

  const activeDirectors = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.staff_accounts a " +
    "JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = a.id " +
    "WHERE ra.role_code = 'director' AND a.account_status = 'active'"
  );
  if (activeDirectors.rows[0]?.count > 1) {
    throw new Error("Only one active Director account is permitted.");
  }
  const roleGrants = await pool.query(
    "SELECT rp.role_code, count(*)::int AS count, " +
    "count(*) FILTER (WHERE rp.role_code <> 'director' AND " +
    "(grantor.id IS NULL OR grantor.account_status <> 'active' OR director_role.staff_account_id IS NULL " +
    "OR rp.permission_code IN ('system.roles_manage','system.backups_manage')))::int AS invalid_delegated " +
    "FROM cornhill_auth.staff_role_permissions rp " +
    "LEFT JOIN cornhill_auth.staff_accounts grantor ON grantor.id = rp.granted_by_staff_id " +
    "LEFT JOIN cornhill_auth.staff_role_assignments director_role " +
    "ON director_role.staff_account_id = grantor.id AND director_role.role_code = 'director' " +
    "GROUP BY rp.role_code ORDER BY rp.role_code"
  );
  const directorGrant = roleGrants.rows.find(row => row.role_code === 'director');
  const delegatedGrants = roleGrants.rows.filter(row => row.role_code !== 'director');
  if (activeDirectors.rows[0]?.count === 0 && roleGrants.rows.length > 0) {
    throw new Error("Role grants exist without an active Director account.");
  }
  if (activeDirectors.rows[0]?.count === 1 &&
      directorGrant?.count !== permissionCatalog.rows.length) {
    throw new Error("The initial Director must retain the complete protected permission catalogue.");
  }
  if (delegatedGrants.some(row => row.invalid_delegated > 0)) {
    throw new Error("Delegated role permissions must be granted by an active Director and exclude Director-reserved capabilities.");
  }
  const staffAdminFunctions = await pool.query(
    "SELECT p.proname, p.prosecdef, p.proconfig, " +
    "has_function_privilege('cornhill_auth_runtime', p.oid, 'EXECUTE') AS runtime_execute " +
    "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
    "WHERE n.nspname = 'cornhill_auth' AND p.proname IN " +
    "('assert_director_role_manager','set_staff_role_permissions','create_staff_account')"
  );
  const adminFunctions = new Map(staffAdminFunctions.rows.map(row => [row.proname, row]));
  for (const functionName of ['assert_director_role_manager','set_staff_role_permissions','create_staff_account']) {
    const row = adminFunctions.get(functionName);
    if (!row || row.prosecdef !== true ||
        !Array.isArray(row.proconfig) ||
        !row.proconfig.some(setting => setting.startsWith('search_path='))) {
      throw new Error("Director staff administration security function is missing SECURITY DEFINER or a fixed search_path: " + functionName);
    }
  }
  if (adminFunctions.get('set_staff_role_permissions')?.runtime_execute !== true ||
      adminFunctions.get('create_staff_account')?.runtime_execute !== true ||
      adminFunctions.get('assert_director_role_manager')?.runtime_execute !== false) {
    throw new Error("Director administration function EXECUTE grants are not least-privilege.");
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

  console.log("PostgreSQL schema verified: 11 tables, 17 roles, 50 permission codes, Director-controlled role grants, protected account functions, rate-limit indexes and no PUBLIC schema access.");
} finally {
  await pool.end();
}
