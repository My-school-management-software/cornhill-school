export async function bootstrapDirectorAccount({ pool, passwordHasher, username, email = null, legalName, staffNumber, password, hiredOn = new Date().toISOString().slice(0, 10) } = {}) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL pool is required.");
  if (!passwordHasher || typeof passwordHasher.hash !== "function" ||
      typeof passwordHasher.isArgon2idHash !== "function") throw new TypeError("An Argon2id password hasher is required.");
  if (typeof username !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(username)) {
    throw new TypeError("Username must contain 3 to 64 permitted characters.");
  }
  if (typeof legalName !== "string" || legalName.trim().length < 2 || legalName.trim().length > 160) {
    throw new TypeError("Director legal name is invalid.");
  }
  if (typeof staffNumber !== "string" || !/^[A-Z0-9_-]{2,30}$/.test(staffNumber)) {
    throw new TypeError("Director staff number is invalid.");
  }
  if (typeof password !== "string" || password.length < 14 || password.length > 128 ||
      Buffer.byteLength(password, "utf8") > 1024 || password.toLowerCase().includes(username.toLowerCase())) {
    throw new TypeError("Choose a 14-to-128-character password that does not contain the username.");
  }
  if (email !== null && (typeof email !== "string" || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new TypeError("Director email is invalid.");
  }
  const parsedHireDate = typeof hiredOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(hiredOn)
    ? new Date(hiredOn + "T00:00:00Z") : null;
  if (!parsedHireDate || !Number.isFinite(parsedHireDate.getTime()) ||
      parsedHireDate.toISOString().slice(0, 10) !== hiredOn) {
    throw new TypeError("Director hire date is invalid.");
  }

  const passwordHash = await passwordHasher.hash(password);
  if (!passwordHasher.isArgon2idHash(passwordHash)) {
    throw new Error("The password hash does not meet the configured Argon2id policy.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE cornhill_auth.staff_role_permissions IN EXCLUSIVE MODE");
    const role = await client.query(
      "SELECT role_code FROM cornhill_auth.staff_roles WHERE role_code = 'director' AND is_assignable = true FOR UPDATE"
    );
    if (role.rowCount !== 1) throw new Error("The Director role is missing or not assignable.");

    const directorAssignments = await client.query(
      "SELECT count(*)::int AS count FROM cornhill_auth.staff_role_assignments WHERE role_code = 'director'"
    );
    if (directorAssignments.rows[0]?.count !== 0) {
      throw new Error("A Director role assignment already exists. The one-time bootstrap is disabled.");
    }
    const existingGrants = await client.query(
      "SELECT count(*)::int AS count FROM cornhill_auth.staff_role_permissions"
    );
    if (existingGrants.rows[0]?.count !== 0) {
      throw new Error("Role permissions already exist. Bootstrap will not overwrite the existing permission matrix.");
    }

    const permissions = await client.query(
      "SELECT permission_code FROM cornhill_auth.permission_catalog ORDER BY permission_code"
    );
    const permissionCodes = permissions.rows.map(row => row.permission_code);
    if (!permissionCodes.includes("system.roles_manage") ||
        !permissionCodes.includes("system.backups_manage") ||
        permissionCodes.length < 10) {
      throw new Error("The permission catalogue is incomplete. Apply the database migrations before bootstrapping.");
    }

    const emailValue = email ? email.trim().toLowerCase() : null;
    const account = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts " +
      "(username, username_normalized, email, email_normalized, password_hash, account_status, must_change_password, password_changed_at) " +
      "VALUES ($1, lower($1), $2, $3, $4, 'active', false, now()) RETURNING id::text AS id, username",
      [username.trim(), emailValue, emailValue, passwordHash]
    );
    const staffId = account.rows[0].id;

    await client.query(
      "INSERT INTO cornhill_school.staff_profiles " +
      "(staff_account_id, staff_number, legal_name, job_title, department, employment_status, hired_on) " +
      "VALUES ($1::uuid, $2, $3, 'Director', 'Leadership', 'Active', $4::date)",
      [staffId, staffNumber.trim(), legalName.trim(), hiredOn]
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code, assigned_by) " +
      "VALUES ($1::uuid, 'director', $1::uuid)",
      [staffId]
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_permissions (role_code, permission_code, granted_by_staff_id) " +
      "SELECT 'director', permission_code, $1::uuid FROM cornhill_auth.permission_catalog",
      [staffId]
    );
    await client.query(
      "INSERT INTO cornhill_auth.security_audit_events " +
      "(actor_type, actor_id, event_code, target_type, target_id, outcome, details) " +
      "VALUES ('staff', $1::uuid, 'security.director_bootstrap_completed', 'staff_account', $1::uuid, 'success', " +
      "jsonb_build_object('username', $2, 'staffNumber', $3, 'roleCode', 'director', 'initialPermissionCount', $4))",
      [staffId, username.trim(), staffNumber.trim(), permissionCodes.length]
    );
    await client.query("COMMIT");
    return Object.freeze({
      staffAccountId: staffId,
      username: account.rows[0].username,
      staffNumber: staffNumber.trim(),
      roleCode: "director",
      permissionCount: permissionCodes.length
    });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
