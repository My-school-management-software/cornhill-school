const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPostgresGuardianPortalRepository(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL query pool is required.");
  }

  return Object.freeze({
    async verifyRegisteredLearnerGuardian(pupilCode, phoneE164) {
      if (typeof pupilCode !== "string" || !/^[A-Za-z0-9-]{3,30}$/.test(pupilCode) ||
          typeof phoneE164 !== "string" || !/^\+256[0-9]{9}$/.test(phoneE164)) {
        throw new TypeError("A learner code and registered Ugandan phone number are required.");
      }
      const result = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM cornhill_school.guardian_contacts gc " +
        "JOIN cornhill_school.learners l ON l.id=gc.learner_id " +
        "WHERE upper(l.pupil_code)=upper($1::text) AND gc.phone_e164=$2::text " +
        "AND gc.is_active=true AND l.status<>'Archived') AS matched",
        [pupilCode, phoneE164]
      );
      return result.rows[0]?.matched === true;
    },

    async listApprovedLearners(guardianAccountId, pupilCode) {
      if (typeof guardianAccountId !== "string" || !UUID_PATTERN.test(guardianAccountId)) {
        throw new TypeError("A valid guardian account UUID is required.");
      }
      if (typeof pupilCode !== "string" || !/^[A-Za-z0-9-]{3,30}$/.test(pupilCode)) {
        throw new TypeError("The learner's permanent code is required.");
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
          AND upper(l.pupil_code) = upper($2::text)
          AND access.access_status = 'approved'
          AND access.approved_at IS NOT NULL
          AND access.revoked_at IS NULL
          AND l.status <> 'Archived'
        ORDER BY l.last_name, l.first_name, l.pupil_code
      `, [guardianAccountId, pupilCode]);
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
