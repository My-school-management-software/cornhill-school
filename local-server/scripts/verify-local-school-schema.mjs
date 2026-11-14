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
    "bank_accounts",
    "bank_ledger",
    "bank_transaction_events",
    "bank_transactions",
    "class_subjects",
    "classes",
    "enrolment_periods",
    "evidence_capture_events",
    "evidence_capture_files",
    "evidence_capture_requests",
    "evidence_capture_reviews",
    "expense_categories",
    "expense_ledger",
    "expense_request_events",
    "expense_requests",
    "fee_catalogue",
    "fee_obligations",
    "finance_audit_events",
    "finance_operator_limits",
    "guardian_contacts",
    "learner_marks",
    "learners",
    "payment_allocations",
    "payment_credit_allocation_batches",
    "payment_credit_allocations",
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
  assert(permissionCount.rows[0]?.count === 43, "Expected 43 unique permission catalogue entries after finance workflow permissions are added.");

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
  assert(financePermissions.rows[0]?.count === 16, "Expected sixteen finance permission codes, including expense and banking workflow controls.");

  const staffPermissions = await pool.query(
    "SELECT count(*)::int AS count FROM cornhill_auth.permission_catalog WHERE permission_code LIKE 'staff.%'"
  );
  assert(staffPermissions.rows[0]?.count === 11, "Expected eleven staff and attendance permission codes.");

  const saturdayPolicy = await pool.query(
    "SELECT saturday_start_time::text, saturday_end_time::text FROM cornhill_school.staff_attendance_policy_settings WHERE id = true"
  );
  assert(saturdayPolicy.rows[0]?.saturday_start_time === "08:00:00", "Saturday attendance must start at 08:00.");
  assert(saturdayPolicy.rows[0]?.saturday_end_time === "13:00:00", "Saturday attendance must end at 13:00.");

  const specialSessionPolicy = await pool.query(
    "SELECT prep_deductions_enabled FROM cornhill_school.staff_attendance_policy_settings WHERE id = true"
  );
  assert(specialSessionPolicy.rows[0]?.prep_deductions_enabled === false,
    "Special-session salary deductions must remain disabled by default.");

  const specialSessionColumns = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'cornhill_school' AND table_name = 'staff_scheduled_session_attendance' AND column_name IN ('review_deadline_at','headteacher_statement','director_decision','approved_deduction_ugx','payroll_line_item_id') ORDER BY column_name"
  );
  assert(specialSessionColumns.rows.length === 5,
    "Special-session attendance must include review, statement, decision, deduction and payroll-link fields.");

  const specialSessionGuard = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'special_session_review_guard' AND NOT tgisinternal) AS installed"
  );
  assert(specialSessionGuard.rows[0]?.installed === true,
    "Special-session review guard must be installed.");

  const scheduledSessionAssignmentGuard = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scheduled_session_attendance_assignment_guard' AND NOT tgisinternal) AS installed"
  );
  assert(scheduledSessionAssignmentGuard.rows[0]?.installed === true,
    "Special-session attendance must require approved sessions and explicit staff assignment.");
  const scheduledSessionAssignmentDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_scheduled_session_attendance_assignment()'::regprocedure) AS definition"
  );
  const assignmentGuardDefinition = scheduledSessionAssignmentDefinition.rows[0]?.definition ?? "";
  assert(assignmentGuardDefinition.includes("session_status IS DISTINCT FROM 'Approved'")
    && assignmentGuardDefinition.includes("session_published IS DISTINCT FROM true")
    && assignmentGuardDefinition.includes("a.staff_account_id = NEW.staff_account_id"),
    "Special-session attendance guard must check approval, publication and assigned staff identity.");

  const specialSessionAssignmentIntegrityTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'special_session_assignment_guard' AND NOT tgisinternal) AS installed"
  );
  assert(specialSessionAssignmentIntegrityTrigger.rows[0]?.installed === true,
    "Special-session assignments must be protected against inactive staff and post-attendance changes.");
  const specialSessionAssignmentIntegrityDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_special_session_assignment()'::regprocedure) AS definition"
  );
  const assignmentIntegrityDefinition = specialSessionAssignmentIntegrityDefinition.rows[0]?.definition ?? "";
  assert(assignmentIntegrityDefinition.includes("staff_status IS DISTINCT FROM 'active'")
    && assignmentIntegrityDefinition.includes("session_status = 'Cancelled'")
    && assignmentIntegrityDefinition.includes("A staff assignment cannot be removed after attendance has been recorded"),
    "Special-session assignment integrity must enforce active staff, non-cancelled sessions and attendance history.");

  const specialSessionGuardDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_special_session_review()'::regprocedure) AS definition"
  );
  const guardDefinition = specialSessionGuardDefinition.rows[0]?.definition ?? "";
  assert(guardDefinition.includes("r.role_code = 'director'") && guardDefinition.includes("a.account_status = 'active'"),
    "Special-session decisions must be restricted to active Director role holders.");
  assert(guardDefinition.includes("r.role_code IN ('headteacher', 'director_of_studies')"),
    "Special-session statements must be authored by an active Headteacher or Director of Studies.");
  assert(guardDefinition.includes("i.amount_ugx") && guardDefinition.includes("linked_item_amount IS DISTINCT FROM NEW.approved_deduction_ugx"),
    "Special-session payroll linkage must validate the exact deduction amount.");

  const attendanceEventReviewTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_event_review_guard' AND NOT tgisinternal) AS installed"
  );
  assert(attendanceEventReviewTrigger.rows[0]?.installed === true,
    "Imported attendance events must have immutable evidence and review protection.");
  const attendanceEventReviewDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_event_review()'::regprocedure) AS definition"
  );
  const attendanceEventReviewGuard = attendanceEventReviewDefinition.rows[0]?.definition ?? "";
  assert(attendanceEventReviewGuard.includes("Imported attendance event evidence is immutable")
    && attendanceEventReviewGuard.includes("Attendance event evidence cannot be deleted")
    && attendanceEventReviewGuard.includes("Attendance event review decisions are final")
    && attendanceEventReviewGuard.includes("Staff cannot review their own attendance event")
    && attendanceEventReviewGuard.includes("reviewer_status IS DISTINCT FROM 'active'"),
    "Attendance event evidence must be immutable and independently reviewed by active staff.");

  const attendanceAdjustmentHistoryTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_adjustment_history_guard' AND NOT tgisinternal) AS installed"
  );
  assert(attendanceAdjustmentHistoryTrigger.rows[0]?.installed === true,
    "Attendance adjustment review history protection must be installed.");
  const attendanceAdjustmentHistoryDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_adjustment_history()'::regprocedure) AS definition"
  );
  const adjustmentHistoryDefinition = attendanceAdjustmentHistoryDefinition.rows[0]?.definition ?? "";
  assert(adjustmentHistoryDefinition.includes("Submitted attendance adjustment details are immutable")
    && adjustmentHistoryDefinition.includes("An attendance adjustment decision is final and cannot be rewritten")
    && adjustmentHistoryDefinition.includes("Attendance adjustment requests cannot be deleted"),
    "Attendance adjustment requests and decisions must preserve immutable review history.");

  const incidentGuardTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_incident_decision_guard' AND NOT tgisinternal) AS installed"
  );
  assert(incidentGuardTrigger.rows[0]?.installed === true,
    "Ordinary attendance incident authority guard must be installed.");
  const incidentGuardResult = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_incident_decision()'::regprocedure) AS definition"
  );
  const incidentGuardDefinition = incidentGuardResult.rows[0]?.definition ?? "";
  assert(incidentGuardDefinition.includes("r.role_code IN ('headteacher', 'director_of_studies')")
    && incidentGuardDefinition.includes("r.role_code = 'director'")
    && incidentGuardDefinition.includes("A recorded Headteacher/DOS statement is immutable")
    && incidentGuardDefinition.includes("Only an active Director may decide an attendance incident"),
    "Ordinary attendance incidents must enforce active leadership authority and immutable review records.");

  const incidentIdentityTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_incident_identity_guard' AND NOT tgisinternal) AS installed"
  );
  assert(incidentIdentityTrigger.rows[0]?.installed === true,
    "Attendance incident identity and audit protection must be installed.");
  const incidentIdentityResult = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_incident_identity()'::regprocedure) AS definition"
  );
  const incidentIdentityDefinition = incidentIdentityResult.rows[0]?.definition ?? "";
  assert(incidentIdentityDefinition.includes("NEW.staff_account_id IS DISTINCT FROM OLD.staff_account_id")
    && incidentIdentityDefinition.includes("NEW.attendance_date IS DISTINCT FROM OLD.attendance_date")
    && incidentIdentityDefinition.includes("Attendance incidents cannot be deleted"),
    "Attendance incident identity and audit history must be immutable.");

  const payrollAuditAppendOnlyTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payroll_audit_events_append_only' AND NOT tgisinternal) AS installed"
  );
  assert(payrollAuditAppendOnlyTrigger.rows[0]?.installed === true,
    "Payroll audit history must be append-only.");
  const payrollAuditAppendOnlyDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.prevent_payroll_audit_event_mutation()'::regprocedure) AS definition"
  );
  assert((payrollAuditAppendOnlyDefinition.rows[0]?.definition ?? "").includes(
    "Payroll audit events are append-only and cannot be changed or deleted"
  ), "Payroll audit records must reject updates and deletes.");

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

    const reviewedAdjustment = await client.query(
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id) VALUES ($1, 'Worked Minutes', '{\"worked_minutes\":360}'::jsonb, 'Second attendance correction review', $2) RETURNING id",
      [attendanceDay.rows[0].id, staff.rows[0].id]
    );
    const adjustmentProposalRewriteRejected = await expectPgError(
      client, "attendance_adjustment_proposal_immutable_test",
      "UPDATE cornhill_school.attendance_adjustments SET proposed_value = '{\"worked_minutes\":420}'::jsonb WHERE id = $1",
      [reviewedAdjustment.rows[0].id], "23514"
    );
    assert(adjustmentProposalRewriteRejected, "Submitted attendance correction details cannot be rewritten.");
    await client.query(
      "UPDATE cornhill_school.attendance_adjustments SET adjustment_status = 'Approved', approved_by_staff_id = $2, approved_at = now() WHERE id = $1",
      [reviewedAdjustment.rows[0].id, approver.rows[0].id]
    );
    const adjustmentDecisionRewriteRejected = await expectPgError(
      client, "attendance_adjustment_decision_immutable_test",
      "UPDATE cornhill_school.attendance_adjustments SET adjustment_status = 'Rejected' WHERE id = $1",
      [reviewedAdjustment.rows[0].id], "23514"
    );
    assert(adjustmentDecisionRewriteRejected, "Attendance correction decisions cannot be changed after review.");
    const adjustmentDeleteRejected = await expectPgError(
      client, "attendance_adjustment_delete_history_test",
      "DELETE FROM cornhill_school.attendance_adjustments WHERE id = $1",
      [reviewedAdjustment.rows[0].id], "23514"
    );
    assert(adjustmentDeleteRejected, "Attendance correction review history cannot be deleted.");

    const incidentLeader = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts (username, username_normalized, password_hash, account_status) VALUES ('ci-incident-leader', 'ci-incident-leader', '$argon2id$ci-test', 'active') RETURNING id"
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code, assigned_by) VALUES ($1, 'director_of_studies', $2), ($1, 'director', $2)",
      [incidentLeader.rows[0].id, staff.rows[0].id]
    );
    const incident = await client.query(
      "INSERT INTO cornhill_school.staff_attendance_incidents (attendance_day_id, staff_account_id, attendance_date, incident_type) VALUES ($1, $2, CURRENT_DATE, 'late_clock_in') RETURNING id",
      [attendanceDay.rows[0].id, staff.rows[0].id]
    );
    const ordinaryIncidentStatementRejected = await expectPgError(
      client, "ordinary_incident_statement_authority_test",
      "UPDATE cornhill_school.staff_attendance_incidents SET headteacher_statement = 'Ordinary staff cannot submit this', headteacher_statement_by = $2, headteacher_statement_at = now() WHERE id = $1",
      [incident.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(ordinaryIncidentStatementRejected, "Ordinary staff cannot author an attendance incident leadership statement.");
    await client.query(
      "UPDATE cornhill_school.staff_attendance_incidents SET headteacher_statement = 'DOS reviewed the attendance record', headteacher_statement_by = $2, headteacher_statement_at = now() WHERE id = $1",
      [incident.rows[0].id, incidentLeader.rows[0].id]
    );
    await client.query("ALTER TABLE cornhill_school.staff_attendance_incidents DISABLE TRIGGER attendance_incident_decision_guard");
    await client.query(
      "UPDATE cornhill_school.staff_attendance_incidents SET review_deadline_at = now() - interval '1 minute' WHERE id = $1",
      [incident.rows[0].id]
    );
    await client.query("ALTER TABLE cornhill_school.staff_attendance_incidents ENABLE TRIGGER attendance_incident_decision_guard");
    const ordinaryIncidentDecisionRejected = await expectPgError(
      client, "ordinary_incident_director_authority_test",
      "UPDATE cornhill_school.staff_attendance_incidents SET director_decision = 'excused', director_decision_by = $2, director_decision_at = now(), status = 'Excused' WHERE id = $1",
      [incident.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(ordinaryIncidentDecisionRejected, "Ordinary staff cannot decide an attendance incident.");
    await client.query(
      "UPDATE cornhill_school.staff_attendance_incidents SET director_decision = 'excused', director_decision_by = $2, director_decision_at = now(), status = 'Excused' WHERE id = $1",
      [incident.rows[0].id, incidentLeader.rows[0].id]
    );
    const approvedIncident = await client.query(
      "SELECT status, director_decision, director_decision_by FROM cornhill_school.staff_attendance_incidents WHERE id = $1",
      [incident.rows[0].id]
    );
    assert(approvedIncident.rows[0]?.status === "Excused"
      && approvedIncident.rows[0]?.director_decision === "excused"
      && approvedIncident.rows[0]?.director_decision_by === incidentLeader.rows[0].id,
      "An active Director should be able to excuse an attendance incident after the review window.");
    const incidentStaffChangeRejected = await expectPgError(
      client, "attendance_incident_staff_identity_test",
      "UPDATE cornhill_school.staff_attendance_incidents SET staff_account_id = $2 WHERE id = $1",
      [incident.rows[0].id, incidentLeader.rows[0].id], "23514"
    );
    assert(incidentStaffChangeRejected, "Attendance incident staff identity cannot be reassigned.");
    const incidentDateChangeRejected = await expectPgError(
      client, "attendance_incident_date_identity_test",
      "UPDATE cornhill_school.staff_attendance_incidents SET attendance_date = CURRENT_DATE + 1 WHERE id = $1",
      [incident.rows[0].id], "23514"
    );
    assert(incidentDateChangeRejected, "Attendance incident date cannot be rewritten.");
    const incidentDeleteRejected = await expectPgError(
      client, "attendance_incident_delete_audit_test",
      "DELETE FROM cornhill_school.staff_attendance_incidents WHERE id = $1",
      [incident.rows[0].id], "23514"
    );
    assert(incidentDeleteRejected, "Attendance incident review history cannot be deleted.");
    const samePersonApprovalRejected = await expectPgError(
      client, "attendance_adjustment_self_approval_test",
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id, adjustment_status, approved_by_staff_id, approved_at) VALUES ($1, 'Worked Minutes', '{\"worked_minutes\":300}'::jsonb, 'Self approval should fail', $2, 'Approved', $2, now())",
      [attendanceDay.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(samePersonApprovalRejected, "Attendance adjustment cannot be approved by its requester.");

    const approvedAdjustment = await client.query(
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id) VALUES ($1, 'Worked Minutes', '{\"worked_minutes\":300}'::jsonb, 'Approved attendance correction', $2) RETURNING id",
      [attendanceDay.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.attendance_adjustments SET adjustment_status = 'Approved', approved_by_staff_id = $2, approved_at = now() WHERE id = $1",
      [approvedAdjustment.rows[0].id, approver.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_salary_agreements (staff_account_id, salary_basis, base_salary_ugx, daily_rate_ugx, effective_from, effective_to, approved_by_staff_id) VALUES ($1, 'Monthly', 1000000, 50000, '2026-01-01', '2026-12-31', $2)",
      [staff.rows[0].id, approver.rows[0].id]
    );
    const prepSession = await client.query(
      "INSERT INTO cornhill_school.staff_prep_sessions (prep_date, title, start_time, end_time, class_name, approval_status, is_published, director_approved_by, director_approved_at, created_by_staff_id) VALUES (CURRENT_DATE, 'CI special session', '06:30', '07:30', 'P7', 'Approved', true, $1, now(), $1) RETURNING id",
      [approver.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_prep_assignments (prep_session_id, staff_account_id, assigned_by_staff_id) VALUES ($1, $2, $3)",
      [prepSession.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const unassignedAttendanceRejected = await expectPgError(
      client, "special_session_unassigned_staff_test",
      "INSERT INTO cornhill_school.staff_scheduled_session_attendance (session_id, staff_account_id) VALUES ($1, $2)",
      [prepSession.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(unassignedAttendanceRejected, "Staff not assigned to a special session cannot have attendance recorded for it.");
    const draftSession = await client.query(
      "INSERT INTO cornhill_school.staff_prep_sessions (prep_date, title, start_time, end_time, class_name, created_by_staff_id) VALUES (CURRENT_DATE, 'CI draft session', '07:00', '08:00', 'P7', $1) RETURNING id",
      [approver.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_prep_assignments (prep_session_id, staff_account_id, assigned_by_staff_id) VALUES ($1, $2, $3)",
      [draftSession.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const draftAttendanceRejected = await expectPgError(
      client, "special_session_draft_attendance_test",
      "INSERT INTO cornhill_school.staff_scheduled_session_attendance (session_id, staff_account_id) VALUES ($1, $2)",
      [draftSession.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(draftAttendanceRejected, "Draft or unpublished special sessions cannot accept attendance.");
    const specialAttendance = await client.query(
      "INSERT INTO cornhill_school.staff_scheduled_session_attendance (session_id, staff_account_id) VALUES ($1, $2) RETURNING id",
      [prepSession.rows[0].id, staff.rows[0].id]
    );
    const assignmentRemovalRejected = await expectPgError(
      client, "special_session_assignment_removal_test",
      "DELETE FROM cornhill_school.staff_prep_assignments WHERE prep_session_id = $1 AND staff_account_id = $2",
      [prepSession.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(assignmentRemovalRejected, "A staff assignment cannot be removed after attendance is recorded.");
    const inactiveAssignee = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts (username, username_normalized, password_hash, account_status) VALUES ('ci-inactive-assignee', 'ci-inactive-assignee', '$argon2id$ci-test', 'disabled') RETURNING id"
    );
    const inactiveAssignmentRejected = await expectPgError(
      client, "special_session_inactive_assignee_test",
      "INSERT INTO cornhill_school.staff_prep_assignments (prep_session_id, staff_account_id, assigned_by_staff_id) VALUES ($1, $2, $3)",
      [prepSession.rows[0].id, inactiveAssignee.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(inactiveAssignmentRejected, "Inactive staff accounts cannot be assigned to special sessions.");
    const unauthorizedStatementRejected = await expectPgError(
      client, "special_session_statement_authority_test",
      "UPDATE cornhill_school.staff_scheduled_session_attendance SET headteacher_statement = 'CI review statement', headteacher_statement_by = $2, headteacher_statement_at = now() WHERE id = $1",
      [specialAttendance.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(unauthorizedStatementRejected, "An ordinary staff account cannot author the Headteacher/DOS special-session statement.");
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code, assigned_by) VALUES ($1, 'director_of_studies', $2)",
      [approver.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.staff_scheduled_session_attendance SET headteacher_statement = 'CI review statement', headteacher_statement_by = $2, headteacher_statement_at = now() WHERE id = $1",
      [specialAttendance.rows[0].id, approver.rows[0].id]
    );
    const authorisedStatement = await client.query(
      "SELECT headteacher_statement, headteacher_statement_by FROM cornhill_school.staff_scheduled_session_attendance WHERE id = $1",
      [specialAttendance.rows[0].id]
    );
    assert(authorisedStatement.rows[0]?.headteacher_statement === "CI review statement"
      && authorisedStatement.rows[0]?.headteacher_statement_by === approver.rows[0].id,
      "An active Director of Studies account should be able to author the special-session statement.");

    await client.query("ALTER TABLE cornhill_school.staff_scheduled_session_attendance DISABLE TRIGGER special_session_review_guard");
    await client.query(
      "UPDATE cornhill_school.staff_scheduled_session_attendance SET review_deadline_at = now() - interval '1 minute' WHERE id = $1",
      [specialAttendance.rows[0].id]
    );
    await client.query("ALTER TABLE cornhill_school.staff_scheduled_session_attendance ENABLE TRIGGER special_session_review_guard");
    const unauthorizedDirectorDecisionRejected = await expectPgError(
      client, "special_session_director_authority_test",
      "UPDATE cornhill_school.staff_scheduled_session_attendance SET director_decision = 'excused', director_decision_by = $2, director_decision_at = now() WHERE id = $1",
      [specialAttendance.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(unauthorizedDirectorDecisionRejected, "An ordinary staff account cannot decide a special-session attendance case.");
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code, assigned_by) VALUES ($1, 'director', $2)",
      [approver.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.staff_scheduled_session_attendance SET director_decision = 'excused', director_decision_by = $2, director_decision_at = now() WHERE id = $1",
      [specialAttendance.rows[0].id, approver.rows[0].id]
    );
    const authorisedDirectorDecision = await client.query(
      "SELECT director_decision, director_decision_by FROM cornhill_school.staff_scheduled_session_attendance WHERE id = $1",
      [specialAttendance.rows[0].id]
    );
    assert(authorisedDirectorDecision.rows[0]?.director_decision === "excused"
      && authorisedDirectorDecision.rows[0]?.director_decision_by === approver.rows[0].id,
      "An active Director account should be able to record an excused special-session decision.");

    const overlappingSalaryAgreementRejected = await expectPgError(
      client, "overlapping_salary_agreement_test",
      "INSERT INTO cornhill_school.staff_salary_agreements (staff_account_id, salary_basis, base_salary_ugx, daily_rate_ugx, effective_from, effective_to, approved_by_staff_id) VALUES ($1, 'Monthly', 1100000, 55000, '2026-06-01', '2027-01-01', $2)",
      [staff.rows[0].id, approver.rows[0].id], "23P01"
    );
    assert(overlappingSalaryAgreementRejected, "Active salary agreements for one staff member must not overlap.");

    const workSchedule = await client.query(
      "INSERT INTO cornhill_school.staff_work_schedules (schedule_code, schedule_name, start_time, end_time) VALUES ('CI-DAY', 'CI Day Schedule', '08:00', '17:00') RETURNING id"
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_attendance_schedule_assignments (staff_account_id, schedule_id, starts_on, ends_on, assigned_by_staff_id) VALUES ($1, $2, '2026-01-01', '2026-12-31', $3)",
      [staff.rows[0].id, workSchedule.rows[0].id, approver.rows[0].id]
    );
    const overlappingScheduleRejected = await expectPgError(
      client, "overlapping_staff_schedule_test",
      "INSERT INTO cornhill_school.staff_attendance_schedule_assignments (staff_account_id, schedule_id, starts_on, ends_on, assigned_by_staff_id) VALUES ($1, $2, '2026-12-01', '2027-01-31', $3)",
      [staff.rows[0].id, workSchedule.rows[0].id, approver.rows[0].id], "23P01"
    );
    assert(overlappingScheduleRejected, "A staff member cannot have overlapping attendance schedule assignments.");

    const nextScheduleAssignment = await client.query(
      "INSERT INTO cornhill_school.staff_attendance_schedule_assignments (staff_account_id, schedule_id, starts_on, ends_on, assigned_by_staff_id) VALUES ($1, $2, '2027-01-01', NULL, $3) RETURNING id",
      [staff.rows[0].id, workSchedule.rows[0].id, approver.rows[0].id]
    );
    const scheduleIdentityChangeRejected = await expectPgError(
      client, "schedule_assignment_identity_change_test",
      "UPDATE cornhill_school.staff_attendance_schedule_assignments SET staff_account_id = $2 WHERE id = $1",
      [nextScheduleAssignment.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(scheduleIdentityChangeRejected, "A schedule assignment cannot be reassigned to a different staff account.");

    const payrollPeriod = await client.query(
      "INSERT INTO cornhill_school.payroll_periods (period_code, starts_on, ends_on, payment_date) VALUES ('2026-NOV', '2026-11-01', '2026-11-30', '2026-12-01') RETURNING id"
    );
    const overlappingPayrollPeriodRejected = await expectPgError(
      client, "overlapping_payroll_period_test",
      "INSERT INTO cornhill_school.payroll_periods (period_code, starts_on, ends_on) VALUES ('2026-NOV2', '2026-11-30', '2026-12-31')",
      [], "23P01"
    );
    assert(overlappingPayrollPeriodRejected, "Payroll periods must not overlap.");
    await client.query(
      "INSERT INTO cornhill_school.payroll_periods (period_code, starts_on, ends_on) VALUES ('2026-DEC', '2026-12-01', '2026-12-31')"
    );

    const payrollRun = await client.query(
      "INSERT INTO cornhill_school.payroll_runs (payroll_period_id, prepared_by_staff_id) VALUES ($1, $2) RETURNING id",
      [payrollPeriod.rows[0].id, staff.rows[0].id]
    );
    const payrollAudit = await client.query(
      "INSERT INTO cornhill_school.payroll_audit_events (payroll_run_id, actor_staff_id, event_code, reason, details) VALUES ($1, $2, 'payroll.prepared', 'CI audit immutability check', '{\"source\":\"schema-verifier\"}'::jsonb) RETURNING id",
      [payrollRun.rows[0].id, staff.rows[0].id]
    );
    const payrollAuditUpdateRejected = await expectPgError(
      client, "payroll_audit_update_immutable_test",
      "UPDATE cornhill_school.payroll_audit_events SET reason = 'rewritten audit evidence' WHERE id = $1",
      [payrollAudit.rows[0].id], "23514"
    );
    assert(payrollAuditUpdateRejected, "Payroll audit evidence cannot be rewritten.");
    const payrollAuditDeleteRejected = await expectPgError(
      client, "payroll_audit_delete_immutable_test",
      "DELETE FROM cornhill_school.payroll_audit_events WHERE id = $1",
      [payrollAudit.rows[0].id], "23514"
    );
    assert(payrollAuditDeleteRejected, "Payroll audit evidence cannot be deleted.");
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

    const postedHeaderEditRejected = await expectPgError(
      client, "posted_payroll_header_edit_test",
      "UPDATE cornhill_school.payroll_runs SET status_reason = 'tampered posted header' WHERE id = $1",
      [payrollRun.rows[0].id], "23514"
    );
    assert(postedHeaderEditRejected, "Posted payroll headers cannot be edited in place.");
    const postedIdentityRewriteRejected = await expectPgError(
      client, "posted_payroll_identity_rewrite_test",
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Reversed', posted_by_staff_id = $2, status_reason = 'attempted identity rewrite' WHERE id = $1",
      [payrollRun.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(postedIdentityRewriteRejected, "A payroll reversal cannot rewrite the original posting identity.");
    const postedRunDeleteRejected = await expectPgError(
      client, "posted_payroll_delete_test",
      "DELETE FROM cornhill_school.payroll_runs WHERE id = $1",
      [payrollRun.rows[0].id], "23514"
    );
    assert(postedRunDeleteRejected, "Posted payroll runs cannot be deleted.");
    await client.query(
      "UPDATE cornhill_school.payroll_runs SET run_status = 'Reversed', status_reason = 'CI verified payroll reversal' WHERE id = $1",
      [payrollRun.rows[0].id]
    );
    const reversedPayroll = await client.query(
      "SELECT run_status, reversed_at, status_reason FROM cornhill_school.payroll_runs WHERE id = $1",
      [payrollRun.rows[0].id]
    );
    assert(reversedPayroll.rows[0]?.run_status === "Reversed" && reversedPayroll.rows[0]?.reversed_at,
      "An approved posted payroll run should reverse with a database-assigned timestamp.");
    const reversedRunEditRejected = await expectPgError(
      client, "reversed_payroll_edit_test",
      "UPDATE cornhill_school.payroll_runs SET status_reason = 'rewritten reversal reason' WHERE id = $1",
      [payrollRun.rows[0].id], "23514"
    );
    assert(reversedRunEditRejected, "Reversed payroll history must be immutable.");
    const reversedRunDeleteRejected = await expectPgError(
      client, "reversed_payroll_delete_test",
      "DELETE FROM cornhill_school.payroll_runs WHERE id = $1",
      [payrollRun.rows[0].id], "23514"
    );
    assert(reversedRunDeleteRejected, "Reversed payroll history cannot be deleted.");

    await client.query("ROLLBACK");
    console.log("Local school, academic, finance, staff, attendance and payroll schemas verified: 55 tables, ten classes, fifteen subjects, seven fee items, 43 permission codes, permanent pupil codes, LIN uniqueness, class-specific subject mappings, date-range integrity and attendance adjustment history preservation, attendance incident identity and audit preservation, append-only payroll audit history, and ordinary and special-session Headteacher/DOS statement and Director decision authority.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
