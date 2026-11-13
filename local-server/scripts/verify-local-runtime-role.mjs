import assert from "node:assert/strict";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());

try {
  const roles = await pool.query(`
    SELECT
      r.rolname,
      r.rolcanlogin,
      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('cornhill_auth_runtime', 'cornhill_auth_api')
    ORDER BY r.rolname
  `);
  assert.equal(roles.rows.length, 2, "Both dedicated authentication roles must exist.");
  for (const role of roles.rows) {
    assert.equal(role.rolcanlogin, false, role.rolname + " must remain NOLOGIN until a private password is set.");
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolcreatedb, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolreplication, false);
    assert.equal(role.rolbypassrls, false);
  }

  const membership = await pool.query(`
    SELECT pg_has_role('cornhill_auth_api', 'cornhill_auth_runtime', 'MEMBER') AS member
  `);
  assert.equal(membership.rows[0]?.member, true);

  const checks = await pool.query(`
    SELECT
      has_schema_privilege('cornhill_auth_api', 'cornhill_auth', 'USAGE') AS schema_usage,
      has_schema_privilege('cornhill_auth_api', 'cornhill_auth', 'CREATE') AS schema_create,
      has_database_privilege('cornhill_auth_api', current_database(), 'CONNECT') AS db_connect,
      has_database_privilege('cornhill_auth_api', current_database(), 'TEMP') AS db_temp,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.staff_accounts', 'password_hash', 'SELECT') AS staff_hash_read,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.staff_accounts', 'last_login_at', 'UPDATE') AS staff_last_login_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.staff_accounts', 'account_status', 'UPDATE') AS staff_status_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.guardian_accounts', 'pin_hash', 'SELECT') AS guardian_pin_read,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.auth_sessions', 'token_hash', 'INSERT') AS session_insert,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.auth_sessions', 'revoked_at', 'UPDATE') AS session_revoke,
      has_table_privilege('cornhill_auth_api', 'cornhill_auth.auth_sessions', 'DELETE') AS session_delete,
      has_table_privilege('cornhill_auth_api', 'cornhill_auth.staff_role_permissions', 'INSERT') AS permission_grant_insert,
      has_table_privilege('cornhill_auth_api', 'cornhill_auth.guardian_learner_access', 'UPDATE') AS guardian_link_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.login_attempts', 'succeeded', 'UPDATE') AS attempt_complete,
      has_column_privilege('cornhill_auth_api', 'cornhill_auth.security_audit_events', 'event_code', 'INSERT') AS audit_insert,
      has_table_privilege('cornhill_auth_api', 'cornhill_auth.security_audit_events', 'SELECT') AS audit_read,
      has_sequence_privilege('cornhill_auth_api', 'cornhill_auth.security_audit_events_id_seq', 'USAGE') AS audit_sequence_usage
  `);

  const result = checks.rows[0];
  assert.equal(result.schema_usage, true);
  assert.equal(result.schema_create, false);
  assert.equal(result.db_connect, true);
  assert.equal(result.db_temp, false);
  assert.equal(result.staff_hash_read, true);
  assert.equal(result.staff_last_login_update, true);
  assert.equal(result.staff_status_update, false);
  assert.equal(result.guardian_pin_read, true);
  assert.equal(result.session_insert, true);
  assert.equal(result.session_revoke, true);
  assert.equal(result.session_delete, false);
  assert.equal(result.permission_grant_insert, false);
  assert.equal(result.guardian_link_update, false);
  assert.equal(result.attempt_complete, true);
  assert.equal(result.audit_insert, true);
  assert.equal(result.audit_read, false);
  assert.equal(result.audit_sequence_usage, true);

  console.log("Authentication database role verified: NOLOGIN, non-privileged, scoped column grants and no permission/guardian-link administration.");
} finally {
  await pool.end();
}