function assertUuid(value, label) {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError(label + " must be a UUID.");
  }
}

function assertHash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(label + " must be a SHA-256 hex digest.");
  }
}

function assertPool(pool) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required.");
  }
}

async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original database error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresAuthRepositories(pool) {
  assertPool(pool);

  const accountRepository = Object.freeze({
    async findStaffByUsername(normalizedUsername) {
      if (typeof normalizedUsername !== "string" || normalizedUsername.length < 3 || normalizedUsername.length > 120) {
        return null;
      }
      const result = await pool.query(`
        SELECT
          a.id,
          a.username,
          a.password_hash AS "passwordHash",
          a.account_status AS "accountStatus",
          COALESCE((
            SELECT array_agg(ra.role_code ORDER BY ra.role_code)
            FROM cornhill_auth.staff_role_assignments ra
            WHERE ra.staff_account_id = a.id
          ), ARRAY[]::text[]) AS roles,
          COALESCE((
            SELECT jsonb_object_agg(grants.role_code, grants.permissions)
            FROM (
              SELECT ra.role_code,
                COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code)
                  FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::text[]) AS permissions
              FROM cornhill_auth.staff_role_assignments ra
              LEFT JOIN cornhill_auth.staff_role_permissions rp
                ON rp.role_code = ra.role_code
              WHERE ra.staff_account_id = a.id
              GROUP BY ra.role_code
            ) grants
          ), '{}'::jsonb) AS "rolePermissions",
          COALESCE((
            SELECT array_agg(ca.class_id::text ORDER BY ca.class_id::text)
            FROM cornhill_auth.staff_class_assignments ca
            WHERE ca.staff_account_id = a.id AND ca.is_active = true
          ), ARRAY[]::text[]) AS "classIds"
        FROM cornhill_auth.staff_accounts a
        WHERE a.username_normalized = $1
        LIMIT 1
      `, [normalizedUsername]);
      return result.rows[0] ?? null;
    },

    async findGuardianByPhone(phoneE164) {
      if (typeof phoneE164 !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(phoneE164)) {
        return null;
      }
      const result = await pool.query(`
        SELECT
          id,
          guardian_name AS "displayName",
          pin_hash AS "pinHash",
          account_status AS "accountStatus"
        FROM cornhill_auth.guardian_accounts
        WHERE phone_e164 = $1
        LIMIT 1
      `, [phoneE164]);
      return result.rows[0] ?? null;
    }
  });

  const loginAttemptStore = Object.freeze({
    async beginAttempt({
      principalType,
      identifierFingerprint,
      sourceFingerprint = null,
      attemptedAt = new Date(),
      windowMs,
      maxFailedAttempts
    }) {
      if (!["staff", "guardian"].includes(principalType)) throw new TypeError("Invalid principal type.");
      assertHash(identifierFingerprint, "Identifier fingerprint");
      if (sourceFingerprint !== null) assertHash(sourceFingerprint, "Source fingerprint");
      if (!(attemptedAt instanceof Date) || !Number.isFinite(attemptedAt.getTime())) {
        throw new TypeError("Attempt timestamp is invalid.");
      }
      if (!Number.isInteger(windowMs) || windowMs < 60_000 ||
          !Number.isInteger(maxFailedAttempts) || maxFailedAttempts < 1) {
        throw new TypeError("Rate-limit settings are invalid.");
      }

      return withTransaction(pool, async client => {
        // Acquire identifier and source locks in deterministic order. This
        // serialises concurrent attempts against both rate-limit dimensions.
        const lockKeys = [
          "identifier:" + principalType + ":" + identifierFingerprint,
          ...(sourceFingerprint ? ["source:" + principalType + ":" + sourceFingerprint] : [])
        ].sort();

        for (const lockKey of lockKeys) {
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
        }

        const cutoff = new Date(attemptedAt.getTime() - windowMs);
        const count = await client.query(`
          SELECT count(*)::int AS failures
          FROM cornhill_auth.login_attempts
          WHERE principal_type = $1
            AND succeeded = false
            AND attempted_at >= $4
            AND (
              identifier_fingerprint = $2
              OR ($3::varchar IS NOT NULL AND source_fingerprint = $3)
            )
        `, [principalType, identifierFingerprint, sourceFingerprint, cutoff]);

        if (Number(count.rows[0]?.failures ?? 0) >= maxFailedAttempts) {
          return { allowed: false, attemptId: null };
        }

        const inserted = await client.query(`
          INSERT INTO cornhill_auth.login_attempts
            (principal_type, identifier_fingerprint, source_fingerprint, succeeded, attempted_at)
          VALUES ($1, $2, $3, false, $4)
          RETURNING id::text AS id
        `, [principalType, identifierFingerprint, sourceFingerprint, attemptedAt]);

        return { allowed: true, attemptId: inserted.rows[0].id };
      });
    },

    async completeAttempt({ attemptId, succeeded, attemptedAt = new Date() }) {
      if (!/^\d+$/.test(String(attemptId)) || typeof succeeded !== "boolean") {
        throw new TypeError("Attempt completion input is invalid.");
      }
      if (!(attemptedAt instanceof Date) || !Number.isFinite(attemptedAt.getTime())) {
        throw new TypeError("Attempt completion timestamp is invalid.");
      }
      const result = await pool.query(`
        UPDATE cornhill_auth.login_attempts
        SET succeeded = $2
        WHERE id = $1::bigint AND succeeded = false
        RETURNING id
      `, [String(attemptId), succeeded]);
      return result.rowCount === 1;
    }
  });

  const sessionRepository = Object.freeze({
    async createAuthenticatedSession({
      principalType,
      accountId,
      tokenHash,
      csrfTokenHash,
      createdAt,
      expiresAt,
      correlationId,
      loginAttemptId
    }) {
      if (!["staff", "guardian"].includes(principalType)) throw new TypeError("Invalid principal type.");
      if (!/^\d+$/.test(String(loginAttemptId))) throw new TypeError("Login attempt ID is invalid.");
      assertUuid(accountId, "Account ID");
      assertHash(tokenHash, "Session token hash");
      assertHash(csrfTokenHash, "CSRF token hash");
      assertUuid(correlationId, "Correlation ID");
      if (!(createdAt instanceof Date) || !(expiresAt instanceof Date) ||
          !Number.isFinite(createdAt.getTime()) || !Number.isFinite(expiresAt.getTime()) ||
          expiresAt <= createdAt) {
        throw new TypeError("Session timestamps are invalid.");
      }

      return withTransaction(pool, async client => {
        const accountTable = principalType === "staff" ? "staff_accounts" : "guardian_accounts";
        const accountIdColumn = principalType === "staff" ? "staff_account_id" : "guardian_account_id";
        const account = await client.query(
          `SELECT id FROM cornhill_auth.${accountTable} WHERE id = $1 AND account_status = 'active' FOR UPDATE`,
          [accountId]
        );
        if (account.rowCount !== 1) throw new Error("Active authentication account was not found.");

        await client.query(
          `UPDATE cornhill_auth.${accountTable} SET last_login_at = $2, updated_at = $2 WHERE id = $1`,
          [accountId, createdAt]
        );

        const attemptUpdate = await client.query(`
          UPDATE cornhill_auth.login_attempts
          SET succeeded = true
          WHERE id = $1::bigint
            AND principal_type = $2
            AND succeeded = false
          RETURNING id
        `, [String(loginAttemptId), principalType]);
        if (attemptUpdate.rowCount !== 1) {
          throw new Error("The login attempt could not be finalised.");
        }

        const inserted = await client.query(`
          INSERT INTO cornhill_auth.auth_sessions
            (principal_type, ${accountIdColumn}, token_hash, csrf_token_hash, created_at, last_seen_at, expires_at)
          VALUES ($1, $2, $3, $4, $5, $5, $6)
          RETURNING id
        `, [principalType, accountId, tokenHash, csrfTokenHash, createdAt, expiresAt]);

        await client.query(`
          INSERT INTO cornhill_auth.security_audit_events
            (actor_type, actor_id, event_code, outcome, correlation_id, details)
          VALUES ($1, $2, 'authentication.login_succeeded', 'success', $3, '{}'::jsonb)
        `, [principalType, accountId, correlationId]);

        return inserted.rows[0].id;
      });
    },

    async findActiveSessionByTokenHash(tokenHash) {
      assertHash(tokenHash, "Session token hash");
      const result = await pool.query(`
        SELECT
          s.id,
          s.principal_type AS "principalType",
          s.staff_account_id AS "staffAccountId",
          s.guardian_account_id AS "guardianAccountId",
          s.token_hash AS "tokenHash",
          s.csrf_token_hash AS "csrfTokenHash",
          s.created_at AS "createdAt",
          s.expires_at AS "expiresAt",
          s.revoked_at AS "revokedAt",
          COALESCE(sa.account_status, ga.account_status) AS "accountStatus",
          sa.username,
          COALESCE(sa.username, ga.guardian_name) AS "displayName",
          COALESCE((
            SELECT array_agg(ra.role_code ORDER BY ra.role_code)
            FROM cornhill_auth.staff_role_assignments ra
            WHERE ra.staff_account_id = sa.id
          ), ARRAY[]::text[]) AS roles,
          COALESCE((
            SELECT jsonb_object_agg(grants.role_code, grants.permissions)
            FROM (
              SELECT ra.role_code,
                COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code)
                  FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::text[]) AS permissions
              FROM cornhill_auth.staff_role_assignments ra
              LEFT JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code = ra.role_code
              WHERE ra.staff_account_id = sa.id
              GROUP BY ra.role_code
            ) grants
          ), '{}'::jsonb) AS "rolePermissions",
          COALESCE((
            SELECT array_agg(ca.class_id::text ORDER BY ca.class_id::text)
            FROM cornhill_auth.staff_class_assignments ca
            WHERE ca.staff_account_id = sa.id AND ca.is_active = true
          ), ARRAY[]::text[]) AS "classIds"
        FROM cornhill_auth.auth_sessions s
        LEFT JOIN cornhill_auth.staff_accounts sa ON sa.id = s.staff_account_id
        LEFT JOIN cornhill_auth.guardian_accounts ga ON ga.id = s.guardian_account_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
        LIMIT 1
      `, [tokenHash]);
      return result.rows[0] ?? null;
    },

    async revokeSessionByTokenHash(tokenHash, revokedAt = new Date()) {
      assertHash(tokenHash, "Session token hash");
      if (!(revokedAt instanceof Date) || !Number.isFinite(revokedAt.getTime())) {
        throw new TypeError("Session revocation timestamp is invalid.");
      }
      const result = await pool.query(`
        UPDATE cornhill_auth.auth_sessions
        SET revoked_at = $2
        WHERE token_hash = $1 AND revoked_at IS NULL
        RETURNING id
      `, [tokenHash, revokedAt]);
      return result.rowCount === 1;
    }
  });

  const permissionRepository = Object.freeze({
    async getGrantedPermissionsForStaff({ staffAccountId }) {
      if (typeof staffAccountId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffAccountId)) {
        return [];
      }
      const result = await pool.query(`
        SELECT DISTINCT rp.permission_code AS "permissionCode"
        FROM cornhill_auth.staff_accounts a
        JOIN cornhill_auth.staff_role_assignments ra ON ra.staff_account_id = a.id
        JOIN cornhill_auth.staff_role_permissions rp ON rp.role_code = ra.role_code
        WHERE a.id = $1 AND a.account_status = 'active'
        ORDER BY rp.permission_code
      `, [staffAccountId]);
      return result.rows.map(row => row.permissionCode);
    }
  });

  const classAccessRepository = Object.freeze({
    async hasActiveClassAssignment({ staffAccountId, classId }) {
      if (typeof staffAccountId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staffAccountId) ||
          typeof classId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId)) {
        return false;
      }
      const result = await pool.query(`
        SELECT 1
        FROM cornhill_auth.staff_class_assignments ca
        JOIN cornhill_auth.staff_accounts a ON a.id = ca.staff_account_id
        WHERE ca.staff_account_id = $1
          AND ca.class_id = $2
          AND ca.is_active = true
          AND a.account_status = 'active'
        LIMIT 1
      `, [staffAccountId, classId]);
      return result.rowCount === 1;
    }
  });

  const guardianAccessRepository = Object.freeze({
    async hasApprovedLearnerAccess({ guardianAccountId, learnerId }) {
      if (typeof guardianAccountId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guardianAccountId) ||
          typeof learnerId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(learnerId)) {
        return false;
      }
      const result = await pool.query(`
        SELECT 1
        FROM cornhill_auth.guardian_learner_access gla
        JOIN cornhill_auth.guardian_accounts ga ON ga.id = gla.guardian_account_id
        WHERE gla.guardian_account_id = $1
          AND gla.learner_id = $2
          AND gla.access_status = 'approved'
          AND ga.account_status = 'active'
        LIMIT 1
      `, [guardianAccountId, learnerId]);
      return result.rowCount === 1;
    }
  });

  const auditRepository = Object.freeze({
    async recordAuthenticationEvent({
      principalType,
      eventCode,
      outcome,
      identifierFingerprint = null,
      correlationId
    }) {
      if (!["staff", "guardian"].includes(principalType) ||
          typeof eventCode !== "string" || eventCode.length < 1 || eventCode.length > 100 ||
          !["success", "denied", "failure"].includes(outcome)) {
        throw new TypeError("Authentication audit event is invalid.");
      }
      assertUuid(correlationId, "Correlation ID");
      if (identifierFingerprint !== null) assertHash(identifierFingerprint, "Identifier fingerprint");

      await pool.query(`
        INSERT INTO cornhill_auth.security_audit_events
          (actor_type, event_code, outcome, correlation_id, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `, [
        principalType,
        eventCode,
        outcome,
        correlationId,
        JSON.stringify(identifierFingerprint ? { identifierFingerprint } : {})
      ]);
    }
  });

  return Object.freeze({
    accountRepository,
    loginAttemptStore,
    sessionRepository,
    permissionRepository,
    classAccessRepository,
    guardianAccessRepository,
    auditRepository
  });
}