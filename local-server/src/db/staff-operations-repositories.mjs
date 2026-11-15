const LEAVE_TYPES = new Set([
  "Annual", "Sick", "Maternity", "Paternity", "Compassionate", "Unpaid", "Study", "Other"
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError(label + " is invalid.");
  }
}

function assertDate(value, label) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new TypeError(label + " must use YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError(label + " is not a real calendar date.");
  }
}

export function createPostgresStaffOperationsRepository(pool) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool with transaction support is required.");
  }

  return Object.freeze({
    async getWorkspace({
      staffId,
      includeAttendance = false,
      includeOwnLeave = false,
      includeLeaveReview = false,
      includeAllLeaveBalances = false,
      includePayroll = false
    } = {}) {
      if (includeOwnLeave || includeAllLeaveBalances) assertUuid(staffId, "Staff ID");
      const result = {
        attendance: { recentDays: [], monthly: [], reviewQueue: [] },
        leave: { ownRequests: [], balances: [], reviewQueue: [] },
        payroll: { periods: [], runs: [], lines: [] },
        capabilities: {
          attendance: includeAttendance,
          ownLeave: includeOwnLeave,
          leaveReview: includeLeaveReview,
          allLeaveBalances: includeAllLeaveBalances,
          payroll: includePayroll
        }
      };
      const jobs = [];

      if (includeAttendance) {
        jobs.push(pool.query(
          "SELECT ad.id::text AS id, ad.work_date::text AS \"workDate\", " +
          "ad.attendance_status AS status, ad.first_clock_in AS \"firstClockIn\", " +
          "ad.last_clock_out AS \"lastClockOut\", ad.expected_minutes AS \"expectedMinutes\", " +
          "ad.worked_minutes AS \"workedMinutes\", ad.calculation_source AS source, " +
          "ad.verified_at AS \"verifiedAt\", sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", sp.job_title AS \"jobTitle\" " +
          "FROM cornhill_school.attendance_days ad " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=ad.staff_account_id " +
          "WHERE ad.work_date >= CURRENT_DATE-30 " +
          "ORDER BY ad.work_date DESC,sp.legal_name LIMIT 500"
        ).then(rows => { result.attendance.recentDays = rows.rows; }));

        jobs.push(pool.query(
          "SELECT ms.month_start::text AS \"monthStart\", sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "ms.recorded_days AS \"recordedDays\", ms.present_days AS \"presentDays\", " +
          "ms.late_days AS \"lateDays\", ms.absent_days AS \"absentDays\", " +
          "ms.half_days AS \"halfDays\", ms.leave_days AS \"leaveDays\", " +
          "ms.expected_minutes AS \"expectedMinutes\", ms.worked_minutes AS \"workedMinutes\" " +
          "FROM cornhill_school.attendance_monthly_summary ms " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=ms.staff_account_id " +
          "WHERE ms.month_start >= date_trunc('month',CURRENT_DATE-interval '2 months')::date " +
          "ORDER BY ms.month_start DESC,sp.legal_name LIMIT 500"
        ).then(rows => { result.attendance.monthly = rows.rows; }));

        jobs.push(pool.query(
          "SELECT q.attendance_day_id::text AS \"attendanceDayId\", q.work_date::text AS \"workDate\", " +
          "sp.staff_number AS \"staffNumber\", COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "q.review_status AS \"reviewStatus\", q.review_note AS \"reviewNote\", " +
          "q.reviewed_at AS \"reviewedAt\" " +
          "FROM cornhill_school.attendance_day_review_queue q " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=q.staff_account_id " +
          "WHERE q.work_date >= CURRENT_DATE-30 " +
          "ORDER BY q.work_date DESC,sp.legal_name LIMIT 300"
        ).then(rows => { result.attendance.reviewQueue = rows.rows; }));
      }

      if (includeOwnLeave) {
        jobs.push(pool.query(
          "SELECT id::text AS id,leave_type AS \"leaveType\",starts_on::text AS \"startsOn\", " +
          "ends_on::text AS \"endsOn\",requested_days::text AS \"requestedDays\",reason,status, " +
          "submitted_at AS \"submittedAt\",reviewed_at AS \"reviewedAt\",review_note AS \"reviewNote\" " +
          "FROM cornhill_school.staff_leave_requests WHERE staff_account_id=$1::uuid " +
          "ORDER BY created_at DESC LIMIT 100",
          [staffId]
        ).then(rows => { result.leave.ownRequests = rows.rows; }));

        jobs.push(pool.query(
          "SELECT leave_type AS \"leaveType\",available_days::text AS \"availableDays\" " +
          "FROM cornhill_school.staff_leave_balance_summary WHERE staff_account_id=$1::uuid " +
          "ORDER BY leave_type",
          [staffId]
        ).then(rows => { result.leave.balances = rows.rows; }));
      }

      if (includeAllLeaveBalances) {
        jobs.push(pool.query(
          "SELECT b.staff_account_id::text AS \"staffId\",sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "b.leave_type AS \"leaveType\",b.available_days::text AS \"availableDays\" " +
          "FROM cornhill_school.staff_leave_balance_summary b " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=b.staff_account_id " +
          "ORDER BY sp.legal_name,b.leave_type LIMIT 500"
        ).then(rows => { result.leave.balances = rows.rows; }));
      }

      if (includeLeaveReview) {
        jobs.push(pool.query(
          "SELECT id::text AS id,staff_account_id::text AS \"staffId\",legal_name AS \"legalName\", " +
          "staff_number AS \"staffNumber\",leave_type AS \"leaveType\",starts_on::text AS \"startsOn\", " +
          "ends_on::text AS \"endsOn\",requested_days::text AS \"requestedDays\",reason,submitted_at AS \"submittedAt\" " +
          "FROM cornhill_school.staff_leave_review_queue ORDER BY submitted_at,legal_name LIMIT 200"
        ).then(rows => { result.leave.reviewQueue = rows.rows; }));
      }

      if (includePayroll) {
        jobs.push(pool.query(
          "SELECT id::text AS id,period_code AS \"periodCode\",starts_on::text AS \"startsOn\", " +
          "ends_on::text AS \"endsOn\",payment_date::text AS \"paymentDate\",period_status AS status " +
          "FROM cornhill_school.payroll_periods " +
          "WHERE starts_on >= CURRENT_DATE-interval '24 months' OR period_status='Open' " +
          "ORDER BY starts_on DESC LIMIT 48"
        ).then(rows => { result.payroll.periods = rows.rows; }));

        jobs.push(pool.query(
          "SELECT pr.id::text AS id,pp.period_code AS \"periodCode\",pr.run_status AS status, " +
          "pr.prepared_at AS \"preparedAt\",pr.reviewed_at AS \"reviewedAt\", " +
          "pr.approved_at AS \"approvedAt\",pr.posted_at AS \"postedAt\", " +
          "count(pl.id)::int AS \"staffCount\", " +
          "COALESCE(sum(pl.gross_pay_ugx),0)::text AS \"grossPayUgx\", " +
          "COALESCE(sum(pl.net_pay_ugx),0)::text AS \"netPayUgx\", " +
          "COALESCE(sum(ds.verified_paid_ugx),0)::text AS \"verifiedPaidUgx\", " +
          "COALESCE(sum(ds.pending_verification_ugx),0)::text AS \"pendingVerificationUgx\", " +
          "COALESCE(sum(ds.remaining_unallocated_ugx),0)::text AS \"remainingUnallocatedUgx\" " +
          "FROM cornhill_school.payroll_runs pr " +
          "JOIN cornhill_school.payroll_periods pp ON pp.id=pr.payroll_period_id " +
          "LEFT JOIN cornhill_school.payroll_lines pl ON pl.payroll_run_id=pr.id " +
          "LEFT JOIN cornhill_school.payroll_disbursement_summary ds ON ds.payroll_line_id=pl.id " +
          "GROUP BY pr.id,pp.period_code ORDER BY pp.starts_on DESC LIMIT 48"
        ).then(rows => { result.payroll.runs = rows.rows; }));

        jobs.push(pool.query(
          "SELECT pl.id::text AS id,pp.period_code AS \"periodCode\",sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\",pl.base_salary_ugx::text AS \"baseSalaryUgx\", " +
          "pl.allowances_ugx::text AS \"allowancesUgx\",pl.deductions_ugx::text AS \"deductionsUgx\", " +
          "pl.gross_pay_ugx::text AS \"grossPayUgx\",pl.net_pay_ugx::text AS \"netPayUgx\",pl.currency " +
          "FROM cornhill_school.payroll_lines pl " +
          "JOIN cornhill_school.payroll_runs pr ON pr.id=pl.payroll_run_id " +
          "JOIN cornhill_school.payroll_periods pp ON pp.id=pr.payroll_period_id " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=pl.staff_account_id " +
          "WHERE pp.starts_on >= CURRENT_DATE-interval '6 months' " +
          "ORDER BY pp.starts_on DESC,sp.legal_name LIMIT 500"
        ).then(rows => { result.payroll.lines = rows.rows; }));
      }

      await Promise.all(jobs);
      return result;
    },

    async submitLeaveRequest({ staffId, leaveType, startsOn, endsOn, requestedDays, reason }) {
      assertUuid(staffId, "Staff ID");
      if (!LEAVE_TYPES.has(leaveType)) throw new TypeError("Choose a supported leave type.");
      assertDate(startsOn, "Leave start date");
      assertDate(endsOn, "Leave end date");
      if (endsOn < startsOn) throw new TypeError("Leave end date cannot be before its start date.");
      if (typeof requestedDays !== "number" || !Number.isFinite(requestedDays) ||
          requestedDays <= 0 || requestedDays > 366 || Math.round(requestedDays * 100) !== requestedDays * 100) {
        throw new TypeError("Requested leave days must be between 0.01 and 366, with up to two decimal places.");
      }
      if (typeof reason !== "string" || reason.trim().length < 8 || reason.trim().length > 1200) {
        throw new TypeError("Leave reason must contain 8 to 1,200 characters.");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          "INSERT INTO cornhill_school.staff_leave_requests " +
          "(staff_account_id,leave_type,starts_on,ends_on,requested_days,reason,status,requested_by_staff_id,created_by_staff_id) " +
          "VALUES ($1::uuid,$2,$3::date,$4::date,$5,$6,'Draft',$1::uuid,$1::uuid) " +
          "RETURNING id::text AS id",
          [staffId,leaveType,startsOn,endsOn,requestedDays,reason.trim()]
        );
        const id = inserted.rows[0]?.id;
        const submitted = await client.query(
          "UPDATE cornhill_school.staff_leave_requests SET status='Submitted' " +
          "WHERE id=$1::uuid AND staff_account_id=$2::uuid AND status='Draft' " +
          "RETURNING id::text AS id,leave_type AS \"leaveType\",starts_on::text AS \"startsOn\", " +
          "ends_on::text AS \"endsOn\",requested_days::text AS \"requestedDays\",status,submitted_at AS \"submittedAt\"",
          [id,staffId]
        );
        if (submitted.rowCount !== 1) throw new Error("The leave request could not be submitted.");
        await client.query("COMMIT");
        return submitted.rows[0];
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
