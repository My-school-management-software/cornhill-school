const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const ROLE_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

export function createPostgresStaffAdministrationRepository(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required.");
  return Object.freeze({
    async getAdministrationWorkspace() {
      const [roles, permissions, grants, staff] = await Promise.all([
        pool.query(
          "SELECT role_code AS \"roleCode\", display_name AS \"displayName\" " +
          "FROM cornhill_auth.staff_roles WHERE is_assignable = true AND role_code <> 'director' " +
          "ORDER BY display_name"
        ),
        pool.query(
          "SELECT permission_code AS \"permissionCode\", category, description, high_risk AS \"highRisk\" " +
          "FROM cornhill_auth.permission_catalog ORDER BY category, permission_code"
        ),
        pool.query(
          "SELECT role_code AS \"roleCode\", permission_code AS \"permissionCode\" " +
          "FROM cornhill_auth.staff_role_permissions WHERE role_code <> 'director' " +
          "ORDER BY role_code, permission_code"
        ),
        pool.query(
          "SELECT a.id::text AS id, a.username, a.account_status AS \"accountStatus\", " +
          "sp.staff_number AS \"staffNumber\", sp.legal_name AS \"legalName\", " +
          "sp.job_title AS \"jobTitle\", sp.employment_status AS \"employmentStatus\", " +
          "COALESCE(array_agg(ra.role_code ORDER BY ra.role_code) FILTER (WHERE ra.role_code IS NOT NULL), ARRAY[]::text[]) AS roles " +
          "FROM cornhill_auth.staff_accounts a " +
          "LEFT JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id = a.id " +
          "LEFT JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = a.id " +
          "GROUP BY a.id, a.username, a.account_status, sp.staff_number, sp.legal_name, sp.job_title, sp.employment_status " +
          "ORDER BY sp.staff_number NULLS LAST, a.username LIMIT 500"
        )
      ]);
      return {
        roles: roles.rows,
        permissions: permissions.rows,
        grants: grants.rows,
        staff: staff.rows
      };
    },

    async setRolePermissions({ actorStaffId, roleCode, permissionCodes }) {
      if (!ROLE_PATTERN.test(roleCode) || roleCode === "director" ||
          !Array.isArray(permissionCodes) || permissionCodes.length > 50) {
        throw new TypeError("Role permission update is invalid.");
      }
      const result = await pool.query(
        "SELECT cornhill_auth.set_staff_role_permissions($1::uuid, $2::text, $3::text[]) AS result",
        [actorStaffId, roleCode, permissionCodes]
      );
      return result.rows[0]?.result ?? null;
    },

    async createStaffAccount(input) {
      if (!USERNAME_PATTERN.test(input.username)) throw new TypeError("Username is invalid.");
      const result = await pool.query(
        "SELECT cornhill_auth.create_staff_account(" +
        "$1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::text,$12::date" +
        ") AS result",
        [
          input.actorStaffId, input.username, input.email, input.passwordHash,
          input.staffNumber, input.legalName, input.preferredName, input.jobTitle,
          input.department, input.phoneE164, input.roleCode, input.hiredOn
        ]
      );
      return result.rows[0]?.result ?? null;
    }
  });
}
