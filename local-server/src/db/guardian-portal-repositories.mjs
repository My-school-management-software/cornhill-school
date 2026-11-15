const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPostgresGuardianPortalRepository(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL query pool is required.");
  }

  return Object.freeze({
    async listApprovedLearners(guardianAccountId) {
      if (typeof guardianAccountId !== "string" || !UUID_PATTERN.test(guardianAccountId)) {
        throw new TypeError("A valid guardian account UUID is required.");
      }
      const result = await pool.query(`
        SELECT
          l.id AS "learnerId",
          l.pupil_code AS "pupilCode",
          l.lin,
          l.first_name AS "firstName",
          l.middle_name AS "middleName",
          l.last_name AS "lastName",
          l.date_of_birth AS "dateOfBirth",
          l.admission_date AS "admissionDate",
          l.learner_type AS "learnerType",
          l.status,
          c.display_name AS "className",
          c.stream
        FROM cornhill_auth.guardian_learner_access access
        INNER JOIN cornhill_school.learners l
          ON l.id = access.learner_id
        LEFT JOIN cornhill_school.classes c
          ON c.id = l.class_id
        WHERE access.guardian_account_id = $1::uuid
          AND access.access_status = 'approved'
          AND access.approved_at IS NOT NULL
          AND access.revoked_at IS NULL
          AND l.status <> 'Archived'
        ORDER BY l.last_name, l.first_name, l.pupil_code
      `, [guardianAccountId]);
      return result.rows.map(row => Object.freeze({
        learnerId: row.learnerId,
        pupilCode: row.pupilCode,
        lin: row.lin,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        admissionDate: row.admissionDate,
        learnerType: row.learnerType,
        status: row.status,
        className: row.className,
        stream: row.stream
      }));
    }
  });
}
