const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(label + " is invalid.");
}
function conflict(message) {
  const error = new Error(message);
  error.code = "CORNHILL_STAFF_CONFLICT";
  return error;
}

export function createPostgresStaffLeadershipRepository(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required.");
  return Object.freeze({
    async getWorkspace({ includeStaff = false, includeAttendance = false, includeIncidents = false, includeSessions = false } = {}) {
      const result = { summary: {}, staff: [], attendance: [], incidents: [], prepSessions: [] };
      const jobs = [];
      if (includeStaff) {
        jobs.push(pool.query(
          "SELECT staff_number AS \"staffNumber\", legal_name AS \"legalName\", " +
          "COALESCE(preferred_name, legal_name) AS \"displayName\", job_title AS \"jobTitle\", " +
          "department, employment_status AS \"employmentStatus\", hired_on::text AS \"hiredOn\" " +
          "FROM cornhill_school.staff_profiles WHERE employment_status <> 'Exited' " +
          "ORDER BY department, legal_name LIMIT 250"
        ).then(rows => { result.staff = rows.rows; }));
      }
      if (includeAttendance) {
        jobs.push(pool.query(
          "SELECT ad.work_date::text AS \"workDate\", ad.attendance_status AS status, " +
          "ad.first_clock_in AS \"firstClockIn\", ad.last_clock_out AS \"lastClockOut\", " +
          "ad.expected_minutes AS \"expectedMinutes\", ad.worked_minutes AS \"workedMinutes\", " +
          "ad.calculation_source AS source, ad.verified_at AS \"verifiedAt\", " +
          "sp.staff_number AS \"staffNumber\", COALESCE(sp.preferred_name, sp.legal_name) AS \"staffName\", " +
          "sp.job_title AS \"jobTitle\" " +
          "FROM cornhill_school.attendance_days ad " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id = ad.staff_account_id " +
          "WHERE ad.work_date = CURRENT_DATE ORDER BY sp.legal_name LIMIT 300"
        ).then(rows => {
          result.attendance = rows.rows;
          result.summary.attendanceRecorded = rows.rowCount;
          result.summary.presentToday = rows.rows.filter(row => row.status === "Present").length;
          result.summary.lateToday = rows.rows.filter(row => row.status === "Late").length;
          result.summary.absentToday = rows.rows.filter(row => row.status === "Absent").length;
        }));
        jobs.push(pool.query(
          "SELECT count(*)::int AS total_staff FROM cornhill_school.staff_profiles " +
          "WHERE employment_status = 'Active'"
        ).then(rows => { result.summary.activeStaff = rows.rows[0]?.total_staff ?? 0; }));
      }
      if (includeIncidents) {
        jobs.push(pool.query(
          "SELECT i.id::text AS id, i.attendance_date::text AS \"attendanceDate\", " +
          "i.incident_type AS \"incidentType\", i.status, i.review_deadline_at AS \"reviewDeadlineAt\", " +
          "i.headteacher_statement AS \"headteacherStatement\", " +
          "i.director_decision AS \"directorDecision\", " +
          "i.approved_deduction_ugx AS \"approvedDeductionUgx\", i.review_note AS \"reviewNote\", " +
          "sp.staff_number AS \"staffNumber\", COALESCE(sp.preferred_name, sp.legal_name) AS \"staffName\", " +
          "sp.job_title AS \"jobTitle\" " +
          "FROM cornhill_school.staff_attendance_incidents i " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id = i.staff_account_id " +
          "WHERE i.attendance_date >= CURRENT_DATE - 30 " +
          "ORDER BY (i.director_decision IS NULL) DESC, i.review_deadline_at, i.attendance_date DESC LIMIT 150"
        ).then(rows => { result.incidents = rows.rows; }));
      }
      if (includeSessions) {
        jobs.push(pool.query(
          "SELECT id::text AS id, prep_date::text AS \"prepDate\", title, " +
          "start_time::text AS \"startTime\", end_time::text AS \"endTime\", " +
          "class_name AS \"className\", approval_status AS \"approvalStatus\", is_published AS \"isPublished\" " +
          "FROM cornhill_school.staff_prep_sessions " +
          "WHERE prep_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 " +
          "ORDER BY prep_date, start_time LIMIT 100"
        ).then(rows => { result.prepSessions = rows.rows; }));
      }
      await Promise.all(jobs);
      return result;
    },

    async submitIncidentStatement({ incidentId, staffId, statement }) {
      assertUuid(incidentId, "Incident ID");
      assertUuid(staffId, "Staff ID");
      const result = await pool.query(
        "UPDATE cornhill_school.staff_attendance_incidents " +
        "SET headteacher_statement = $2, headteacher_statement_by = $3::uuid, headteacher_statement_at = now() " +
        "WHERE id = $1::uuid AND headteacher_statement IS NULL AND director_decision IS NULL " +
        "RETURNING id::text AS id, headteacher_statement AS statement, headteacher_statement_at AS \"recordedAt\"",
        [incidentId, statement, staffId]
      );
      if (result.rowCount !== 1) throw conflict("The incident was already reviewed or is no longer available.");
      return result.rows[0];
    },

    async decideIncident({ incidentId, staffId, decision, deductionUgx, reviewNote }) {
      assertUuid(incidentId, "Incident ID");
      assertUuid(staffId, "Staff ID");
      const result = await pool.query(
        "UPDATE cornhill_school.staff_attendance_incidents SET " +
        "director_decision = $2, director_decision_by = $3::uuid, " +
        "status = CASE WHEN $2 = 'excused' THEN 'Excused' ELSE 'Deduction Approved' END, " +
        "approved_deduction_ugx = $4, review_note = $5 " +
        "WHERE id = $1::uuid AND director_decision IS NULL AND review_deadline_at <= now() " +
        "AND ($2 <> 'deduct' OR headteacher_statement IS NOT NULL) " +
        "RETURNING id::text AS id, status, director_decision AS decision, " +
        "approved_deduction_ugx AS \"approvedDeductionUgx\", director_decision_at AS \"decidedAt\"",
        [incidentId, decision, staffId, deductionUgx, reviewNote]
      );
      if (result.rowCount !== 1) throw conflict("The incident is not yet eligible for a Director decision, or required review evidence is missing.");
      return result.rows[0];
    }
  });
}
