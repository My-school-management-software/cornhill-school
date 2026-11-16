function assertPool(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL query pool is required.");
  }
}

export function createPostgresSchoolCatalogRepository(pool) {
  assertPool(pool);
  return Object.freeze({
    async listActiveClassesAndSubjects() {
      const result = await pool.query(
        "SELECT c.id::text AS id, c.class_code AS \"classCode\", " +
        "c.display_name AS \"displayName\", c.section, " +
        "c.level_order AS \"levelOrder\", c.stream, " +
        "COALESCE(jsonb_agg(jsonb_build_object(" +
        "'id', s.id::text, 'subjectCode', s.subject_code, " +
        "'subjectName', s.subject_name, 'subjectGroup', s.subject_group, " +
        "'displayOrder', cs.display_order, 'compulsory', cs.is_compulsory" +
        ") ORDER BY cs.display_order, s.subject_name) FILTER (WHERE s.id IS NOT NULL), " +
        "'[]'::jsonb) AS subjects " +
        "FROM cornhill_school.classes c " +
        "LEFT JOIN cornhill_school.class_subjects cs " +
        "ON cs.class_id = c.id AND cs.is_active = true " +
        "LEFT JOIN cornhill_school.subjects s " +
        "ON s.id = cs.subject_id AND s.is_active = true " +
        "WHERE c.is_active = true GROUP BY c.id " +
        "ORDER BY c.level_order, c.stream, c.display_name"
      );
      return result.rows.map(row => ({
        id: row.id,
        classCode: row.classCode,
        displayName: row.displayName,
        section: row.section,
        levelOrder: row.levelOrder,
        stream: row.stream,
        subjects: Array.isArray(row.subjects) ? row.subjects : []
      }));
    },

    async listLearners({ classId = null, search = null } = {}) {
      const result = await pool.query(
        "SELECT l.id::text AS id, l.pupil_code AS \"pupilCode\", l.lin, " +
        "l.first_name AS \"firstName\", l.middle_name AS \"middleName\", " +
        "l.last_name AS \"lastName\", l.gender, l.date_of_birth AS \"dateOfBirth\", l.p7_index_number AS \"p7IndexNumber\", " +
        "l.class_id::text AS \"classId\", c.display_name AS \"className\", " +
        "l.admission_date AS \"admissionDate\", l.status " +
        "FROM cornhill_school.learners l " +
        "LEFT JOIN cornhill_school.classes c ON c.id = l.class_id " +
        "WHERE l.status <> 'Archived' " +
        "AND ($1::uuid IS NULL OR l.class_id = $1::uuid) " +
        "AND ($2::text IS NULL OR l.pupil_code = $2 OR l.lin = $2 " +
        "OR lower(concat_ws(' ', l.first_name, l.middle_name, l.last_name)) LIKE '%' || lower($2) || '%') " +
        "ORDER BY l.last_name, l.first_name, l.pupil_code LIMIT 500",
        [classId, search]
      );
      return result.rows;
    }
  });
}
