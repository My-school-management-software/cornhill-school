import assert from "node:assert/strict";
import { readLocalDatabaseConfig } from "../src/db/config.mjs";
import { readLocalRuntimeDatabaseConfig } from "../src/db/runtime-config.mjs";

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
  const runtimePassword = process.env.CORNHILL_DB_RUNTIME_PASSWORD ?? "";
  const expectsLogin = Buffer.byteLength(runtimePassword, "utf8") >= 32 && !runtimePassword.startsWith("REPLACE_WITH_");
  for (const role of roles.rows) {
    const shouldLogin = role.rolname === "cornhill_auth_api" && expectsLogin;
    assert.equal(role.rolcanlogin, shouldLogin, role.rolname === "cornhill_auth_runtime" ? "cornhill_auth_runtime must remain NOLOGIN." : "cornhill_auth_api LOGIN state must match private runtime-password provisioning.");
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

  if (expectsLogin) {
    const { Pool: RuntimePool } = await import("pg");
    const runtimePool = new RuntimePool(readLocalRuntimeDatabaseConfig());
    try {
      const identity = await runtimePool.query("SELECT current_user AS database_user, current_database() AS database_name");
      assert.equal(identity.rows[0]?.database_user, "cornhill_auth_api");
      assert.equal(identity.rows[0]?.database_name, "cornhill_local");
      const lockProbe = await runtimePool.query(
        "SELECT count(*)::integer AS row_count FROM cornhill_school.lock_active_guardian_contact_for_access($1::uuid)",
        ["00000000-0000-0000-0000-000000000001"]
      );
      assert.equal(lockProbe.rows[0]?.row_count, 0, "Guardian lock function must be callable by the runtime role.");
    } finally {
      await runtimePool.end();
    }
  }

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
      has_function_privilege('cornhill_auth_api', 'cornhill_school.lock_active_guardian_contact_for_access(uuid)', 'EXECUTE') AS guardian_contact_lock_execute,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.guardian_contacts', 'is_active', 'UPDATE') AS guardian_contact_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.learners', 'status', 'UPDATE') AS guardian_learner_update,
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
  assert.equal(result.guardian_contact_lock_execute, true);
  assert.equal(result.guardian_contact_update, false);
  assert.equal(result.guardian_learner_update, false);

  const leaveReviewGrant = await pool.query(`
    SELECT
      has_column_privilege('cornhill_auth_api', 'cornhill_school.staff_leave_requests', 'status', 'UPDATE') AS status_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.staff_leave_requests', 'reviewed_by_staff_id', 'UPDATE') AS reviewer_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.staff_leave_requests', 'review_note', 'UPDATE') AS note_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.staff_leave_requests', 'reason', 'UPDATE') AS request_reason_update,
      has_table_privilege('cornhill_auth_api', 'cornhill_school.staff_leave_requests', 'DELETE') AS request_delete
  `);
  assert.equal(leaveReviewGrant.rows[0]?.status_update, true);
  assert.equal(leaveReviewGrant.rows[0]?.reviewer_update, true);
  assert.equal(leaveReviewGrant.rows[0]?.note_update, true);
  assert.equal(leaveReviewGrant.rows[0]?.request_reason_update, false);
  assert.equal(leaveReviewGrant.rows[0]?.request_delete, false);

  const staffActionGrants = await pool.query(`
    SELECT
      has_column_privilege('cornhill_auth_api', 'cornhill_school.attendance_day_review_events', 'attendance_day_id', 'INSERT') AS attendance_review_insert,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.attendance_day_review_events', 'review_status', 'INSERT') AS attendance_review_status_insert,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.attendance_day_review_events', 'review_status', 'UPDATE') AS attendance_review_update,
      has_table_privilege('cornhill_auth_api', 'cornhill_school.attendance_day_review_events', 'DELETE') AS attendance_review_delete,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.payroll_disbursements', 'amount_ugx', 'INSERT') AS payroll_amount_insert,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.payroll_disbursements', 'recorded_by_staff_id', 'INSERT') AS payroll_actor_insert,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.payroll_disbursements', 'disbursement_status', 'UPDATE') AS payroll_status_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.payroll_disbursements', 'verified_by_staff_id', 'UPDATE') AS payroll_verifier_update,
      has_column_privilege('cornhill_auth_api', 'cornhill_school.payroll_disbursements', 'amount_ugx', 'UPDATE') AS payroll_amount_update,
      has_table_privilege('cornhill_auth_api', 'cornhill_school.payroll_disbursements', 'DELETE') AS payroll_delete
  `);
  assert.equal(staffActionGrants.rows[0]?.attendance_review_insert, true);
  assert.equal(staffActionGrants.rows[0]?.attendance_review_status_insert, true);
  assert.equal(staffActionGrants.rows[0]?.attendance_review_update, false);
  assert.equal(staffActionGrants.rows[0]?.attendance_review_delete, false);
  assert.equal(staffActionGrants.rows[0]?.payroll_amount_insert, true);
  assert.equal(staffActionGrants.rows[0]?.payroll_actor_insert, true);
  assert.equal(staffActionGrants.rows[0]?.payroll_status_update, true);
  assert.equal(staffActionGrants.rows[0]?.payroll_verifier_update, true);
  assert.equal(staffActionGrants.rows[0]?.payroll_amount_update, false);
  assert.equal(staffActionGrants.rows[0]?.payroll_delete, false);

  console.log("Authentication database role verified: restricted runtime group is NOLOGIN; API login is enabled only with a private runtime password; least-privilege grants verified.");
} finally {
  await pool.end();
}