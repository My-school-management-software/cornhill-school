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
      includeAttendanceReview = false,
      includeAttendanceGovernance = false,
      includeSalaryAgreements = false,
      includePayroll = false,
      includePayrollRecord = false,
      includePayrollVerify = false
    } = {}) {
      if (includeOwnLeave || includeAllLeaveBalances) assertUuid(staffId, "Staff ID");
      const result = {
        attendance: { recentDays: [], monthly: [], reviewQueue: [], governance: {
          policy: null, calendarExceptions: [], schedules: [], scheduleAssignments: [],
          incidents: [], prepSessions: [], prepAttendance: []
        } },
        leave: { ownRequests: [], balances: [], allBalances: [], reviewQueue: [] },
        payroll: { periods: [], runs: [], lines: [], lineItems: [], salaryAgreements: [], disbursements: [] },
        capabilities: {
          attendance: includeAttendance,
          attendanceReview: includeAttendanceReview,
          attendanceGovernance: includeAttendanceGovernance,
          salaryAgreements: includeSalaryAgreements,
          ownLeave: includeOwnLeave,
          leaveReview: includeLeaveReview,
          allLeaveBalances: includeAllLeaveBalances,
          payroll: includePayroll,
          payrollRecord: includePayrollRecord,
          payrollVerify: includePayrollVerify
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


      if (includeAttendanceGovernance) {
        jobs.push(pool.query(
          "SELECT review_window_minutes AS \"reviewWindowMinutes\",sunday_paid_rest_day AS \"sundayPaidRestDay\", " +
          "saturday_start_time::text AS \"saturdayStartTime\",saturday_end_time::text AS \"saturdayEndTime\", " +
          "prep_enabled AS \"prepEnabled\",prep_deduction_ugx::text AS \"prepDeductionUgx\", " +
          "updated_at AS \"updatedAt\" FROM cornhill_school.staff_attendance_policy_settings WHERE id=true"
        ).then(rows => { result.attendance.governance.policy = rows.rows[0] ?? null; }));
        jobs.push(pool.query(
          "SELECT attendance_date::text AS \"date\",exception_type AS type,is_working_day AS \"isWorkingDay\",note " +
          "FROM cornhill_school.staff_attendance_calendar_exceptions " +
          "WHERE attendance_date BETWEEN CURRENT_DATE-interval '90 days' AND CURRENT_DATE+interval '180 days' " +
          "ORDER BY attendance_date LIMIT 400"
        ).then(rows => { result.attendance.governance.calendarExceptions = rows.rows; }));
        jobs.push(pool.query(
          "SELECT schedule_code AS \"scheduleCode\",schedule_name AS \"scheduleName\", " +
          "start_time::text AS \"startTime\",end_time::text AS \"endTime\", " +
          "saturday_start_time::text AS \"saturdayStartTime\",saturday_end_time::text AS \"saturdayEndTime\", " +
          "grace_minutes AS \"graceMinutes\",weekdays,is_active AS \"isActive\" " +
          "FROM cornhill_school.staff_work_schedules ORDER BY is_active DESC,schedule_name LIMIT 100"
        ).then(rows => { result.attendance.governance.schedules = rows.rows; }));
        jobs.push(pool.query(
          "SELECT sp.staff_number AS \"staffNumber\",COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "ws.schedule_code AS \"scheduleCode\",ws.schedule_name AS \"scheduleName\", " +
          "a.starts_on::text AS \"startsOn\",a.ends_on::text AS \"endsOn\",a.saturday_required AS \"saturdayRequired\" " +
          "FROM cornhill_school.staff_attendance_schedule_assignments a " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=a.staff_account_id " +
          "JOIN cornhill_school.staff_work_schedules ws ON ws.id=a.schedule_id " +
          "WHERE a.starts_on<=CURRENT_DATE AND (a.ends_on IS NULL OR a.ends_on>=CURRENT_DATE) " +
          "ORDER BY sp.legal_name LIMIT 300"
        ).then(rows => { result.attendance.governance.scheduleAssignments = rows.rows; }));
        jobs.push(pool.query(
          "SELECT i.id::text AS id,i.attendance_date::text AS \"attendanceDate\", " +
          "sp.staff_number AS \"staffNumber\",COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "i.incident_type AS \"incidentType\",i.status,i.detected_at AS \"detectedAt\", " +
          "i.review_deadline_at AS \"reviewDeadlineAt\",i.headteacher_statement AS \"headteacherStatement\", " +
          "i.director_decision AS \"directorDecision\",i.approved_deduction_ugx::text AS \"approvedDeductionUgx\",i.review_note AS \"reviewNote\" " +
          "FROM cornhill_school.staff_attendance_incidents i " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=i.staff_account_id " +
          "WHERE i.attendance_date>=CURRENT_DATE-interval '90 days' OR i.director_decision IS NULL " +
          "ORDER BY i.attendance_date DESC,sp.legal_name LIMIT 500"
        ).then(rows => { result.attendance.governance.incidents = rows.rows; }));
        jobs.push(pool.query(
          "SELECT s.id::text AS id,s.prep_date::text AS \"prepDate\",s.title,s.start_time::text AS \"startTime\", " +
          "s.end_time::text AS \"endTime\",s.class_name AS \"className\",s.approval_status AS status,s.is_published AS \"isPublished\", " +
          "(SELECT count(*)::int FROM cornhill_school.staff_prep_assignments a WHERE a.prep_session_id=s.id) AS \"assignedStaffCount\", " +
          "(SELECT count(*)::int FROM cornhill_school.staff_scheduled_session_attendance a WHERE a.session_id=s.id AND a.clock_in_at IS NOT NULL) AS \"clockedInCount\" " +
          "FROM cornhill_school.staff_prep_sessions s " +
          "WHERE s.prep_date BETWEEN CURRENT_DATE-interval '90 days' AND CURRENT_DATE+interval '180 days' " +
          "ORDER BY s.prep_date DESC,s.start_time LIMIT 300"
        ).then(rows => { result.attendance.governance.prepSessions = rows.rows; }));
        jobs.push(pool.query(
          "SELECT s.prep_date::text AS \"prepDate\",s.title,sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\",a.clock_in_at AS \"clockInAt\", " +
          "a.clock_out_at AS \"clockOutAt\" FROM cornhill_school.staff_scheduled_session_attendance a " +
          "JOIN cornhill_school.staff_prep_sessions s ON s.id=a.session_id " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=a.staff_account_id " +
          "WHERE s.prep_date BETWEEN CURRENT_DATE-interval '90 days' AND CURRENT_DATE+interval '180 days' " +
          "ORDER BY s.prep_date DESC,s.start_time,sp.legal_name LIMIT 500"
        ).then(rows => { result.attendance.governance.prepAttendance = rows.rows; }));
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
        ).then(rows => { result.leave.allBalances = rows.rows; }));
      }

      if (includeLeaveReview) {
        jobs.push(pool.query(
          "SELECT id::text AS id,staff_account_id::text AS \"staffId\",legal_name AS \"legalName\", " +
          "staff_number AS \"staffNumber\",leave_type AS \"leaveType\",starts_on::text AS \"startsOn\", " +
          "ends_on::text AS \"endsOn\",requested_days::text AS \"requestedDays\",reason,submitted_at AS \"submittedAt\" " +
          "FROM cornhill_school.staff_leave_review_queue ORDER BY submitted_at,legal_name LIMIT 200"
        ).then(rows => { result.leave.reviewQueue = rows.rows; }));
      }


      if (includeSalaryAgreements) {
        jobs.push(pool.query(
          "SELECT sp.staff_number AS \"staffNumber\",COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "a.salary_basis AS \"salaryBasis\",a.base_salary_ugx::text AS \"baseSalaryUgx\", " +
          "a.daily_rate_ugx::text AS \"dailyRateUgx\",a.effective_from::text AS \"effectiveFrom\", " +
          "a.effective_to::text AS \"effectiveTo\",a.is_active AS \"isActive\",a.created_at AS \"createdAt\" " +
          "FROM cornhill_school.staff_salary_agreements a " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=a.staff_account_id " +
          "ORDER BY sp.legal_name,a.effective_from DESC LIMIT 500"
        ).then(rows => { result.payroll.salaryAgreements = rows.rows; }));
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
          "GROUP BY pr.id,pp.period_code,pp.starts_on ORDER BY pp.starts_on DESC LIMIT 48"
        ).then(rows => { result.payroll.runs = rows.rows; }));

        jobs.push(pool.query(
          "SELECT pd.id::text AS id,pd.payroll_line_id::text AS \"payrollLineId\", " +
          "pp.period_code AS \"periodCode\",sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
          "pd.amount_ugx::text AS \"amountUgx\",pd.payment_method AS \"paymentMethod\", " +
          "pd.external_reference AS \"externalReference\",pd.paid_at AS \"paidAt\", " +
          "pd.disbursement_status AS status,pd.recorded_by_staff_id::text AS \"recordedByStaffId\", " +
          "pd.verified_by_staff_id::text AS \"verifiedByStaffId\",pd.verified_at AS \"verifiedAt\", " +
          "pd.verification_note AS \"verificationNote\" " +
          "FROM cornhill_school.payroll_disbursements pd " +
          "JOIN cornhill_school.payroll_lines pl ON pl.id=pd.payroll_line_id " +
          "JOIN cornhill_school.payroll_runs pr ON pr.id=pl.payroll_run_id " +
          "JOIN cornhill_school.payroll_periods pp ON pp.id=pr.payroll_period_id " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=pl.staff_account_id " +
          "ORDER BY pd.paid_at DESC LIMIT 500"
        ).then(rows => { result.payroll.disbursements = rows.rows; }));

        jobs.push(pool.query(
          "SELECT i.id::text AS id,pp.period_code AS \"periodCode\",sp.staff_number AS \"staffNumber\", " +
          "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\",i.item_type AS \"itemType\", " +
          "i.item_code AS \"itemCode\",i.description,i.amount_ugx::text AS \"amountUgx\", " +
          "i.source_attendance_adjustment_id::text AS \"attendanceAdjustmentId\",i.approved_at AS \"approvedAt\" " +
          "FROM cornhill_school.payroll_line_items i " +
          "JOIN cornhill_school.payroll_lines pl ON pl.id=i.payroll_line_id " +
          "JOIN cornhill_school.payroll_runs pr ON pr.id=pl.payroll_run_id " +
          "JOIN cornhill_school.payroll_periods pp ON pp.id=pr.payroll_period_id " +
          "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=pl.staff_account_id " +
          "WHERE pp.starts_on>=CURRENT_DATE-interval '6 months' " +
          "ORDER BY pp.starts_on DESC,sp.legal_name,i.created_at LIMIT 1000"
        ).then(rows => { result.payroll.lineItems = rows.rows; }));

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

    async recordAttendanceReview({ attendanceDayId, reviewerStaffId, reviewStatus, reviewNote }) {
      assertUuid(attendanceDayId, "Attendance day ID");
      assertUuid(reviewerStaffId, "Reviewer staff ID");
      if (!["Verified", "Correction Required"].includes(reviewStatus)) throw new TypeError("Choose Verified or Correction Required.");
      if (typeof reviewNote !== "string" || reviewNote.trim().length < 5 || reviewNote.trim().length > 1000) {
        throw new TypeError("Attendance review note must contain 5 to 1,000 characters.");
      }
      const result = await pool.query(
        "INSERT INTO cornhill_school.attendance_day_review_events " +
        "(attendance_day_id,staff_account_id,attendance_date,review_status,review_note,reviewed_by_staff_id) " +
        "SELECT id,staff_account_id,work_date,$3,$4,$2::uuid " +
        "FROM cornhill_school.attendance_days WHERE id=$1::uuid " +
        "RETURNING id::text AS id,attendance_date::text AS \"attendanceDate\",review_status AS status,review_note AS note,reviewed_at AS \"reviewedAt\"",
        [attendanceDayId, reviewerStaffId, reviewStatus, reviewNote.trim()]
      );
      if (result.rowCount !== 1) {
        const error = new Error("The attendance day was not found.");
        error.code = "P0002";
        throw error;
      }
      return result.rows[0];
    },

    async recordPayrollDisbursement({ payrollLineId, recorderStaffId, amountUgx, paymentMethod, externalReference, paidAt }) {
      assertUuid(payrollLineId, "Payroll line ID");
      assertUuid(recorderStaffId, "Recording officer ID");
      if (!Number.isSafeInteger(amountUgx) || amountUgx <= 0 || amountUgx > 1000000000) throw new TypeError("Enter a positive whole UGX payment amount.");
      if (!["Cash", "Bank Transfer", "Mobile Money"].includes(paymentMethod)) throw new TypeError("Choose a supported payroll payment method.");
      const reference = typeof externalReference === "string" ? externalReference.trim() : "";
      if (reference.length > 120 || (paymentMethod !== "Cash" && reference.length < 3)) throw new TypeError("Bank and mobile-money payments require a reference of 3 to 120 characters.");
      if (typeof paidAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(paidAt) || !Number.isFinite(Date.parse(paidAt))) {
        throw new TypeError("Payment date must be a valid ISO timestamp with a timezone.");
      }
      const result = await pool.query(
        "INSERT INTO cornhill_school.payroll_disbursements " +
        "(payroll_line_id,amount_ugx,payment_method,external_reference,paid_at,recorded_by_staff_id) " +
        "VALUES ($1::uuid,$2,$3,$4,$5::timestamptz,$6::uuid) " +
        "RETURNING id::text AS id,amount_ugx::text AS \"amountUgx\",payment_method AS \"paymentMethod\", " +
        "external_reference AS \"externalReference\",paid_at AS \"paidAt\",disbursement_status AS status",
        [payrollLineId, amountUgx, paymentMethod, reference || null, paidAt, recorderStaffId]
      );
      return result.rows[0];
    },

    async verifyPayrollDisbursement({ disbursementId, verifierStaffId, decision, verificationNote = "" }) {
      assertUuid(disbursementId, "Payroll disbursement ID");
      assertUuid(verifierStaffId, "Verifier staff ID");
      if (!["Verified", "Rejected"].includes(decision)) throw new TypeError("Choose Verified or Rejected.");
      if (typeof verificationNote !== "string" || verificationNote.trim().length > 1000 ||
          (decision === "Rejected" && verificationNote.trim().length < 5)) {
        throw new TypeError("A rejection reason of at least five characters is required; notes may not exceed 1,000 characters.");
      }
      const result = await pool.query(
        "UPDATE cornhill_school.payroll_disbursements " +
        "SET disbursement_status=$2,verified_by_staff_id=$3::uuid,verification_note=$4 " +
        "WHERE id=$1::uuid AND disbursement_status='Pending Verification' " +
        "RETURNING id::text AS id,disbursement_status AS status,verified_at AS \"verifiedAt\"",
        [disbursementId, decision, verifierStaffId, verificationNote.trim() || null]
      );
      if (result.rowCount !== 1) {
        const error = new Error("This payroll payment is no longer awaiting verification.");
        error.code = "P0002";
        throw error;
      }
      return result.rows[0];
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
          "(staff_account_id,leave_type,starts_on,ends_on,requested_days,reason,requested_by_staff_id,created_by_staff_id) " +
          "VALUES ($1::uuid,$2,$3::date,$4::date,$5,$6,$1::uuid,$1::uuid) " +
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
