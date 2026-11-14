import { readLocalDatabaseConfig } from "../src/db/config.mjs";

const { Pool } = await import("pg");
const pool = new Pool(readLocalDatabaseConfig());

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectPgError(client, savepoint, statement, values, expectedCode) {
  await client.query("SAVEPOINT " + savepoint);
  let actualError;
  try {
    await client.query(statement, values);
  } catch (error) {
    actualError = error;
  }
  await client.query("ROLLBACK TO SAVEPOINT " + savepoint);
  await client.query("RELEASE SAVEPOINT " + savepoint);
  return actualError?.code === expectedCode;
}

try {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'cornhill_school' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const expected = [
    "academic_terms",
    "academic_years",
    "admission_enquiries",
    "admission_events",
    "assessments",
    "attendance_adjustments",
    "attendance_days",
    "attendance_devices",
    "attendance_events",
    "attendance_import_batches",
    "class_subjects",
    "classes",
    "enrolment_periods",
    "fee_catalogue",
    "fee_obligations",
    "finance_audit_events",
    "guardian_contacts",
    "learner_marks",
    "learners",
    "payment_allocations",
    "payment_notification_outbox",
    "payment_receipts",
    "payment_records",
    "payroll_audit_events",
    "payroll_line_items",
    "payroll_lines",
    "payroll_periods",
    "payroll_runs",
    "staff_attendance_calendar_exceptions",
    "staff_attendance_incidents",
    "staff_attendance_policy_settings",
    "staff_attendance_schedule_assignments",
    "staff_employment_terms",
    "staff_prep_assignments",
    "staff_prep_sessions",
    "staff_profiles",
    "staff_salary_agreements",
    "staff_scheduled_session_attendance",
    "staff_work_schedules",
    "subjects"
  ];
  assert(JSON.stringify(tables.rows.map(row => row.table_name)) === JSON.stringify(expected),
    "Local school table inventory mismatch. Expected: " + JSON.stringify(expected) + "; actual: " + JSON.stringify(tables.rows.map(row => row.table_name)));

  const classes = await pool.query(
    "SELECT class_code, display_name, section, level_order FROM cornhill_school.classes ORDER BY level_order"
  );
  assert(classes.rows.length === 10, "Expected Baby, Middle, Top and P.1 through P.7.");
  assert(classes.rows.slice(0, 3).every(row => row.section === "Nursery"), "First three levels must be Nursery.");
  assert(classes.rows.slice(3).every(row => row.section === "Primary"), "Primary classes must follow Nursery.");
  assert(classes.rows[9]?.class_code === "P7", "P.7 must be the final seeded class.");

  const permissionCount = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.permission_catalog"
  );
  assert(permissionCount.rows[0]?.count === 35, "Expected 35 unique permission catalogue entries after staff and payroll permissions are added.");

  const subjects = await pool.query(
    "SELECT subject_code FROM cornhill_school.subjects ORDER BY subject_code"
  );
  assert(subjects.rows.length === 15, "Expected 15 nursery, lower-primary and upper-primary subjects.");
  const mappings = await pool.query(
    "SELECT c.class_code, count(cs.subject_id)::int AS subject_count FROM cornhill_school.classes c LEFT JOIN cornhill_school.class_subjects cs ON cs.class_id = c.id GROUP BY c.class_code ORDER BY c.class_code"
  );
  const subjectCounts = Object.fromEntries(mappings.rows.map(row => [row.class_code, row.subject_count]));
  for (const code of ["BABY", "MIDDLE", "TOP"]) assert(subjectCounts[code] === 7, code + " must have seven nursery learning areas.");
  for (const code of ["P1", "P2", "P3"]) assert(subjectCounts[code] === 6, code + " must have six lower-primary subjects.");
  for (const code of ["P4", "P5", "P6", "P7"]) assert(subjectCounts[code] === 4, code + " must have four upper-primary subjects.");

  const balanceView = await pool.query(
    "SELECT reloptions FROM pg_class WHERE oid = 'cornhill_school.fee_obligation_balances'::regclass"
  );
  assert(balanceView.rows[0]?.reloptions?.includes("security_invoker=true") === true,
    "Fee balance view must use security-invoker semantics.");

  const feeItems = await pool.query("SELECT item_code FROM cornhill_school.fee_catalogue ORDER BY item_code");
  assert(feeItems.rows.length === 7, "Expected seven seeded fee catalogue items.");
  const financePermissions = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.permission_catalog WHERE category = 'finance'"
  );
  assert(financePermissions.rows[0]?.count === 8, "Expected eight finance permission codes.");

  const staffPermissions = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.permission_catalog WHERE category = 'staff'"
  );
  assert(staffPermissions.rows[0]?.count === 10, "Expected ten staff and attendance permission codes.");

  const publicAccess = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'cornhill_school'
        AND a.grantee = 0
        AND a.privilege_type IN ('USAGE', 'CREATE')
    ) AS public_access
  `);
  assert(publicAccess.rows[0]?.public_access === false, "PUBLIC must not access the local school schema.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const first = await client.query("INSERT INTO cornhill_school.learners (first_name, last_name, gender) VALUES ('CI', 'LearnerA', 'Female') RETURNING id, pupil_code");
    const second = await client.query("INSERT INTO cornhill_school.learners (first_name, last_name, gender) VALUES ('CI', 'LearnerB', 'Male') RETURNING id, pupil_code");
    assert(first.rows[0].pupil_code !== second.rows[0].pupil_code, "Generated pupil codes must be unique.");
    assert(/^CH-[0-9]{4}-[0-9]{6}$/.test(first.rows[0].pupil_code), "Generated pupil code must use the expected school format.");

    const immutableRejected = await expectPgError(
      client, "pupil_code_immutable_test",
      "UPDATE cornhill_school.learners SET pupil_code = 'CH-9999-999999' WHERE id = $1",
      [first.rows[0].id], "23514"
    );
    assert(immutableRejected, "Permanent pupil code must reject updates.");

    await client.query("UPDATE cornhill_school.learners SET lin = 'UG-CI-LIN-001' WHERE id = $1", [first.rows[0].id]);
    const duplicateLinRejected = await expectPgError(
      client, "duplicate_lin_test",
      "UPDATE cornhill_school.learners SET lin = 'UG-CI-LIN-001' WHERE id = $1",
      [second.rows[0].id], "23505"
    );
    assert(duplicateLinRejected, "LIN must be unique when supplied.");

    const guardian = await client.query(
      "INSERT INTO cornhill_school.guardian_contacts (learner_id, guardian_name, phone_e164, is_primary, sms_opt_in) VALUES ($1, 'CI Guardian', '+256700000001', true, true) RETURNING id",
      [first.rows[0].id]
    );
    const duplicatePrimaryRejected = await expectPgError(
      client, "duplicate_primary_guardian_test",
      "INSERT INTO cornhill_school.guardian_contacts (learner_id, guardian_name, phone_e164, is_primary) VALUES ($1, 'Second Guardian', '+256700000002', true)",
      [first.rows[0].id], "23505"
    );
    assert(duplicatePrimaryRejected, "Only one active primary guardian is allowed per learner.");

    await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, CURRENT_DATE, (SELECT id FROM cornhill_school.classes WHERE class_code = 'P1'))",
      [first.rows[0].id]
    );
    const duplicateActivePeriodRejected = await expectPgError(
      client, "duplicate_active_enrolment_test",
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, CURRENT_DATE, (SELECT id FROM cornhill_school.classes WHERE class_code = 'P2'))",
      [first.rows[0].id], "23505"
    );
    assert(duplicateActivePeriodRejected, "A learner cannot have two active enrolment periods.");

    const staff = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts (username, username_normalized, password_hash, account_status) VALUES ('ci-finance', 'ci-finance', '$argon2id$ci-test', 'active') RETURNING id"
    );
    const yearPrevious = await client.query(
      "INSERT INTO cornhill_school.academic_years (year_label, starts_on, ends_on, status) VALUES ('2025', '2025-01-01', '2025-12-31', 'Completed') RETURNING id"
    );
    const yearCurrent = await client.query(
      "INSERT INTO cornhill_school.academic_years (year_label, starts_on, ends_on, status) VALUES ('2026', '2026-01-01', '2026-12-31', 'Active') RETURNING id"
    );
    const termPrevious = await client.query(
      "INSERT INTO cornhill_school.academic_terms (academic_year_id, term_number, term_name, starts_on, ends_on, status) VALUES ($1, 1, 'Term 1', '2025-01-01', '2025-04-30', 'Completed') RETURNING id",
      [yearPrevious.rows[0].id]
    );
    const termCurrent = await client.query(
      "INSERT INTO cornhill_school.academic_terms (academic_year_id, term_number, term_name, starts_on, ends_on, status) VALUES ($1, 1, 'Term 1', '2026-01-01', '2026-04-30', 'Active') RETURNING id",
      [yearCurrent.rows[0].id]
    );
    const tuition = await client.query("SELECT id FROM cornhill_school.fee_catalogue WHERE item_code = 'TUITION'");
    const previousCharge = await client.query(
      "INSERT INTO cornhill_school.fee_obligations (learner_id, academic_term_id, fee_item_id, amount_ugx) VALUES ($1, $2, $3, 50000) RETURNING id",
      [first.rows[0].id, termPrevious.rows[0].id, tuition.rows[0].id]
    );
    const currentCharge = await client.query(
      "INSERT INTO cornhill_school.fee_obligations (learner_id, academic_term_id, fee_item_id, amount_ugx) VALUES ($1, $2, $3, 100000) RETURNING id",
      [first.rows[0].id, termCurrent.rows[0].id, tuition.rows[0].id]
    );
    const payment = await client.query(
      "INSERT INTO cornhill_school.payment_records (learner_id, amount_ugx, payment_method, received_by_staff_id, idempotency_key) VALUES ($1, 75000, 'cash', $2, gen_random_uuid()) RETURNING id",
      [first.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.payment_allocations (payment_id, fee_obligation_id, amount_ugx) VALUES ($1, $2, 50000), ($1, $3, 25000)",
      [payment.rows[0].id, previousCharge.rows[0].id, currentCharge.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.payment_records SET status = 'Posted', status_changed_by_staff_id = $2 WHERE id = $1",
      [payment.rows[0].id, staff.rows[0].id]
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");

    const receipt = await client.query(
      "SELECT receipt_number, receipt_data_snapshot FROM cornhill_school.payment_receipts WHERE payment_id = $1",
      [payment.rows[0].id]
    );
    assert(receipt.rowCount === 1, "A posted payment must issue exactly one receipt.");
    assert(/^CR-[0-9]{4}-[0-9]{7}$/.test(receipt.rows[0].receipt_number), "Receipt number format is invalid.");
    assert(receipt.rows[0].receipt_data_snapshot.pupil_code === first.rows[0].pupil_code, "Receipt must preserve the permanent pupil code.");
    assert(receipt.rows[0].receipt_data_snapshot.allocations.length === 2, "Receipt must show previous and current term allocations.");
    assert(receipt.rows[0].receipt_data_snapshot.allocations[0].balance_after_ugx === 0, "Previous-term debt must be reduced to zero.");
    assert(receipt.rows[0].receipt_data_snapshot.allocations[1].balance_after_ugx === 75000, "Current-term remaining balance must be shown.");
    const currentBalance = await client.query(
      "SELECT paid_ugx, balance_ugx FROM cornhill_school.fee_obligation_balances WHERE fee_obligation_id = $1",
      [currentCharge.rows[0].id]
    );
    assert(currentBalance.rows[0]?.paid_ugx === "25000" || currentBalance.rows[0]?.paid_ugx === 25000,
      "Fee balance view must include posted payments.");
    assert(currentBalance.rows[0]?.balance_ugx === "75000" || currentBalance.rows[0]?.balance_ugx === 75000,
      "Fee balance view must show the remaining amount.");
    const outbox = await client.query(
      "SELECT status, destination_phone FROM cornhill_school.payment_notification_outbox WHERE payment_id = $1",
      [payment.rows[0].id]
    );
    assert(outbox.rowCount === 1 && outbox.rows[0].status === "queued", "Only opted-in guardian contacts should receive a queued notification.");
    assert(outbox.rows[0].destination_phone === "+256700000001", "Notification must use the consented guardian phone.");

    const receiptMutationRejected = await expectPgError(
      client, "receipt_snapshot_immutable_test",
      "UPDATE cornhill_school.payment_receipts SET receipt_data_snapshot = '{}'::jsonb WHERE payment_id = $1",
      [payment.rows[0].id], "23514"
    );
    assert(receiptMutationRejected, "Issued receipt content must be immutable.");

    const postedPaymentEditRejected = await expectPgError(
      client, "posted_payment_immutable_test",
      "UPDATE cornhill_school.payment_records SET amount_ugx = 1 WHERE id = $1",
      [payment.rows[0].id], "23514"
    );
    assert(postedPaymentEditRejected, "Posted payment amount must be immutable.");

    await client.query(
      "UPDATE cornhill_school.learners SET is_bursary = true, bursary_fee_ugx = 30000 WHERE id = $1",
      [second.rows[0].id]
    );
    const bursaryItem = await client.query("SELECT id FROM cornhill_school.fee_catalogue WHERE item_code = 'BURSARY'");
    await client.query(
      "INSERT INTO cornhill_school.fee_obligations (learner_id, academic_term_id, fee_item_id, amount_ugx) VALUES ($1, $2, $3, 30000)",
      [second.rows[0].id, termCurrent.rows[0].id, bursaryItem.rows[0].id]
    );
    const standardTuitionRejected = await expectPgError(
      client, "bursary_standard_tuition_test",
      "INSERT INTO cornhill_school.fee_obligations (learner_id, academic_term_id, fee_item_id, amount_ugx) VALUES ($1, $2, $3, 100000)",
      [second.rows[0].id, termCurrent.rows[0].id, tuition.rows[0].id], "23514"
    );
    assert(standardTuitionRejected, "Bursary learners must not receive a normal full tuition obligation.");

    const wrongLearnerPayment = await client.query(
      "INSERT INTO cornhill_school.payment_records (learner_id, amount_ugx, payment_method, received_by_staff_id, idempotency_key) VALUES ($1, 1, 'cash', $2, gen_random_uuid()) RETURNING id",
      [second.rows[0].id, staff.rows[0].id]
    );
    const crossLearnerAllocationRejected = await expectPgError(
      client, "cross_learner_payment_allocation_test",
      "INSERT INTO cornhill_school.payment_allocations (payment_id, fee_obligation_id, amount_ugx) VALUES ($1, $2, 1)",
      [wrongLearnerPayment.rows[0].id, currentCharge.rows[0].id], "23514"
    );
    assert(crossLearnerAllocationRejected, "A payment cannot be allocated to another learner's account.");

    const overpayment = await client.query(
      "INSERT INTO cornhill_school.payment_records (learner_id, amount_ugx, payment_method, received_by_staff_id, idempotency_key) VALUES ($1, 80000, 'cash', $2, gen_random_uuid()) RETURNING id",
      [first.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.payment_allocations (payment_id, fee_obligation_id, amount_ugx) VALUES ($1, $2, 80000)",
      [overpayment.rows[0].id, currentCharge.rows[0].id]
    );
    const overpaymentRejected = await expectPgError(
      client, "fee_obligation_overpayment_test",
      "UPDATE cornhill_school.payment_records SET status = 'Posted' WHERE id = $1",
      [overpayment.rows[0].id], "23514"
    );
    assert(overpaymentRejected, "Posted allocations must not exceed the fee obligation.");

    const approver = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts (username, username_normalized, password_hash, account_status) VALUES ('ci-approver', 'ci-approver', '$argon2id$ci-test', 'active') RETURNING id"
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_profiles (staff_account_id, staff_number, legal_name, job_title, phone_e164) VALUES ($1, 'CI-001', 'CI Finance Officer', 'Bursar', '+256700000003')",
      [staff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_employment_terms (staff_account_id, starts_on, contract_type, salary_basis, base_salary_ugx, approved_by_staff_id) VALUES ($1, '2026-01-01', 'Permanent', 'Monthly', 1000000, $2)",
      [staff.rows[0].id, approver.rows[0].id]
    );
    const device = await client.query(
      "INSERT INTO cornhill_school.attendance_devices (device_code, device_name, manufacturer, model, connection_type) VALUES ('CI-USB-01', 'CI Attendance Device', 'Test Manufacturer', 'Test Model', 'USB') RETURNING id"
    );
    const batch = await client.query(
      "INSERT INTO cornhill_school.attendance_import_batches (device_id, source_name, source_checksum_sha256, imported_by_staff_id, rows_received, rows_accepted, rows_rejected, import_status, completed_at) VALUES ($1, 'ci-attendance.csv', repeat('b', 64), $2, 1, 1, 0, 'Completed', now()) RETURNING id",
      [device.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.attendance_events (import_batch_id, device_id, staff_account_id, device_staff_identifier, external_event_id, event_type, occurred_at, source_type, review_status, reviewed_by_staff_id, reviewed_at) VALUES ($1, $2, $3, 'STAFF-001', 'CI-EVENT-001', 'Clock In', now(), 'Device', 'Verified', $4, now())",
      [batch.rows[0].id, device.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const attendanceDay = await client.query(
      "INSERT INTO cornhill_school.attendance_days (staff_account_id, work_date, first_clock_in, last_clock_out, expected_minutes, worked_minutes, attendance_status, calculation_source, verified_by_staff_id, verified_at) VALUES ($1, CURRENT_DATE, now() - interval '4 hours', now(), 480, 240, 'Half Day', 'Verified Device Events', $2, now()) RETURNING id",
      [staff.rows[0].id, approver.rows[0].id]
    );
    const pendingAdjustment = await client.query(
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id) VALUES ($1, 'Worked Minutes', '{\"worked_minutes\":300}'::jsonb, 'Verify attendance import time', $2) RETURNING id",
      [attendanceDay.rows[0].id, staff.rows[0].id]
    );
    const samePersonApprovalRejected = await expectPgError(
      client, "attendance_adjustment_self_approval_test",
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id, adjustment_status, approved_by_staff_id, approved_at) VALUES ($1, 'Worked Minutes', '{\"worked_minutes\":300}'::jsonb, 'Self approval should fail', $2, 'Approved', $2, now())",
      [attendanceDay.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(samePersonApprovalRejected, "Attendance adjustment cannot be approved by its requester.");

    const approvedAdjustment = await client.query(
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id, adjustment_status, approved_by_staff_id, approved_at) VALUES ($1, 'Worked Minutes', '{\"worked_minutes\":300}'::jsonb, 'Approved attendance correction', $2, 'Approved', $3, now()) RETURNING id",
      [attendanceDay.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const payrollPeriod = await client.query(
      "INSERT INTO cornhill_school.payroll_periods (period_code, starts_on, ends_on, payment_date) VALUES ('2026-NOV', '2026-11-01', '2026-11-30', '2026-12-01') RETURNING id"
    );
    const payrollRun = await client.query(
      "INSERT INTO cornhill_school.payroll_runs (payroll_period_id, prepared_by_staff_id) VALUES ($1, $2) RETURNING id",
      [payrollPeriod.rows[0].id, staff.rows[0].id]
    );
    await client.query("SET CONSTRAINTS cornhill_school.payroll_line_item_totals_valid, cornhill_school.payroll_item_totals_valid DEFERRED");
    const payrollLine = await client.query(
      "INSERT INTO cornhill_school.payroll_lines (payroll_run_id, staff_account_id, base_salary_ugx, allowances_ugx, deductions_ugx) VALUES ($1, $2, 1000000, 100000, 10000) RETURNING id, gross_pay_ugx, net_pay_ugx",
      [payrollRun.rows[0].id, staff.rows[0].id]
    );
    const pendingAttendanceDeductionRejected = await expectPgError(
      client, "pending_attendance_payroll_item_test",
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, source_attendance_adjustment_id, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Deduction', 'ATTENDANCE', 'Unapproved attendance adjustment', 10000, $2, $3, $4, now())",
      [payrollLine.rows[0].id, pendingAdjustment.rows[0].id, staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(pendingAttendanceDeductionRejected, "Pending attendance adjustments cannot be used in payroll.");
    await client.query(
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Allowance', 'RESPONSIBILITY', 'Approved responsibility allowance', 100000, $2, $3, now())",
      [payrollLine.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, source_attendance_adjustment_id, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Deduction', 'ATTENDANCE', 'Approved attendance adjustment', 10000, $2, $3, $4, now())",
      [payrollLine.rows[0].id, approvedAdjustment.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    await client.query("SET CONSTRAINTS cornhill_school.payroll_line_item_totals_valid, cornhill_school.payroll_item_totals_valid IMMEDIATE");
    assert(String(payrollLine.rows[0].gross_pay_ugx) === "1100000", "Payroll gross pay calculation is incorrect.");
    assert(String(payrollLine.rows[0].net_pay_ugx) === "1090000", "Payroll net pay calculation is incorrect.");

    await client.query(
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Reviewed', reviewed_by_staff_id = $2 WHERE id = $1",
      [payrollRun.rows[0].id, staff.rows[0].id]
    );
    const reviewedLineEditRejected = await expectPgError(
      client, "reviewed_payroll_line_edit_test",
      "UPDATE cornhill_school.payroll_lines SET base_salary_ugx = 1 WHERE id = $1",
      [payrollLine.rows[0].id], "23514"
    );
    assert(reviewedLineEditRejected, "Reviewed payroll lines must be locked.");
    const directPostingRejected = await expectPgError(
      client, "direct_payroll_posting_test",
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Posted', posted_by_staff_id = $2 WHERE id = $1",
      [payrollRun.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(directPostingRejected, "Payroll cannot skip approval.");
    const preparerApprovalRejected = await expectPgError(
      client, "payroll_preparer_self_approval_test",
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Approved', approved_by_staff_id = $2 WHERE id = $1",
      [payrollRun.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(preparerApprovalRejected, "Payroll preparer cannot approve their own run.");
    await client.query(
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Approved', approved_by_staff_id = $2 WHERE id = $1",
      [payrollRun.rows[0].id, approver.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Posted', posted_by_staff_id = $2 WHERE id = $1",
      [payrollRun.rows[0].id, staff.rows[0].id]
    );
    const postedPayroll = await client.query(
      "SELECT run_status FROM cornhill_school.payroll_runs WHERE id = $1",
      [payrollRun.rows[0].id]
    );
    assert(postedPayroll.rows[0]?.run_status === "Posted", "Payroll should post only after approval.");

    await client.query("ROLLBACK");
    console.log("Local school, academic, finance, staff, attendance and payroll schemas verified: thirty-one tables, ten classes, fifteen subjects, seven fee items, 32 permission codes, permanent pupil codes, LIN uniqueness and class-specific subject mappings.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
