const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(label + " must be a valid local UUID.");
  }
}
function conflict(message) {
  const error = new Error(message);
  error.code = "CORNHILL_ACADEMIC_CONFLICT";
  return error;
}
function assessmentShape(row) {
  return {
    id: row.id,
    classId: row.classId,
    classCode: row.classCode,
    className: row.className,
    academicTermId: row.academicTermId,
    termNumber: row.termNumber,
    termName: row.termName,
    academicYear: row.academicYear,
    assessmentName: row.assessmentName,
    assessmentType: row.assessmentType,
    assessmentDate: row.assessmentDate,
    maxScore: Number(row.maxScore),
    status: row.status,
    lockedAt: row.lockedAt,
    publishedAt: row.publishedAt,
    effectiveDate: row.effectiveDate
  };
}

export function createPostgresAcademicsRepository(pool) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required.");
  }

  async function getAssessment(assessmentId) {
    assertUuid(assessmentId, "Assessment ID");
    const result = await pool.query(
      "SELECT a.id::text AS id, a.class_id::text AS \"classId\", " +
      "c.class_code AS \"classCode\", c.display_name AS \"className\", " +
      "a.academic_term_id::text AS \"academicTermId\", t.term_number AS \"termNumber\", " +
      "t.term_name AS \"termName\", y.year_label AS \"academicYear\", " +
      "a.assessment_name AS \"assessmentName\", a.assessment_type AS \"assessmentType\", " +
      "a.assessment_date::text AS \"assessmentDate\", a.max_score::text AS \"maxScore\", " +
      "a.status, a.locked_at AS \"lockedAt\", a.published_at AS \"publishedAt\", " +
      "COALESCE(a.assessment_date, a.created_at::date)::text AS \"effectiveDate\" " +
      "FROM cornhill_school.assessments a " +
      "JOIN cornhill_school.classes c ON c.id = a.class_id " +
      "JOIN cornhill_school.academic_terms t ON t.id = a.academic_term_id " +
      "JOIN cornhill_school.academic_years y ON y.id = t.academic_year_id " +
      "WHERE a.id = $1::uuid",
      [assessmentId]
    );
    return result.rows[0] ? assessmentShape(result.rows[0]) : null;
  }

  return Object.freeze({
    getAssessment,

    async listWorkspace({ classIds = null, classId = null } = {}) {
      if (classIds !== null && (!Array.isArray(classIds) || classIds.some(id => !UUID_PATTERN.test(id)))) {
        throw new TypeError("Class access scope is invalid.");
      }
      if (classId !== null) assertUuid(classId, "Class ID");

      const classesResult = await pool.query(
        "SELECT c.id::text AS id, c.class_code AS \"classCode\", c.display_name AS \"displayName\", " +
        "c.section, c.level_order AS \"levelOrder\", c.stream, " +
        "COALESCE(jsonb_agg(jsonb_build_object('id', s.id::text, 'subjectCode', s.subject_code, " +
        "'subjectName', s.subject_name, 'displayOrder', cs.display_order) " +
        "ORDER BY cs.display_order) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS subjects " +
        "FROM cornhill_school.classes c " +
        "LEFT JOIN cornhill_school.class_subjects cs ON cs.class_id = c.id AND cs.is_active = true " +
        "LEFT JOIN cornhill_school.subjects s ON s.id = cs.subject_id AND s.is_active = true " +
        "WHERE c.is_active = true " +
        "AND ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[])) " +
        "AND ($2::uuid IS NULL OR c.id = $2::uuid) " +
        "GROUP BY c.id ORDER BY c.level_order, c.stream, c.display_name",
        [classIds, classId]
      );

      const yearsResult = await pool.query(
        "SELECT id::text AS id, year_label AS \"yearLabel\", starts_on::text AS \"startsOn\", " +
        "ends_on::text AS \"endsOn\", status " +
        "FROM cornhill_school.academic_years WHERE status <> 'Archived' " +
        "ORDER BY starts_on DESC LIMIT 30"
      );

      const termsResult = await pool.query(
        "SELECT t.id::text AS id, t.term_number AS \"termNumber\", t.term_name AS \"termName\", " +
        "t.starts_on::text AS \"startsOn\", t.ends_on::text AS \"endsOn\", t.status, " +
        "y.id::text AS \"academicYearId\", y.year_label AS \"academicYear\", y.status AS \"yearStatus\" " +
        "FROM cornhill_school.academic_terms t " +
        "JOIN cornhill_school.academic_years y ON y.id = t.academic_year_id " +
        "WHERE t.status <> 'Archived' AND y.status <> 'Archived' " +
        "ORDER BY (t.status = 'Active') DESC, y.starts_on DESC, t.term_number"
      );

      const assessmentsResult = await pool.query(
        "SELECT a.id::text AS id, a.class_id::text AS \"classId\", c.class_code AS \"classCode\", " +
        "c.display_name AS \"className\", a.academic_term_id::text AS \"academicTermId\", " +
        "t.term_number AS \"termNumber\", t.term_name AS \"termName\", y.year_label AS \"academicYear\", " +
        "a.assessment_name AS \"assessmentName\", a.assessment_type AS \"assessmentType\", " +
        "a.assessment_date::text AS \"assessmentDate\", a.max_score::text AS \"maxScore\", " +
        "a.status, a.locked_at AS \"lockedAt\", a.published_at AS \"publishedAt\" " +
        "FROM cornhill_school.assessments a " +
        "JOIN cornhill_school.classes c ON c.id = a.class_id " +
        "JOIN cornhill_school.academic_terms t ON t.id = a.academic_term_id " +
        "JOIN cornhill_school.academic_years y ON y.id = t.academic_year_id " +
        "WHERE ($1::uuid[] IS NULL OR c.id = ANY($1::uuid[])) " +
        "AND ($2::uuid IS NULL OR c.id = $2::uuid) " +
        "ORDER BY t.starts_on DESC, a.created_at DESC LIMIT 500",
        [classIds, classId]
      );

      return {
        years: yearsResult.rows,
        classes: classesResult.rows.map(row => ({
          id: row.id, classCode: row.classCode, displayName: row.displayName,
          section: row.section, levelOrder: row.levelOrder, stream: row.stream,
          subjects: Array.isArray(row.subjects) ? row.subjects : []
        })),
        terms: termsResult.rows,
        assessments: assessmentsResult.rows.map(assessmentShape)
      };
    },

    async listYearAdvancementCandidates({ classId, academicTermId }) {
      assertUuid(classId, "Source class ID");
      assertUuid(academicTermId, "New-year Term 1 ID");
      const period = await pool.query(
        "SELECT t.id::text AS \"termId\", t.term_name AS \"termName\", " +
        "t.term_number AS \"termNumber\", t.status AS \"termStatus\", " +
        "y.id::text AS \"yearId\", y.year_label AS \"yearLabel\", " +
        "y.starts_on::text AS \"yearStart\", y.status AS \"yearStatus\", " +
        "c.id::text AS \"classId\", c.class_code AS \"classCode\", " +
        "c.display_name AS \"className\", c.level_order AS \"classLevel\", " +
        "next_class.id::text AS \"nextClassId\", next_class.display_name AS \"nextClassName\" " +
        "FROM cornhill_school.academic_terms t " +
        "JOIN cornhill_school.academic_years y ON y.id=t.academic_year_id " +
        "CROSS JOIN cornhill_school.classes c " +
        "LEFT JOIN cornhill_school.classes next_class " +
        "ON next_class.level_order=c.level_order+1 AND next_class.is_active=true " +
        "WHERE t.id=$1::uuid AND c.id=$2::uuid AND c.is_active=true AND t.term_number=1",
        [academicTermId, classId]
      );
      const details = period.rows[0];
      if (!details) throw conflict("Choose Term 1 of an academic year and an active class.");
      const result = await pool.query(
        "SELECT l.id::text AS id, l.pupil_code AS \"pupilCode\", l.lin, " +
        "concat_ws(' ',l.first_name,l.middle_name,l.last_name) AS \"learnerName\", " +
        "ep.admission_date::text AS \"enrolledFrom\" " +
        "FROM cornhill_school.enrolment_periods ep " +
        "JOIN cornhill_school.learners l ON l.id=ep.learner_id " +
        "WHERE ep.class_id=$1::uuid AND l.class_id=$1::uuid " +
        "AND ep.status='Active' AND l.status='Active' " +
        "AND ep.admission_date<$2::date " +
        "ORDER BY l.last_name,l.first_name,l.pupil_code LIMIT 1000",
        [classId, details.yearStart]
      );
      const advanced = await pool.query(
        "SELECT count(*)::int AS count FROM cornhill_school.enrolment_periods ep " +
        "JOIN cornhill_school.learners l ON l.id=ep.learner_id " +
        "WHERE ep.class_id=$1::uuid AND ep.status='Active' " +
        "AND l.status='Active' AND l.class_id=$1::uuid " +
        "AND ep.admission_date>=$2::date",
        [classId, details.yearStart]
      );
      return {
        ...details, candidates: result.rows,
        newYearClassCount: Number(advanced.rows[0]?.count ?? 0),
        canApprove: details.yearStatus === "Active" && details.termStatus === "Active"
      };
    },

    async recordYearAdvancementBatch({ staffId, fromClassId, academicTermId, decisions }) {
      assertUuid(staffId, "Staff ID");
      assertUuid(fromClassId, "Source class ID");
      assertUuid(academicTermId, "Target Term 1 ID");
      if (!Array.isArray(decisions) || decisions.length < 1 || decisions.length > 100) {
        throw new TypeError("Choose 1 to 100 individually reviewed learners.");
      }
      const seen = new Set();
      for (const row of decisions) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new TypeError("Each decision must be an individual learner record.");
        }
        assertUuid(row.learnerId, "Learner ID");
        const id = row.learnerId.toLowerCase();
        if (seen.has(id)) throw new TypeError("Duplicate learners are not allowed in one decision batch.");
        seen.add(id);
        if (!["Promote", "Repeat", "Complete"].includes(row.decision) ||
            typeof row.reason !== "string" ||
            row.reason.trim().length < 2 || row.reason.trim().length > 300) {
          throw new TypeError("Each selected learner needs a decision and a reason.");
        }
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const events = [];
        for (const row of decisions) {
          events.push(await this.recordYearAdvancementDecision({
            staffId, fromClassId, academicTermId,
            learnerId: row.learnerId, decision: row.decision, reason: row.reason
          }, client));
        }
        await client.query("COMMIT");
        return { approvedCount: events.length, events };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },

    async recordYearAdvancementDecision({
      staffId, learnerId, fromClassId, academicTermId, decision, reason
    }, db = pool) {
      for (const [value, name] of [[staffId, "Staff ID"], [learnerId, "Learner ID"],
        [fromClassId, "Source class ID"], [academicTermId, "Academic Term ID"]]) {
        assertUuid(value, name);
      }
      if (!["Promote", "Repeat", "Complete"].includes(decision)) {
        throw new TypeError("Choose Promote, Repeat, or Complete.");
      }
      if (typeof reason !== "string" || reason.trim().length < 2 || reason.trim().length > 300) {
        throw new TypeError("An advancement reason of 2 to 300 characters is required.");
      }
      // This review is only for the first active term of the new year.
      // Old enrolments are not silently promoted; each learner is selected.
      const check = await db.query(
        "SELECT t.starts_on::text AS \"effectiveDate\", " +
        "t.status AS \"termStatus\", y.status AS \"yearStatus\", " +
        "y.starts_on::text AS \"yearStart\", " +
        "c.class_code AS \"classCode\", c.level_order AS \"levelOrder\", " +
        "next_class.id::text AS \"nextClassId\", " +
        "l.id::text AS \"learnerId\", ep.admission_date::text AS \"enrolledFrom\" " +
        "FROM cornhill_school.academic_terms t " +
        "JOIN cornhill_school.academic_years y ON y.id=t.academic_year_id " +
        "JOIN cornhill_school.classes c ON c.id=$2::uuid AND c.is_active=true " +
        "LEFT JOIN cornhill_school.classes next_class " +
        "ON next_class.level_order=c.level_order+1 AND next_class.is_active=true " +
        "JOIN cornhill_school.learners l ON l.id=$3::uuid " +
        "AND l.class_id=c.id AND l.status='Active' " +
        "JOIN cornhill_school.enrolment_periods ep " +
        "ON ep.learner_id=l.id AND ep.class_id=c.id AND ep.status='Active' " +
        "WHERE t.id=$1::uuid AND t.term_number=1 " +
        "AND ep.admission_date<y.starts_on",
        [academicTermId, fromClassId, learnerId]
      );
      const row = check.rows[0];
      if (!row) throw conflict("This learner is not pending a new-year decision in the selected class.");
      if (row.yearStatus !== "Active" || row.termStatus !== "Active") {
        throw conflict("Activate the new academic year and its Term 1 before approving learner movements.");
      }
      if (row.effectiveDate < row.yearStart) throw conflict("Term 1 must begin within the new academic year.");
      if (decision === "Complete" && row.classCode !== "P7") {
        throw conflict("Only P.7 learners can complete primary school.");
      }
      if (decision === "Promote" && !row.nextClassId) {
        throw conflict("No next class exists. For P.7 choose Complete or Repeat.");
      }
      const toClassId = decision === "Complete" ? null :
        decision === "Repeat" ? fromClassId : row.nextClassId;
      // The existing SECURITY DEFINER progression function validates the
      // actor's permission, locks the learner and active enrolment, appends
      // the immutable event and updates the class atomically.
      const result = await db.query(
        "SELECT cornhill_school.record_learner_progression(" +
        "$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::date,$6::text)::text AS \"eventId\"",
        [staffId, learnerId, toClassId, academicTermId,
          row.effectiveDate, reason.trim()]
      );
      return { eventId: result.rows[0]?.eventId,
        decision, toClassId, learnerId };
    },

    async getAssessmentMarks(assessmentId) {
      const assessment = await getAssessment(assessmentId);
      if (!assessment) return null;
      const [subjectsResult, learnersResult, marksResult] = await Promise.all([
        pool.query(
          "SELECT s.id::text AS id, s.subject_code AS \"subjectCode\", " +
          "s.subject_name AS \"subjectName\", cs.display_order AS \"displayOrder\" " +
          "FROM cornhill_school.class_subjects cs " +
          "JOIN cornhill_school.subjects s ON s.id = cs.subject_id " +
          "WHERE cs.class_id = $1::uuid AND cs.is_active = true AND s.is_active = true " +
          "ORDER BY cs.display_order",
          [assessment.classId]
        ),
        pool.query(
          "SELECT DISTINCT l.id::text AS id, l.pupil_code AS \"pupilCode\", l.lin, " +
          "l.first_name AS \"firstName\", l.middle_name AS \"middleName\", l.last_name AS \"lastName\" " +
          "FROM cornhill_school.enrolment_periods ep " +
          "JOIN cornhill_school.learners l ON l.id = ep.learner_id " +
          "WHERE ep.class_id = $1::uuid AND ep.admission_date <= $2::date " +
          "AND (ep.exit_date IS NULL OR ep.exit_date >= $2::date) " +
          "ORDER BY l.last_name, l.first_name, l.pupil_code LIMIT 500",
          [assessment.classId, assessment.effectiveDate]
        ),
        pool.query(
          "SELECT learner_id::text AS \"learnerId\", subject_id::text AS \"subjectId\", " +
          "score::text AS score, max_score::text AS \"maxScore\", teacher_comment AS comment " +
          "FROM cornhill_school.learner_marks WHERE assessment_id = $1::uuid",
          [assessmentId]
        )
      ]);
      const marksByKey = new Map(marksResult.rows.map(row => [
        row.learnerId + ":" + row.subjectId,
        { score: Number(row.score), maxScore: Number(row.maxScore), comment: row.comment }
      ]));
      const subjects = subjectsResult.rows;
      const learners = learnersResult.rows.map(learner => ({
        ...learner,
        marks: subjects.map(subject => ({
          subjectId: subject.id,
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          ...(marksByKey.get(learner.id + ":" + subject.id) ?? { score: null, maxScore: assessment.maxScore, comment: null })
        }))
      }));
      return { assessment, subjects, learners };
    },

    async createAcademicYear(input) {
      const result = await pool.query(
        "INSERT INTO cornhill_school.academic_years " +
        "(year_label, starts_on, ends_on, status, created_by_staff_id) " +
        "VALUES ($1, $2::date, $3::date, $4, $5::uuid) " +
        "RETURNING id::text AS id, year_label AS \"yearLabel\", starts_on::text AS \"startsOn\", " +
        "ends_on::text AS \"endsOn\", status",
        [input.yearLabel, input.startsOn, input.endsOn, input.status, input.staffId]
      );
      return result.rows[0];
    },

    async createAcademicTerm(input) {
      const result = await pool.query(
        "INSERT INTO cornhill_school.academic_terms " +
        "(academic_year_id, term_number, term_name, starts_on, ends_on, status, created_by_staff_id) " +
        "SELECT y.id, $2, $3, $4::date, $5::date, $6, $7::uuid " +
        "FROM cornhill_school.academic_years y " +
        "WHERE y.id = $1::uuid AND $4::date >= y.starts_on AND $5::date <= y.ends_on " +
        "AND ($6 <> 'Active' OR y.status = 'Active') " +
        "RETURNING id::text AS id, academic_year_id::text AS \"academicYearId\", " +
        "term_number AS \"termNumber\", term_name AS \"termName\", " +
        "starts_on::text AS \"startsOn\", ends_on::text AS \"endsOn\", status",
        [input.academicYearId, input.termNumber, input.termName, input.startsOn,
          input.endsOn, input.status, input.staffId]
      );
      if (result.rowCount !== 1) {
        throw conflict("Academic term dates must be within the selected academic year, and an active term requires an active year.");
      }
      return result.rows[0];
    },

    async createAssessment(input) {
      const result = await pool.query(
        "INSERT INTO cornhill_school.assessments " +
        "(academic_term_id, class_id, assessment_name, assessment_type, assessment_date, max_score, " +
        "status, created_by_staff_id, last_updated_by_staff_id) " +
        "VALUES ($1::uuid, $2::uuid, $3, $4, $5::date, $6, 'Draft', $7::uuid, $7::uuid) " +
        "RETURNING id::text AS id, class_id::text AS \"classId\", academic_term_id::text AS \"academicTermId\", " +
        "assessment_name AS \"assessmentName\", assessment_type AS \"assessmentType\", " +
        "assessment_date::text AS \"assessmentDate\", max_score::text AS \"maxScore\", status",
        [input.academicTermId, input.classId, input.assessmentName, input.assessmentType,
          input.assessmentDate, input.maxScore, input.staffId]
      );
      return { ...result.rows[0], maxScore: Number(result.rows[0].maxScore) };
    },

    async transitionAssessment({ assessmentId, nextStatus, staffId }) {
      assertUuid(assessmentId, "Assessment ID");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query(
          "SELECT status FROM cornhill_school.assessments WHERE id = $1::uuid FOR UPDATE",
          [assessmentId]
        );
        if (locked.rowCount !== 1) throw conflict("Assessment not found.");
        const current = locked.rows[0].status;
        const allowed = {
          Draft: ["Open", "Archived"],
          Open: ["Locked", "Archived"],
          Locked: ["Published", "Archived"]
        };
        if (!(allowed[current] ?? []).includes(nextStatus)) {
          throw conflict("The requested assessment status transition is not allowed.");
        }
        const updated = await client.query(
          "UPDATE cornhill_school.assessments SET status = $2, " +
          "locked_at = CASE WHEN $2 IN ('Locked', 'Published') THEN COALESCE(locked_at, now()) ELSE locked_at END, " +
          "published_at = CASE WHEN $2 = 'Published' THEN now() ELSE NULL END, " +
          "last_updated_by_staff_id = $3::uuid, updated_at = now() " +
          "WHERE id = $1::uuid RETURNING id::text AS id, status, locked_at AS \"lockedAt\", published_at AS \"publishedAt\"",
          [assessmentId, nextStatus, staffId]
        );
        await client.query("COMMIT");
        return updated.rows[0];
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },

    async saveMarks({ assessmentId, classId, staffId, marks }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const assessmentResult = await client.query(
          "SELECT class_id::text AS \"classId\", max_score::text AS \"maxScore\", status " +
          "FROM cornhill_school.assessments WHERE id = $1::uuid FOR UPDATE",
          [assessmentId]
        );
        if (assessmentResult.rowCount !== 1) throw conflict("Assessment not found.");
        const assessment = assessmentResult.rows[0];
        if (assessment.classId !== classId) throw conflict("Assessment class does not match the selected class.");
        if (assessment.status !== "Open") throw conflict("Marks can only be saved while the assessment is open.");
        const maxScore = Number(assessment.maxScore);
        for (const mark of marks) {
          if (mark.score > maxScore) throw conflict("A score exceeds the assessment maximum.");
          await client.query(
            "INSERT INTO cornhill_school.learner_marks " +
            "(assessment_id, learner_id, class_id, subject_id, score, max_score, teacher_comment, " +
            "entered_by_staff_id, updated_by_staff_id) " +
            "VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid, $8::uuid) " +
            "ON CONFLICT (assessment_id, learner_id, subject_id) DO UPDATE SET " +
            "score = EXCLUDED.score, max_score = EXCLUDED.max_score, teacher_comment = EXCLUDED.teacher_comment, " +
            "updated_by_staff_id = EXCLUDED.updated_by_staff_id, updated_at = now()",
            [assessmentId, mark.learnerId, classId, mark.subjectId, mark.score, maxScore, mark.comment, staffId]
          );
        }
        await client.query("COMMIT");
        return { savedCount: marks.length };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    },

    async generateReportCards({ assessmentId, staffId }) {
      assertUuid(assessmentId, "Assessment ID");
      assertUuid(staffId, "Staff ID");
      const result = await pool.query(
        "SELECT cornhill_school.generate_academic_report_cards($1::uuid,$2::uuid)::int AS \"generatedCount\"",
        [assessmentId, staffId]
      );
      return { generatedCount: Number(result.rows[0]?.generatedCount ?? 0) };
    },

    async getLearnerReportCards(learnerId, classIds = null) {
      assertUuid(learnerId, "Learner ID");
      if (classIds !== null && (!Array.isArray(classIds) || classIds.some(classId => !UUID_PATTERN.test(classId)))) {
        throw new TypeError("Report-card class scope is invalid.");
      }
      const result = await pool.query(
        "SELECT id::text AS id, learner_id::text AS \"learnerId\", assessment_id::text AS \"assessmentId\", " +
        "academic_year_id::text AS \"academicYearId\", academic_term_id::text AS \"academicTermId\", " +
        "class_id::text AS \"classId\", enrolment_period_id::text AS \"enrolmentPeriodId\", " +
        "pupil_code_snapshot AS \"pupilCode\", lin_snapshot AS lin, learner_name_snapshot AS \"learnerName\", " +
        "p7_index_number_snapshot AS \"p7IndexNumber\", class_code_snapshot AS \"classCode\", " +
        "class_name_snapshot AS \"className\", assessment_name_snapshot AS \"assessmentName\", " +
        "assessment_type_snapshot AS \"assessmentType\", assessment_date::text AS \"assessmentDate\", " +
        "academic_year_label_snapshot AS \"academicYear\", " +
        "academic_term_number_snapshot AS \"termNumber\", academic_term_name_snapshot AS \"termName\", " +
        "grading_scheme_code AS \"gradingScheme\", subject_results AS subjects, " +
        "total_score::text AS \"totalScore\", total_possible::text AS \"totalPossible\", " +
        "average_percent::text AS \"averagePercent\", aggregate_total AS aggregate, " +
        "division_code AS division, class_position AS position, class_size AS \"classSize\", " +
        "generated_at AS \"generatedAt\" " +
        "FROM cornhill_school.academic_report_cards WHERE learner_id=$1::uuid " +
        "AND ($2::uuid[] IS NULL OR class_id=ANY($2::uuid[])) " +
        "ORDER BY assessment_date DESC, generated_at DESC LIMIT 200",
        [learnerId, classIds]
      );
      return result.rows.map(row => ({
        ...row,
        totalScore: Number(row.totalScore),
        totalPossible: Number(row.totalPossible),
        averagePercent: Number(row.averagePercent),
        aggregate: row.aggregate == null ? null : Number(row.aggregate),
        position: Number(row.position),
        classSize: Number(row.classSize)
      }));
    }
  });
}
