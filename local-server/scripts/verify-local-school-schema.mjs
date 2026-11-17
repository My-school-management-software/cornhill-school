import { readLocalDatabaseConfig } from "../src/db/config.mjs";
import { createPostgresAdmissionsRepository } from "../src/db/admissions-repositories.mjs";

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
    "academic_audit_events",
    "academic_division_bands",
    "academic_grade_bands",
    "academic_grading_schemes",
    "academic_period_audit_events",
    "academic_report_cards",
    "academic_terms",
    "academic_years",
    "admission_enquiries",
    "admission_events",
    "assessments",
    "attendance_adjustments",
    "attendance_day_review_events",
    "attendance_days",
    "attendance_device_staff_mappings",
    "attendance_devices",
    "attendance_events",
    "attendance_import_batches",
    "attendance_import_rejections",
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
    "learner_code_aliases",
    "learner_marks",
    "learner_progression_events",
    "learners",
    "payment_allocations",
    "payment_credit_allocation_batches",
    "payment_credit_allocations",
    "payment_notification_outbox",
    "payment_receipts",
    "payment_records",
    "payroll_audit_events",
    "payroll_disbursements",
    "payroll_line_items",
    "payroll_lines",
    "payroll_periods",
    "payroll_runs",
    "staff_attendance_calendar_exceptions",
    "staff_attendance_incidents",
    "staff_attendance_policy_settings",
    "staff_attendance_schedule_assignments",
    "staff_employment_terms",
    "staff_leave_balance_entries",
    "staff_leave_requests",
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

  const academicTriggers = await pool.query(
    "SELECT tgname FROM pg_trigger WHERE tgname IN ('academic_audit_events_append_only','assessments_audit_capture','learner_marks_audit_capture','assessment_lifecycle_guard','learner_mark_scope_guard','academic_years_audit_capture','academic_terms_audit_capture','academic_period_audit_events_append_only','academic_term_year_dates_guard','academic_report_cards_append_only','learner_progression_events_append_only','academic_division_band_overlap_guard') AND NOT tgisinternal"
  );
  const academicTriggerNames = new Set(academicTriggers.rows.map(row => row.tgname));
  for (const name of ['academic_audit_events_append_only','assessments_audit_capture','learner_marks_audit_capture','assessment_lifecycle_guard','learner_mark_scope_guard','academic_years_audit_capture','academic_terms_audit_capture','academic_period_audit_events_append_only','academic_term_year_dates_guard','academic_report_cards_append_only','learner_progression_events_append_only','academic_division_band_overlap_guard']) {
    assert(academicTriggerNames.has(name), "Missing academic integrity trigger: " + name);
  }
  const academicScales = await pool.query(
    "SELECT scheme_code, class_section, first_level, last_level, uses_subject_aggregates FROM cornhill_school.academic_grading_schemes ORDER BY first_level"
  );
  assert(academicScales.rowCount === 3
    && academicScales.rows[0]?.scheme_code === "nursery_ae"
    && academicScales.rows[1]?.scheme_code === "lower_primary_ae"
    && academicScales.rows[2]?.scheme_code === "upper_primary_uneb"
    && academicScales.rows[2]?.uses_subject_aggregates === true,
    "Nursery, P.1–P.3 and P.4–P.7 must use separate preserved grading structures.");
  const upperScale = await pool.query(
    "SELECT count(*)::int AS count, min_percent, max_percent FROM cornhill_school.academic_grade_bands WHERE scheme_code='upper_primary_uneb' AND subject_id=(SELECT id FROM cornhill_school.subjects WHERE subject_code='ENGLISH') AND grade_code='D1' GROUP BY min_percent,max_percent"
  );
  assert(upperScale.rowCount === 1 && upperScale.rows[0].count === 1
    && Number(upperScale.rows[0].min_percent) === 89
    && Number(upperScale.rows[0].max_percent) === 100,
    "P.4–P.7 grade scale must retain the verified workbook boundaries.");
  const divisionRules = await pool.query("SELECT count(*)::int AS count FROM cornhill_school.academic_division_bands");
  assert(divisionRules.rows[0]?.count === 0,
    "Unverified aggregate-to-division cut-offs must not be seeded as school policy.");
  const academicPrivileges = await pool.query(
    "SELECT has_table_privilege('cornhill_auth_runtime','cornhill_school.academic_terms','SELECT') AS term_read, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.assessments','status','UPDATE') AS assessment_status_update, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.assessments','assessment_name','UPDATE') AS assessment_name_update, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.learner_marks','score','INSERT') AS marks_insert, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.enrolment_periods','class_id','SELECT') AS enrolment_class_read, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.academic_audit_events','INSERT') AS audit_insert, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.academic_years','year_label','INSERT') AS year_insert, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.academic_terms','term_number','INSERT') AS term_insert, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.academic_period_audit_events','INSERT') AS period_audit_insert, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.academic_report_cards','SELECT') AS report_cards_read, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.academic_report_cards','INSERT') AS report_cards_insert, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.learner_progression_events','SELECT') AS progression_read, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.learner_progression_events','INSERT') AS progression_insert, " +
    "has_function_privilege('cornhill_auth_runtime','cornhill_school.generate_academic_report_cards(uuid,uuid)','EXECUTE') AS report_generation_execute, " +
    "has_function_privilege('cornhill_auth_runtime','cornhill_school.record_learner_progression(uuid,uuid,uuid,uuid,date,text)','EXECUTE') AS progression_execute"
  );
  assert(academicPrivileges.rows[0]?.term_read === true
    && academicPrivileges.rows[0]?.year_insert === true
    && academicPrivileges.rows[0]?.term_insert === true
    && academicPrivileges.rows[0]?.period_audit_insert === false
    && academicPrivileges.rows[0]?.assessment_status_update === true
    && academicPrivileges.rows[0]?.assessment_name_update === false
    && academicPrivileges.rows[0]?.marks_insert === true
    && academicPrivileges.rows[0]?.enrolment_class_read === true
    && academicPrivileges.rows[0]?.audit_insert === false
    && academicPrivileges.rows[0]?.report_cards_read === true
    && academicPrivileges.rows[0]?.report_cards_insert === false
    && academicPrivileges.rows[0]?.progression_read === true
    && academicPrivileges.rows[0]?.progression_insert === false
    && academicPrivileges.rows[0]?.report_generation_execute === true
    && academicPrivileges.rows[0]?.progression_execute === true,
    "Academic API database privileges must remain narrowly scoped.");
  const academicGuardSql = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_learner_mark_scope()'::regprocedure) AS definition"
  );
  const academicGuardDefinition = academicGuardSql.rows[0]?.definition ?? "";
  assert(academicGuardDefinition.includes("Marks can only be entered while an assessment is open")
    && academicGuardDefinition.includes("Learner was not enrolled in the assessment class on the assessment date"),
    "Database mark guard must enforce assessment and learner class scope.");

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
  assert(permissionCount.rows[0]?.count === 50, "Expected 50 unique permission catalogue entries, including attendance import.");

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
  assert(staffPermissions.rows[0]?.count === 18, "Expected eighteen staff, leave, attendance and payroll permission codes, including attendance import.");

  const attendanceImportPermission = await pool.query(
    "SELECT category, high_risk FROM cornhill_auth.permission_catalog WHERE permission_code = 'staff.attendance_import'"
  );
  assert(attendanceImportPermission.rows.length === 1
    && attendanceImportPermission.rows[0]?.category === "staff"
    && attendanceImportPermission.rows[0]?.high_risk === true,
    "Attendance device imports must be a Director-delegable, high-risk staff permission.");

  const leadershipPrivileges = await pool.query(
    "SELECT has_column_privilege('cornhill_auth_runtime','cornhill_school.staff_profiles','legal_name','SELECT') AS staff_read, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.attendance_days','attendance_status','SELECT') AS attendance_read, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.staff_attendance_incidents','headteacher_statement','UPDATE') AS statement_update, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.staff_attendance_incidents','director_decision','UPDATE') AS decision_update, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.staff_salary_agreements','daily_rate_ugx','SELECT') AS decision_daily_rate_read, " +
    "has_column_privilege('cornhill_auth_runtime','cornhill_school.staff_attendance_incidents','attendance_date','UPDATE') AS incident_identity_update, " +
    "has_table_privilege('cornhill_auth_runtime','cornhill_school.staff_attendance_incidents','DELETE') AS incident_delete"
  );
  assert(leadershipPrivileges.rows[0]?.staff_read === true
    && leadershipPrivileges.rows[0]?.attendance_read === true
    && leadershipPrivileges.rows[0]?.statement_update === true
    && leadershipPrivileges.rows[0]?.decision_update === true
    && leadershipPrivileges.rows[0]?.decision_daily_rate_read === true
    && leadershipPrivileges.rows[0]?.incident_identity_update === false
    && leadershipPrivileges.rows[0]?.incident_delete === false,
    "Staff leadership runtime grants must be limited to scoped reads and approved review columns.");
  const incidentDecisionTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_incident_decision_guard' AND NOT tgisinternal) AS installed"
  );
  assert(incidentDecisionTrigger.rows[0]?.installed === true,
    "Director/Headteacher attendance incident authority guard must remain installed.");

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

  const scheduleHistoryTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'staff_schedule_assignment_history_guard' AND NOT tgisinternal) AS installed"
  );
  assert(scheduleHistoryTrigger.rows[0]?.installed === true,
    "Attendance-backed schedule assignment history must be protected.");
  const scheduleHistoryDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_staff_schedule_assignment_history()'::regprocedure) AS definition"
  );
  const scheduleHistorySql = scheduleHistoryDefinition.rows[0]?.definition ?? "";
  assert(scheduleHistorySql.includes("FROM cornhill_school.attendance_days ad")
    && scheduleHistorySql.includes("ad.work_date >= OLD.starts_on")
    && scheduleHistorySql.includes("ad.work_date >= NEW.starts_on")
    && scheduleHistorySql.includes("A schedule assignment with recorded attendance history cannot be changed or deleted"),
    "Schedule assignment changes must be rejected when attendance exists in the original effective range.");

  const attendancePayrollBasisTrigger = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'attendance_day_payroll_basis_guard' AND NOT tgisinternal) AS installed"
  );
  assert(attendancePayrollBasisTrigger.rows[0]?.installed === true,
    "Attendance facts linked to advanced payroll must be protected.");
  const attendancePayrollBasisDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_day_payroll_basis()'::regprocedure) AS definition"
  );
  const attendancePayrollBasisSql = attendancePayrollBasisDefinition.rows[0]?.definition ?? "";
  assert(attendancePayrollBasisSql.includes("FROM cornhill_school.attendance_adjustments aa")
    && attendancePayrollBasisSql.includes("pli.source_attendance_adjustment_id = aa.id")
    && attendancePayrollBasisSql.includes("pr.run_status <> 'Draft'")
    && attendancePayrollBasisSql.includes("FOR UPDATE OF pr"),
    "Attendance history must be frozen when a linked payroll run leaves draft.");

  const payrollAdjustmentSourceDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.validate_payroll_line_item()'::regprocedure) AS definition"
  );
  const payrollAdjustmentSourceSql = payrollAdjustmentSourceDefinition.rows[0]?.definition ?? "";
  assert(payrollAdjustmentSourceSql.includes("FOR UPDATE OF ad")
    && payrollAdjustmentSourceSql.includes("NEW.source_attendance_adjustment_id IS DISTINCT FROM OLD.source_attendance_adjustment_id")
    && payrollAdjustmentSourceSql.includes("Attendance-related payroll adjustments require separate approval"),
    "Payroll adjustment linkage must lock its attendance day and preserve source provenance.");

  const attendanceAdjustmentSingleUseIndex = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'cornhill_school' AND indexname = 'payroll_attendance_adjustment_single_use' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%source_attendance_adjustment_id%' AND indexdef ILIKE '%IS NOT NULL%') AS installed"
  );
  assert(attendanceAdjustmentSingleUseIndex.rows[0]?.installed === true,
    "An approved attendance adjustment must not be linked to multiple payroll items.");

  const payrollDetailGuards = await pool.query(
    "SELECT tgname FROM pg_trigger WHERE tgname IN ('payroll_line_parent_identity_guard', 'payroll_line_item_parent_identity_guard') AND NOT tgisinternal"
  );
  const payrollDetailGuardNames = new Set(payrollDetailGuards.rows.map(row => row.tgname));
  assert(payrollDetailGuardNames.has("payroll_line_parent_identity_guard")
    && payrollDetailGuardNames.has("payroll_line_item_parent_identity_guard"),
    "Payroll line and item parent identity guards must both be installed.");
  const payrollLineGuardDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_payroll_line_parent_identity()'::regprocedure) AS definition"
  );
  const payrollItemGuardDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_payroll_item_parent_identity()'::regprocedure) AS definition"
  );
  assert((payrollLineGuardDefinition.rows[0]?.definition ?? "").includes("OLD.payroll_run_id")
    && (payrollLineGuardDefinition.rows[0]?.definition ?? "").includes("NEW.payroll_run_id IS DISTINCT FROM OLD.payroll_run_id")
    && (payrollItemGuardDefinition.rows[0]?.definition ?? "").includes("OLD.payroll_line_id")
    && (payrollItemGuardDefinition.rows[0]?.definition ?? "").includes("NEW.payroll_line_id IS DISTINCT FROM OLD.payroll_line_id"),
    "Payroll detail rows must remain attached to their original payroll run and line.");

  const newIntegrityTriggers = await pool.query(
    "SELECT tgname FROM pg_trigger WHERE tgname IN ('attendance_device_staff_mapping_guard','attendance_event_import_identity_guard','attendance_import_batch_lifecycle_guard','attendance_device_identity_guard','attendance_incident_day_identity_guard','attendance_import_rejection_append_only','attendance_import_rejection_count_guard','staff_salary_agreement_history_guard','staff_employment_term_history_guard','work_schedule_definition_history_guard','payroll_line_item_reapproval_guard') AND NOT tgisinternal"
  );
  const newIntegrityNames = new Set(newIntegrityTriggers.rows.map(row => row.tgname));
  for (const triggerName of [
    "attendance_device_staff_mapping_guard","attendance_event_import_identity_guard",
    "attendance_import_batch_lifecycle_guard","attendance_device_identity_guard",
    "attendance_incident_day_identity_guard","attendance_import_rejection_append_only",
    "attendance_import_rejection_count_guard","staff_salary_agreement_history_guard",
    "staff_employment_term_history_guard","work_schedule_definition_history_guard",
    "payroll_line_item_reapproval_guard"
  ]) assert(newIntegrityNames.has(triggerName), "Missing attendance/payroll integrity trigger: " + triggerName);

  const newPayrollLinkDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.validate_payroll_line_item()'::regprocedure) AS definition"
  );
  const newPayrollLinkSql = newPayrollLinkDefinition.rows[0]?.definition ?? "";
  assert(newPayrollLinkSql.includes("linked_staff_account_id IS DISTINCT FROM payroll_staff_account_id")
    && newPayrollLinkSql.includes("linked_work_date < payroll_starts_on")
    && newPayrollLinkSql.includes("linked_work_date > payroll_ends_on"),
    "Attendance-linked payroll items must match the payroll employee and period.");

  const newDeviceEventDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_event_import_identity()'::regprocedure) AS definition"
  );
  const newDeviceEventSql = newDeviceEventDefinition.rows[0]?.definition ?? "";
  assert(newDeviceEventSql.includes("device_staff_mapping_id")
    && newDeviceEventSql.includes("batch_status IS DISTINCT FROM 'Processing'")
    && newDeviceEventSql.includes("Africa/Kampala"),
    "Device attendance ingestion must resolve staff IDs against the Kampala event date and active batch.");

  const newBatchDefinition = await pool.query(
    "SELECT pg_get_functiondef('cornhill_school.guard_attendance_import_batch_lifecycle()'::regprocedure) AS definition"
  );
  const newBatchSql = newBatchDefinition.rows[0]?.definition ?? "";
  assert(newBatchSql.includes("Completed or failed attendance import batches are immutable")
    && newBatchSql.includes("Final attendance import row counts must reconcile exactly")
    && newBatchSql.includes("Accepted attendance import count must match retained attendance events"),
    "Attendance import batches must preserve final status and reconcile accepted evidence.");

  const nextBatchTriggers = await pool.query(
    "SELECT tgname FROM pg_trigger WHERE tgname IN ('staff_leave_request_transition_guard','staff_leave_overlap_guard','staff_leave_balance_entry_guard','attendance_day_review_event_guard','payroll_disbursement_validation_guard','payroll_disbursement_finality_guard') AND NOT tgisinternal"
  );
  const nextBatchTriggerNames = new Set(nextBatchTriggers.rows.map(row => row.tgname));
  for (const triggerName of [
    "staff_leave_request_transition_guard","staff_leave_overlap_guard",
    "staff_leave_balance_entry_guard","attendance_day_review_event_guard",
    "payroll_disbursement_validation_guard","payroll_disbursement_finality_guard"
  ]) assert(nextBatchTriggerNames.has(triggerName), "Missing leave/attendance/payroll trigger: " + triggerName);

  const nextBatchViews = await pool.query(
    "SELECT c.relname,c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cornhill_school' AND c.relname IN ('attendance_monthly_summary','staff_leave_review_queue','staff_leave_balance_summary','attendance_day_review_queue','payroll_disbursement_summary')"
  );
  assert(nextBatchViews.rows.length===5
    && nextBatchViews.rows.every(row => row.reloptions?.includes("security_invoker=true")),
    "All five staff/attendance/payroll reporting views must use security-invoker semantics.");

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

    const firstActiveEnrolment = await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, '2026-01-01', (SELECT id FROM cornhill_school.classes WHERE class_code = 'P1')) RETURNING id",
      [first.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, '2026-01-01', (SELECT id FROM cornhill_school.classes WHERE class_code = 'P1'))",
      [second.rows[0].id]
    );
    await client.query("UPDATE cornhill_school.learners SET class_id=(SELECT id FROM cornhill_school.classes WHERE class_code='P1') WHERE id IN ($1,$2)",
      [first.rows[0].id, second.rows[0].id]);
    const duplicateActivePeriodRejected = await expectPgError(
      client, "duplicate_active_enrolment_test",
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id) VALUES ($1, '2026-01-01', (SELECT id FROM cornhill_school.classes WHERE class_code = 'P2'))",
      [first.rows[0].id], "23505"
    );
    assert(duplicateActivePeriodRejected, "A learner cannot have two active enrolment periods.");

    const staff = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts (username, username_normalized, password_hash, account_status) VALUES ('ci-finance', 'ci-finance', '$argon2id$ci-test', 'active') RETURNING id"
    );
    const academicStaff = await client.query(
      "INSERT INTO cornhill_auth.staff_accounts (username, username_normalized, password_hash, account_status) VALUES ('ci-academic-approver', 'ci-academic-approver', '$argon2id$ci-test', 'active') RETURNING id"
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_profiles (staff_account_id, staff_number, legal_name, job_title) VALUES ($1, 'CI-ACADEMIC-001', 'CI Academic Approver', 'Director of Studies')",
      [academicStaff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_assignments (staff_account_id, role_code, assigned_by) VALUES ($1, 'director_of_studies', $1)",
      [academicStaff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_auth.staff_role_permissions (role_code, permission_code, granted_by_staff_id) VALUES ('director_of_studies', 'academics.results_publish', $1), ('director_of_studies', 'learners.manage', $1) ON CONFLICT (role_code, permission_code) DO NOTHING",
      [academicStaff.rows[0].id]
    );

    // Exercise the real admissions repository against PostgreSQL while keeping
    // the verifier's outer transaction rollback-safe. Repository transaction
    // boundaries are mapped to a savepoint on this same database connection.
    const admissionsSavepoint = "admissions_repository_integration";
    const admissionsRepository = createPostgresAdmissionsRepository({
      async connect() {
        return {
          async query(sql, values) {
            if (sql === "BEGIN") return client.query("SAVEPOINT " + admissionsSavepoint);
            if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT " + admissionsSavepoint);
            if (sql === "ROLLBACK") {
              await client.query("ROLLBACK TO SAVEPOINT " + admissionsSavepoint);
              return client.query("RELEASE SAVEPOINT " + admissionsSavepoint);
            }
            return client.query(sql, values);
          },
          release() {}
        };
      }
    });
    const admittedLearner = await admissionsRepository.registerLearner({
      actorStaffId: staff.rows[0].id,
      classId: null,
      firstName: "CI Repository",
      middleName: null,
      lastName: "Provisional",
      gender: "Female",
      dateOfBirth: null,
      lin: null,
      admissionDate: "2026-11-15",
      learnerType: "Day",
      previousSchool: null,
      p7IndexNumber: null,
      isBursary: true,
      bursaryFeeUgx: 45000,
      bursaryCategory: "Need-based",
      bursaryReason: "Database repository integration verification",
      takesBreakfast: false,
      takesLunch: false,
      reason: "PostgreSQL repository integration verification",
      guardian: null
    });
    assert(/^CH-[0-9]{4}-[0-9]{6}$/.test(admittedLearner.pupil_code),
      "Admissions repository must return a database-generated permanent pupil code.");
    const admittedLearnerState = await client.query(
      "SELECT l.pupil_code, l.class_id, l.is_bursary, l.bursary_fee_ugx, e.class_id AS enrolment_class_id, e.admission_date, a.event_code " +
      "FROM cornhill_school.learners l " +
      "JOIN cornhill_school.enrolment_periods e ON e.learner_id = l.id AND e.status = 'Active' " +
      "JOIN cornhill_school.admission_events a ON a.learner_id = l.id " +
      "WHERE l.id = $1",
      [admittedLearner.id]
    );
    assert(admittedLearnerState.rows.length === 1
      && admittedLearnerState.rows[0].pupil_code === admittedLearner.pupil_code
      && admittedLearnerState.rows[0].class_id === null
      && admittedLearnerState.rows[0].enrolment_class_id === null
      && admittedLearnerState.rows[0].event_code === "admitted"
      && admittedLearnerState.rows[0].is_bursary === true
      && String(admittedLearnerState.rows[0].bursary_fee_ugx) === "45000",
      "PostgreSQL admissions repository must atomically persist provisional class, bursary and admission audit state.");
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
    const termCompletion = await client.query(
      "INSERT INTO cornhill_school.academic_terms (academic_year_id, term_number, term_name, starts_on, ends_on, status) VALUES ($1, 3, 'Term 3', '2025-09-01', '2025-12-31', 'Completed') RETURNING id",
      [yearPrevious.rows[0].id]
    );
    const termCurrent = await client.query(
      "INSERT INTO cornhill_school.academic_terms (academic_year_id, term_number, term_name, starts_on, ends_on, status) VALUES ($1, 1, 'Term 1', '2026-01-01', '2026-12-31', 'Active') RETURNING id",
      [yearCurrent.rows[0].id]
    );

    const p6Class = await client.query("SELECT id FROM cornhill_school.classes WHERE class_code = 'P6'");
    const p7Class = await client.query("SELECT id FROM cornhill_school.classes WHERE class_code = 'P7'");
    const p7Subjects = await client.query(
      "SELECT s.id, s.subject_code FROM cornhill_school.subjects s JOIN cornhill_school.class_subjects cs ON cs.subject_id = s.id WHERE cs.class_id = $1 AND cs.is_active=true ORDER BY s.subject_code",
      [p7Class.rows[0].id]
    );
    const p7Learner = await client.query(
      "INSERT INTO cornhill_school.learners (first_name, last_name, gender, class_id, p7_index_number) VALUES ('CI', 'P7History', 'Female', $1, 'CI-P7-0001') RETURNING id",
      [p7Class.rows[0].id]
    );
    const p7SecondLearner = await client.query(
      "INSERT INTO cornhill_school.learners (first_name, last_name, gender, class_id, p7_index_number, status) VALUES ('CI', 'P7RankedSecond', 'Male', $1, 'CI-P7-0002', 'Graduated') RETURNING id",
      [p7Class.rows[0].id]
    );
    const p6Enrolment = await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, exit_date, class_id, status) VALUES ($1, '2024-01-01', '2024-12-31', $2, 'Completed') RETURNING id",
      [p7Learner.rows[0].id, p6Class.rows[0].id]
    );
    const p7Enrolment = await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, class_id, status, previous_period_id) VALUES ($1, '2025-01-01', $2, 'Active', $3) RETURNING id",
      [p7Learner.rows[0].id, p7Class.rows[0].id, p6Enrolment.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.enrolment_periods (learner_id, admission_date, exit_date, class_id, status) VALUES ($1, '2025-01-01', '2025-12-31', $2, 'Completed')",
      [p7SecondLearner.rows[0].id, p7Class.rows[0].id]
    );
    const p7Assessment = await client.query(
      "INSERT INTO cornhill_school.assessments (academic_term_id, class_id, assessment_name, assessment_type, assessment_date, max_score, status, created_by_staff_id) VALUES ($1, $2, 'CI Historical End of Term', 'End of Term', '2025-04-15', 100, 'Open', $3) RETURNING id",
      [termPrevious.rows[0].id, p7Class.rows[0].id, staff.rows[0].id]
    );
    const firstP7Scores = { ENGLISH: 87, MATHEMATICS: 78, SCIENCE: 69, SOCIAL_STUDIES: 45 };
    const secondP7Scores = { ENGLISH: 50, MATHEMATICS: 60, SCIENCE: 40, SOCIAL_STUDIES: 30 };
    for (const subject of p7Subjects.rows) {
      await client.query(
        "INSERT INTO cornhill_school.learner_marks (assessment_id, learner_id, class_id, subject_id, score, max_score, entered_by_staff_id) VALUES ($1, $2, $3, $4, $5, 100, $6), ($1, $7, $3, $4, $8, 100, $6)",
        [p7Assessment.rows[0].id, p7Learner.rows[0].id, p7Class.rows[0].id, subject.id,
          firstP7Scores[subject.subject_code], staff.rows[0].id,
          p7SecondLearner.rows[0].id, secondP7Scores[subject.subject_code]]
      );
    }
    await client.query(
      "UPDATE cornhill_school.assessments SET status='Locked', locked_at=now(), last_updated_by_staff_id=$2, updated_at=now() WHERE id=$1",
      [p7Assessment.rows[0].id, academicStaff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.assessments SET status='Published', published_at=now(), last_updated_by_staff_id=$2, updated_at=now() WHERE id=$1",
      [p7Assessment.rows[0].id, academicStaff.rows[0].id]
    );
    const generatedReportCards = await client.query(
      "SELECT cornhill_school.generate_academic_report_cards($1::uuid,$2::uuid)::int AS count",
      [p7Assessment.rows[0].id, academicStaff.rows[0].id]
    );
    assert(generatedReportCards.rows[0]?.count === 2,
      "Published P.7 assessment must generate a historical report-card snapshot for each enrolled learner.");
    const repeatedReportCardGeneration = await client.query(
      "SELECT cornhill_school.generate_academic_report_cards($1::uuid,$2::uuid)::int AS count",
      [p7Assessment.rows[0].id, academicStaff.rows[0].id]
    );
    assert(repeatedReportCardGeneration.rows[0]?.count === 2,
      "Report-card generation must be idempotent and must not rewrite existing historical snapshots.");
    const p7ReportCard = await client.query(
      "SELECT pupil_code_snapshot,lin_snapshot,learner_name_snapshot,p7_index_number_snapshot,class_code_snapshot,academic_year_label_snapshot,academic_term_name_snapshot,total_score,total_possible,average_percent,aggregate_total,division_code,class_position,class_size,jsonb_array_length(subject_results)::int AS subject_count FROM cornhill_school.academic_report_cards WHERE learner_id=$1 AND assessment_id=$2",
      [p7Learner.rows[0].id, p7Assessment.rows[0].id]
    );
    assert(p7ReportCard.rowCount === 1
      && p7ReportCard.rows[0].p7_index_number_snapshot === "CI-P7-0001"
      && p7ReportCard.rows[0].class_code_snapshot === "P7"
      && p7ReportCard.rows[0].academic_year_label_snapshot === "2025"
      && p7ReportCard.rows[0].academic_term_name_snapshot === "Term 1"
      && Number(p7ReportCard.rows[0].total_score) === 279
      && Number(p7ReportCard.rows[0].total_possible) === 400
      && Number(p7ReportCard.rows[0].average_percent) === 69.75
      && Number(p7ReportCard.rows[0].aggregate_total) === 16
      && p7ReportCard.rows[0].division_code === null
      && Number(p7ReportCard.rows[0].class_position) === 1
      && Number(p7ReportCard.rows[0].class_size) === 2
      && Number(p7ReportCard.rows[0].subject_count) === 4,
      "P.7 report card must preserve identity, academic period, totals, aggregate, class rank and all four subjects.");
    assert(await expectPgError(client, "published_mark_immutable_test",
      "UPDATE cornhill_school.learner_marks SET score=0 WHERE learner_id=$1 AND assessment_id=$2 AND subject_id=(SELECT id FROM cornhill_school.subjects WHERE subject_code='ENGLISH')",
      [p7Learner.rows[0].id, p7Assessment.rows[0].id], "23514"),
      "Published assessment marks must reject later edits.");
    const unchangedPublishedMark = await client.query(
      "SELECT score FROM cornhill_school.learner_marks WHERE learner_id=$1 AND assessment_id=$2 AND subject_id=(SELECT id FROM cornhill_school.subjects WHERE subject_code='ENGLISH')",
      [p7Learner.rows[0].id, p7Assessment.rows[0].id]
    );
    assert(unchangedPublishedMark.rowCount === 1 && Number(unchangedPublishedMark.rows[0].score) === 87,
      "A rejected post-publication mark edit must leave the original mark intact.");
    const secondP7ReportCard = await client.query(
      "SELECT aggregate_total,class_position,class_size FROM cornhill_school.academic_report_cards WHERE learner_id=$1 AND assessment_id=$2",
      [p7SecondLearner.rows[0].id, p7Assessment.rows[0].id]
    );
    assert(secondP7ReportCard.rowCount === 1
      && Number(secondP7ReportCard.rows[0].aggregate_total) === 28
      && Number(secondP7ReportCard.rows[0].class_position) === 2
      && Number(secondP7ReportCard.rows[0].class_size) === 2,
      "Report card class positions must be calculated across complete historical class results.");
    assert(await expectPgError(client, "report_card_immutable_test",
      "UPDATE cornhill_school.academic_report_cards SET average_percent=0 WHERE learner_id=$1 AND assessment_id=$2",
      [p7Learner.rows[0].id, p7Assessment.rows[0].id], "23514"),
      "Published report cards must reject mutation.");

    const p7Progression = await client.query(
      "SELECT cornhill_school.record_learner_progression($1::uuid,$2::uuid,NULL,$3::uuid,'2025-12-31','CI synthetic P.7 completion')::text AS event_id",
      [academicStaff.rows[0].id, p7Learner.rows[0].id, termCompletion.rows[0].id]
    );
    assert(Boolean(p7Progression.rows[0]?.event_id), "P.7 completion must create an immutable progression event.");
    const p7History = await client.query(
      "SELECT l.status AS learner_status, l.p7_index_number, ep.status AS enrolment_status, ep.previous_period_id, ay.year_label, lm.score, lm.max_score " +
      "FROM cornhill_school.learners l " +
      "JOIN cornhill_school.enrolment_periods ep ON ep.id = $2 " +
      "JOIN cornhill_school.learner_marks lm ON lm.learner_id = l.id AND lm.assessment_id = $3 AND lm.subject_id=(SELECT id FROM cornhill_school.subjects WHERE subject_code='ENGLISH') " +
      "JOIN cornhill_school.academic_report_cards rc ON rc.learner_id=l.id AND rc.assessment_id=$3 " +
      "JOIN cornhill_school.assessments a ON a.id = lm.assessment_id " +
      "JOIN cornhill_school.academic_terms t ON t.id = a.academic_term_id " +
      "JOIN cornhill_school.academic_years ay ON ay.id = t.academic_year_id " +
      "WHERE l.id = $1",
      [p7Learner.rows[0].id, p7Enrolment.rows[0].id, p7Assessment.rows[0].id]
    );
    assert(p7History.rowCount === 1
      && p7History.rows[0].learner_status === "Graduated"
      && p7History.rows[0].p7_index_number === "CI-P7-0001"
      && p7History.rows[0].enrolment_status === "Completed"
      && p7History.rows[0].previous_period_id === p6Enrolment.rows[0].id
      && p7History.rows[0].year_label === "2025"
      && Number(p7History.rows[0].score) === 87
      && Number(p7History.rows[0].max_score) === 100,
      "Graduating a synthetic P.7 learner must retain the P.6/P.7 enrolment chain, index number, report card and historical marks.");

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

    const p2Class = await client.query("SELECT id FROM cornhill_school.classes WHERE class_code='P2'");
    const feeLearnerProgression = await client.query(
      "SELECT cornhill_school.record_learner_progression($1::uuid,$2::uuid,$3::uuid,$4::uuid,'2026-11-01','CI synthetic class progression')::text AS event_id",
      [academicStaff.rows[0].id, first.rows[0].id, p2Class.rows[0].id, termCurrent.rows[0].id]
    );
    const receiptAfterPromotion = await client.query(
      "SELECT payment.learner_id, receipt.receipt_data_snapshot FROM cornhill_school.payment_records payment JOIN cornhill_school.payment_receipts receipt ON receipt.payment_id=payment.id WHERE payment.id=$1",
      [payment.rows[0].id]
    );
    const progressionPeriods = await client.query(
      "SELECT id,class_id,status,exit_date::text AS exit_date,admission_date::text AS admission_date,previous_period_id FROM cornhill_school.enrolment_periods WHERE learner_id=$1 ORDER BY admission_date,id",
      [first.rows[0].id]
    );
    const progressionDiagnostics = {
      eventCreated: Boolean(feeLearnerProgression.rows[0]?.event_id),
      receiptCount: receiptAfterPromotion.rowCount,
      receiptLearnerMatches: receiptAfterPromotion.rows[0]?.learner_id === first.rows[0].id,
      receiptCodeMatches: receiptAfterPromotion.rows[0]?.receipt_data_snapshot.pupil_code === first.rows[0].pupil_code,
      periodCount: progressionPeriods.rowCount,
      priorPeriodMatches: progressionPeriods.rows[0]?.id === firstActiveEnrolment.rows[0].id,
      priorStatus: progressionPeriods.rows[0]?.status,
      priorExitDate: String(progressionPeriods.rows[0]?.exit_date).slice(0, 10),
      nextClassMatches: progressionPeriods.rows[1]?.class_id === p2Class.rows[0].id,
      nextAdmissionDate: String(progressionPeriods.rows[1]?.admission_date).slice(0, 10),
      previousPeriodMatches: progressionPeriods.rows[1]?.previous_period_id === firstActiveEnrolment.rows[0].id
    };
    assert(Boolean(feeLearnerProgression.rows[0]?.event_id)
      && receiptAfterPromotion.rowCount === 1
      && receiptAfterPromotion.rows[0].learner_id === first.rows[0].id
      && receiptAfterPromotion.rows[0].receipt_data_snapshot.pupil_code === first.rows[0].pupil_code
      && progressionPeriods.rowCount === 2
      && progressionPeriods.rows[0].id === firstActiveEnrolment.rows[0].id
      && progressionPeriods.rows[0].status === "Completed"
      && String(progressionPeriods.rows[0].exit_date).slice(0, 10) === "2026-10-31"
      && progressionPeriods.rows[1].class_id === p2Class.rows[0].id
      && String(progressionPeriods.rows[1].admission_date).slice(0, 10) === "2026-11-01"
      && progressionPeriods.rows[1].previous_period_id === firstActiveEnrolment.rows[0].id,
      "Class progression must preserve the learner's financial receipts and linked enrolment chain: " + JSON.stringify(progressionDiagnostics));

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
    const leaveRequest = await client.query(
      "INSERT INTO cornhill_school.staff_leave_requests (staff_account_id, leave_type, starts_on, ends_on, requested_days, reason, requested_by_staff_id, created_by_staff_id) VALUES ($1, 'Annual', '2026-12-01', '2026-12-03', 3, 'Annual leave for family responsibilities', $1, $1) RETURNING id",
      [staff.rows[0].id]
    );
    const directLeaveApprovalRejected = await expectPgError(
      client, "direct_leave_approval_test",
      "INSERT INTO cornhill_school.staff_leave_requests (staff_account_id, leave_type, starts_on, ends_on, requested_days, reason, status, requested_by_staff_id, created_by_staff_id) VALUES ($1, 'Annual', '2026-12-10', '2026-12-11', 2, 'Direct status insertion must fail', 'Submitted', $1, $1)",
      [staff.rows[0].id], "23514"
    );
    assert(directLeaveApprovalRejected, "Leave requests must be submitted through the guarded transition.");
    await client.query(
      "UPDATE cornhill_school.staff_leave_requests SET status='Submitted' WHERE id=$1",
      [leaveRequest.rows[0].id]
    );
    const overlappingLeave = await client.query(
      "INSERT INTO cornhill_school.staff_leave_requests (staff_account_id, leave_type, starts_on, ends_on, requested_days, reason, requested_by_staff_id, created_by_staff_id) VALUES ($1, 'Annual', '2026-12-03', '2026-12-04', 2, 'Overlapping annual leave request', $1, $1) RETURNING id",
      [staff.rows[0].id]
    );
    const overlappingLeaveRejected = await expectPgError(
      client, "overlapping_staff_leave_test",
      "UPDATE cornhill_school.staff_leave_requests SET status='Submitted' WHERE id=$1",
      [overlappingLeave.rows[0].id], "23P01"
    );
    assert(overlappingLeaveRejected, "Submitted and approved leave periods cannot overlap.");
    await client.query(
      "UPDATE cornhill_school.staff_leave_requests SET status='Approved', reviewed_by_staff_id=$2 WHERE id=$1",
      [leaveRequest.rows[0].id, approver.rows[0].id]
    );
    const leaveRequestRewriteRejected = await expectPgError(
      client, "approved_leave_rewrite_test",
      "UPDATE cornhill_school.staff_leave_requests SET requested_days=2 WHERE id=$1",
      [leaveRequest.rows[0].id], "23514"
    );
    assert(leaveRequestRewriteRejected, "Approved leave request facts cannot be rewritten.");
    await client.query(
      "INSERT INTO cornhill_school.staff_leave_balance_entries (staff_account_id, leave_type, entry_type, days_delta, effective_on, reason, created_by_staff_id, approved_by_staff_id) VALUES ($1, 'Annual', 'Accrual', 5, '2026-01-01', 'Annual leave opening accrual', $1, $2)",
      [staff.rows[0].id, approver.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_leave_balance_entries (staff_account_id, leave_type, entry_type, days_delta, effective_on, source_leave_request_id, reason, created_by_staff_id, approved_by_staff_id) VALUES ($1, 'Annual', 'Usage', -3, '2026-12-01', $2, 'Approved annual leave usage', $1, $3)",
      [staff.rows[0].id, leaveRequest.rows[0].id, approver.rows[0].id]
    );
    const leaveOverdrawRejected = await expectPgError(
      client, "leave_balance_overdraw_test",
      "INSERT INTO cornhill_school.staff_leave_balance_entries (staff_account_id, leave_type, entry_type, days_delta, effective_on, reason, created_by_staff_id, approved_by_staff_id) VALUES ($1, 'Annual', 'Adjustment', -3, CURRENT_DATE, 'Attempt to overdraw leave balance', $1, $2)",
      [staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(leaveOverdrawRejected, "Leave balance ledger must prevent negative balances.");
    const leaveLedgerRewriteRejected = await expectPgError(
      client, "leave_balance_ledger_rewrite_test",
      "UPDATE cornhill_school.staff_leave_balance_entries SET days_delta=4 WHERE staff_account_id=$1 AND entry_type='Accrual'",
      [staff.rows[0].id], "23514"
    );
    assert(leaveLedgerRewriteRejected, "Leave balance ledger evidence must be append-only.");
    await client.query(
      "INSERT INTO cornhill_school.staff_profiles (staff_account_id, staff_number, legal_name, job_title, phone_e164) VALUES ($1, 'CI-001', 'CI Finance Officer', 'Bursar', '+256700000003')",
      [staff.rows[0].id]
    );
    await client.query(
      "INSERT INTO cornhill_school.staff_employment_terms (staff_account_id, starts_on, contract_type, salary_basis, base_salary_ugx, approved_by_staff_id) VALUES ($1, '2026-01-01', 'Permanent', 'Monthly', 1000000, $2)",
      [staff.rows[0].id, approver.rows[0].id]
    );
    const overlappingEmploymentTermRejected = await expectPgError(
      client, "overlapping_employment_term_test",
      "INSERT INTO cornhill_school.staff_employment_terms (staff_account_id, starts_on, ends_on, contract_type, salary_basis, base_salary_ugx, approved_by_staff_id) VALUES ($1, '2026-06-01', '2027-05-31', 'Contract', 'Monthly', 1100000, $2)",
      [staff.rows[0].id, approver.rows[0].id], "23P01"
    );
    assert(overlappingEmploymentTermRejected, "One staff member cannot have overlapping employment terms.");
    const employmentTermReassignmentRejected = await expectPgError(
      client, "employment_term_reassignment_test",
      "UPDATE cornhill_school.staff_employment_terms SET staff_account_id = $2 WHERE staff_account_id = $1",
      [staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(employmentTermReassignmentRejected, "Employment terms cannot be reassigned to another staff account.");
    const device = await client.query(
      "INSERT INTO cornhill_school.attendance_devices (device_code, device_name, manufacturer, model, connection_type) VALUES ('CI-USB-01', 'CI Attendance Device', 'Test Manufacturer', 'Test Model', 'USB') RETURNING id"
    );
    const deviceMapping = await client.query(
      "INSERT INTO cornhill_school.attendance_device_staff_mappings (device_id, device_staff_identifier, staff_account_id, effective_from, created_by_staff_id) VALUES ($1, 'STAFF-001', $2, '2026-01-01', $3) RETURNING id",
      [device.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const batch = await client.query(
      "INSERT INTO cornhill_school.attendance_import_batches (device_id, source_name, source_checksum_sha256, imported_by_staff_id) VALUES ($1, 'ci-attendance.csv', repeat('b', 64), $2) RETURNING id",
      [device.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.attendance_import_batches SET import_status = 'Processing', rows_received = 1 WHERE id = $1",
      [batch.rows[0].id]
    );
    const unmappedDeviceEventRejected = await expectPgError(
      client, "unmapped_device_event_test",
      "INSERT INTO cornhill_school.attendance_events (import_batch_id, device_id, device_staff_identifier, external_event_id, event_type, occurred_at, source_type) VALUES ($1, $2, 'UNKNOWN-ID', 'CI-UNKNOWN-EVENT', 'Clock In', now(), 'Device')",
      [batch.rows[0].id, device.rows[0].id], "23514"
    );
    assert(unmappedDeviceEventRejected, "Device events without a registered staff-ID mapping must be rejected.");
    const preverifiedDeviceEventRejected = await expectPgError(
      client, "preverified_device_event_test",
      "INSERT INTO cornhill_school.attendance_events (import_batch_id, device_id, device_staff_identifier, external_event_id, event_type, occurred_at, source_type, review_status, reviewed_by_staff_id, reviewed_at) VALUES ($1, $2, 'STAFF-001', 'CI-PREVERIFIED-EVENT', 'Clock In', now(), 'Device', 'Verified', $3, now())",
      [batch.rows[0].id, device.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(preverifiedDeviceEventRejected, "Imported device events must enter the system pending review.");
    const importedEvent = await client.query(
      "INSERT INTO cornhill_school.attendance_events (import_batch_id, device_id, staff_account_id, device_staff_identifier, external_event_id, event_type, occurred_at, source_type) VALUES ($1, $2, $3, 'STAFF-001', 'CI-EVENT-001', 'Clock In', now(), 'Device') RETURNING id, staff_account_id, device_staff_mapping_id",
      [batch.rows[0].id, device.rows[0].id, staff.rows[0].id]
    );
    assert(importedEvent.rows[0]?.staff_account_id === staff.rows[0].id
      && importedEvent.rows[0]?.device_staff_mapping_id === deviceMapping.rows[0].id,
      "Device event ingestion must resolve and retain the mapped staff identity.");
    await client.query(
      "UPDATE cornhill_school.attendance_events SET review_status = 'Verified', reviewed_by_staff_id = $2, reviewed_at = NULL WHERE id = $1",
      [importedEvent.rows[0].id, approver.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.attendance_import_batches SET rows_accepted = 1, import_status = 'Completed' WHERE id = $1",
      [batch.rows[0].id]
    );
    const completedBatchMutationRejected = await expectPgError(
      client, "completed_import_batch_mutation_test",
      "UPDATE cornhill_school.attendance_import_batches SET rows_accepted = 0 WHERE id = $1",
      [batch.rows[0].id], "23514"
    );
    assert(completedBatchMutationRejected, "Completed attendance import batches must be immutable.");
    const deviceIdentityMutationRejected = await expectPgError(
      client, "attendance_device_identity_mutation_test",
      "UPDATE cornhill_school.attendance_devices SET model = 'Rewritten Model' WHERE id = $1",
      [device.rows[0].id], "23514"
    );
    assert(deviceIdentityMutationRejected, "Used attendance device identity cannot be rewritten.");
    const attendanceDay = await client.query(
      "INSERT INTO cornhill_school.attendance_days (staff_account_id, work_date, first_clock_in, last_clock_out, expected_minutes, worked_minutes, attendance_status, calculation_source, verified_by_staff_id, verified_at) VALUES ($1, CURRENT_DATE, now() - interval '4 hours', now(), 480, 240, 'Half Day', 'Verified Device Events', $2, now()) RETURNING id",
      [staff.rows[0].id, approver.rows[0].id]
    );
    const attendanceReview = await client.query(
      "INSERT INTO cornhill_school.attendance_day_review_events (attendance_day_id, staff_account_id, attendance_date, review_status, review_note, reviewed_by_staff_id) VALUES ($1, $2, CURRENT_DATE, 'Verified', 'Attendance evidence checked by independent reviewer', $3) RETURNING id",
      [attendanceDay.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const mismatchedAttendanceReviewRejected = await expectPgError(
      client, "attendance_review_identity_test",
      "INSERT INTO cornhill_school.attendance_day_review_events (attendance_day_id, staff_account_id, attendance_date, review_status, review_note, reviewed_by_staff_id) VALUES ($1, $2, CURRENT_DATE + 1, 'Verified', 'Incorrect attendance review date', $3)",
      [attendanceDay.rows[0].id, staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(mismatchedAttendanceReviewRejected, "Attendance review must match its source staff member and date.");
    const attendanceReviewRewriteRejected = await expectPgError(
      client, "attendance_review_append_only_test",
      "UPDATE cornhill_school.attendance_day_review_events SET review_note='Rewritten review evidence' WHERE id=$1",
      [attendanceReview.rows[0].id], "23514"
    );
    assert(attendanceReviewRewriteRejected, "Attendance review events must be append-only.");
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
    const mismatchedIncidentDayRejected = await expectPgError(
      client, "attendance_incident_day_identity_test",
      "INSERT INTO cornhill_school.staff_attendance_incidents (attendance_day_id, staff_account_id, attendance_date, incident_type) VALUES ($1, $2, CURRENT_DATE + 1, 'late_clock_in')",
      [attendanceDay.rows[0].id, staff.rows[0].id], "23514"
    );
    assert(mismatchedIncidentDayRejected, "An attendance incident date must match its source attendance day.");
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
    const selfApprovedSalaryRejected = await expectPgError(
      client, "salary_agreement_self_approval_test",
      "INSERT INTO cornhill_school.staff_salary_agreements (staff_account_id, salary_basis, base_salary_ugx, effective_from, approved_by_staff_id) VALUES ($1, 'Monthly', 1000000, '2026-01-01', $1)",
      [staff.rows[0].id], "23514"
    );
    assert(selfApprovedSalaryRejected, "A staff member cannot approve their own salary agreement.");
    await client.query(
      "INSERT INTO cornhill_school.staff_salary_agreements (staff_account_id, salary_basis, base_salary_ugx, daily_rate_ugx, effective_from, effective_to, approved_by_staff_id) VALUES ($1, 'Monthly', 1000000, 50000, '2026-01-01', '2026-12-31', $2)",
      [staff.rows[0].id, approver.rows[0].id]
    );
    const salaryAgreementOverlapAtSetupRejected = await expectPgError(
      client, "salary_agreement_overlap_test",
      "INSERT INTO cornhill_school.staff_salary_agreements (staff_account_id, salary_basis, base_salary_ugx, daily_rate_ugx, effective_from, effective_to, approved_by_staff_id) VALUES ($1, 'Monthly', 1100000, 55000, '2026-06-01', '2027-05-31', $2)",
      [staff.rows[0].id, approver.rows[0].id], "23P01"
    );
    assert(salaryAgreementOverlapAtSetupRejected, "Active salary agreements for one staff member cannot have overlapping effective dates.");
    const salaryAgreementReassignmentRejected = await expectPgError(
      client, "salary_agreement_reassignment_test",
      "UPDATE cornhill_school.staff_salary_agreements SET staff_account_id = $2 WHERE staff_account_id = $1",
      [staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(salaryAgreementReassignmentRejected, "A salary agreement cannot be reassigned to another staff member.");
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

    const usedScheduleEditRejected = await expectPgError(
      client, "used_schedule_definition_edit_test",
      "UPDATE cornhill_school.staff_work_schedules SET start_time = '09:00' WHERE id = $1",
      [workSchedule.rows[0].id], "23514"
    );
    assert(usedScheduleEditRejected, "Work schedule rules cannot be rewritten after attendance has been recorded against them.");
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
    const periodCodeRewriteRejected = await expectPgError(
      client, "payroll_period_code_identity_test",
      "UPDATE cornhill_school.payroll_periods SET period_code = '2026-CHANGED' WHERE id = $1",
      [payrollPeriod.rows[0].id], "23514"
    );
    assert(periodCodeRewriteRejected, "A payroll period code cannot change after its payroll run is created.");
    const periodDateRewriteRejected = await expectPgError(
      client, "payroll_period_date_identity_test",
      "UPDATE cornhill_school.payroll_periods SET starts_on = '2026-11-02' WHERE id = $1",
      [payrollPeriod.rows[0].id], "23514"
    );
    assert(periodDateRewriteRejected, "Payroll period coverage dates cannot change after a run is created.");
    const periodPaymentDateRewriteRejected = await expectPgError(
      client, "payroll_period_payment_date_identity_test",
      "UPDATE cornhill_school.payroll_periods SET payment_date = '2026-12-02' WHERE id = $1",
      [payrollPeriod.rows[0].id], "23514"
    );
    assert(periodPaymentDateRewriteRejected, "A payroll period payment date cannot change after a run is created.");
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
    const allowanceItem = await client.query(
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Allowance', 'RESPONSIBILITY', 'Approved responsibility allowance', 100000, $2, $3, now()) RETURNING id",
      [payrollLine.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const itemEditWithoutReapprovalRejected = await expectPgError(
      client, "payroll_item_edit_without_reapproval_test",
      "UPDATE cornhill_school.payroll_line_items SET description = 'Edited without approval' WHERE id = $1",
      [allowanceItem.rows[0].id], "23514"
    );
    assert(itemEditWithoutReapprovalRejected, "Changing payroll item details requires a fresh independent approval.");
    await client.query(
      "UPDATE cornhill_school.payroll_line_items SET description = 'Reapproved responsibility allowance', approved_by_staff_id = $2, approved_at = NULL WHERE id = $1",
      [allowanceItem.rows[0].id, incidentLeader.rows[0].id]
    );
    const reapprovedAllowance = await client.query(
      "SELECT approved_by_staff_id, approved_at FROM cornhill_school.payroll_line_items WHERE id = $1",
      [allowanceItem.rows[0].id]
    );
    assert(reapprovedAllowance.rows[0]?.approved_by_staff_id === incidentLeader.rows[0].id
      && reapprovedAllowance.rows[0]?.approved_at,
      "Revised payroll items must record a new active approver and database approval time.");
    await client.query(
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, source_attendance_adjustment_id, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Deduction', 'ATTENDANCE', 'Approved attendance adjustment', 10000, $2, $3, $4, now())",
      [payrollLine.rows[0].id, approvedAdjustment.rows[0].id, staff.rows[0].id, approver.rows[0].id]
    );
    const otherStaffAttendanceDay = await client.query(
      "INSERT INTO cornhill_school.attendance_days (staff_account_id, work_date, expected_minutes, worked_minutes, attendance_status, calculation_source) VALUES ($1, CURRENT_DATE, 480, 480, 'Present', 'Manual') RETURNING id",
      [approver.rows[0].id]
    );
    const otherStaffAdjustment = await client.query(
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id) VALUES ($1, 'Worked Minutes', jsonb_build_object('worked_minutes',300), 'Other staff attendance correction', $2) RETURNING id",
      [otherStaffAttendanceDay.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.attendance_adjustments SET adjustment_status = 'Approved', approved_by_staff_id = $2, approved_at = now() WHERE id = $1",
      [otherStaffAdjustment.rows[0].id, incidentLeader.rows[0].id]
    );
    const crossStaffAttendancePayrollRejected = await expectPgError(
      client, "cross_staff_attendance_payroll_link_test",
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, source_attendance_adjustment_id, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Deduction', 'ATTENDANCE2', 'Cross staff adjustment', 1000, $2, $3, $4, now())",
      [payrollLine.rows[0].id, otherStaffAdjustment.rows[0].id, staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(crossStaffAttendancePayrollRejected, "An attendance adjustment cannot be charged to a different staff member.");
    const oldAttendanceDay = await client.query(
      "INSERT INTO cornhill_school.attendance_days (staff_account_id, work_date, expected_minutes, worked_minutes, attendance_status, calculation_source) VALUES ($1, CURRENT_DATE - 90, 480, 480, 'Present', 'Manual') RETURNING id",
      [staff.rows[0].id]
    );
    const oldAttendanceAdjustment = await client.query(
      "INSERT INTO cornhill_school.attendance_adjustments (attendance_day_id, adjustment_type, proposed_value, reason, requested_by_staff_id) VALUES ($1, 'Worked Minutes', jsonb_build_object('worked_minutes',300), 'Earlier attendance correction', $2) RETURNING id",
      [oldAttendanceDay.rows[0].id, staff.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.attendance_adjustments SET adjustment_status = 'Approved', approved_by_staff_id = $2, approved_at = now() WHERE id = $1",
      [oldAttendanceAdjustment.rows[0].id, approver.rows[0].id]
    );
    const outOfPeriodAttendancePayrollRejected = await expectPgError(
      client, "out_of_period_attendance_payroll_link_test",
      "INSERT INTO cornhill_school.payroll_line_items (payroll_line_id, item_type, item_code, description, amount_ugx, source_attendance_adjustment_id, created_by_staff_id, approved_by_staff_id, approved_at) VALUES ($1, 'Deduction', 'ATTENDANCE3', 'Out of period adjustment', 1000, $2, $3, $4, now())",
      [payrollLine.rows[0].id, oldAttendanceAdjustment.rows[0].id, staff.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(outOfPeriodAttendancePayrollRejected, "Attendance adjustments must belong to the payroll period receiving them.");
    const payrollAdjustmentSourceRewriteRejected = await expectPgError(
      client, "payroll_adjustment_source_rewrite_test",
      "UPDATE cornhill_school.payroll_line_items SET source_attendance_adjustment_id = $2 WHERE payroll_line_id = $1 AND source_attendance_adjustment_id = $3",
      [payrollLine.rows[0].id, reviewedAdjustment.rows[0].id, approvedAdjustment.rows[0].id], "23514"
    );
    assert(payrollAdjustmentSourceRewriteRejected,
      "A payroll item cannot silently replace its original attendance adjustment source.");
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
    const firstDisbursement = await client.query(
      "INSERT INTO cornhill_school.payroll_disbursements (payroll_line_id, amount_ugx, payment_method, external_reference, paid_at, recorded_by_staff_id) VALUES ($1, 500000, 'Bank Transfer', 'CI-PAY-001', now(), $2) RETURNING id",
      [payrollLine.rows[0].id, approver.rows[0].id]
    );
    const disbursementSelfVerificationRejected = await expectPgError(
      client, "payroll_disbursement_self_verify_test",
      "UPDATE cornhill_school.payroll_disbursements SET disbursement_status='Verified', verified_by_staff_id=$2 WHERE id=$1",
      [firstDisbursement.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(disbursementSelfVerificationRejected, "Payroll payment recorder cannot verify their own payment.");
    await client.query(
      "UPDATE cornhill_school.payroll_disbursements SET disbursement_status='Verified', verified_by_staff_id=$2 WHERE id=$1",
      [firstDisbursement.rows[0].id, incidentLeader.rows[0].id]
    );
    const secondDisbursement = await client.query(
      "INSERT INTO cornhill_school.payroll_disbursements (payroll_line_id, amount_ugx, payment_method, external_reference, paid_at, recorded_by_staff_id) VALUES ($1, 590000, 'Mobile Money', 'CI-PAY-002', now(), $2) RETURNING id",
      [payrollLine.rows[0].id, approver.rows[0].id]
    );
    await client.query(
      "UPDATE cornhill_school.payroll_disbursements SET disbursement_status='Verified', verified_by_staff_id=$2 WHERE id=$1",
      [secondDisbursement.rows[0].id, incidentLeader.rows[0].id]
    );
    const payrollDisbursementOverpaymentRejected = await expectPgError(
      client, "payroll_disbursement_overpayment_test",
      "INSERT INTO cornhill_school.payroll_disbursements (payroll_line_id, amount_ugx, payment_method, external_reference, paid_at, recorded_by_staff_id) VALUES ($1, 1, 'Cash', NULL, now(), $2)",
      [payrollLine.rows[0].id, approver.rows[0].id], "23514"
    );
    assert(payrollDisbursementOverpaymentRejected, "Recorded and pending payroll payments cannot exceed net pay.");
    const finalDisbursementEditRejected = await expectPgError(
      client, "verified_payroll_disbursement_edit_test",
      "UPDATE cornhill_school.payroll_disbursements SET amount_ugx=1 WHERE id=$1",
      [firstDisbursement.rows[0].id], "23514"
    );
    assert(finalDisbursementEditRejected, "Verified payroll payment evidence must be immutable.");
    const disbursementSummary = await client.query(
      "SELECT verified_paid_ugx, pending_verification_ugx, remaining_unallocated_ugx FROM cornhill_school.payroll_disbursement_summary WHERE payroll_line_id=$1",
      [payrollLine.rows[0].id]
    );
    assert(String(disbursementSummary.rows[0]?.verified_paid_ugx)==="1090000"
      && String(disbursementSummary.rows[0]?.pending_verification_ugx)==="0"
      && String(disbursementSummary.rows[0]?.remaining_unallocated_ugx)==="0",
      "Payroll disbursement summary must reconcile verified payments to net pay.");

    const postedSalaryBasisRewriteRejected = await expectPgError(
      client, "posted_salary_agreement_rewrite_test",
      "UPDATE cornhill_school.staff_salary_agreements SET base_salary_ugx = 1200000 WHERE staff_account_id = $1",
      [staff.rows[0].id], "23514"
    );
    assert(postedSalaryBasisRewriteRejected, "Salary terms used by posted payroll cannot be rewritten.");


    const postedAttendanceBasisChecks = [
      ["expected_minutes", "expected_minutes = expected_minutes + 1"],
      ["worked_minutes", "worked_minutes = worked_minutes + 1"],
      ["attendance_status", "attendance_status = 'Present'"],
      ["calculation_source", "calculation_source = 'Manual'"],
      ["first_clock_in", "first_clock_in = first_clock_in - interval '1 minute'"],
      ["last_clock_out", "last_clock_out = last_clock_out + interval '1 minute'"],
      ["work_date", "work_date = work_date + 1"],
      ["staff_account_id", "staff_account_id = $2"],
      ["verification_identity", "verified_by_staff_id = $2"],
      ["verification_timestamp", "verified_at = verified_at - interval '1 minute'"]
    ];
    for (const [checkName, assignment] of postedAttendanceBasisChecks) {
      const statement = "UPDATE cornhill_school.attendance_days SET " + assignment + " WHERE id = $1";
      const values = checkName === "staff_account_id"
        ? [attendanceDay.rows[0].id, approver.rows[0].id]
        : checkName === "verification_identity"
          ? [attendanceDay.rows[0].id, incidentLeader.rows[0].id]
          : [attendanceDay.rows[0].id];
      const rejected = await expectPgError(
        client, "posted_attendance_basis_" + checkName,
        statement, values, "23514"
      );
      assert(rejected, "Posted payroll must freeze attendance basis field: " + checkName);
    }
    await client.query(
      "UPDATE cornhill_school.attendance_days SET notes = 'Post-payroll administrative note' WHERE id = $1",
      [attendanceDay.rows[0].id]
    );
    const attendanceNoteAfterPosting = await client.query(
      "SELECT notes FROM cornhill_school.attendance_days WHERE id = $1",
      [attendanceDay.rows[0].id]
    );
    assert(attendanceNoteAfterPosting.rows[0]?.notes === "Post-payroll administrative note",
      "Non-calculation attendance notes should remain editable after payroll posting.");

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

    await client.query("UPDATE cornhill_auth.staff_accounts SET account_status = 'disabled' WHERE id = $1", [staff.rows[0].id]);
    const formerStaffHistory = await client.query(
      "SELECT a.account_status, p.staff_number, p.job_title, t.starts_on::text AS starts_on, t.contract_type, t.base_salary_ugx " +
      "FROM cornhill_auth.staff_accounts a " +
      "JOIN cornhill_school.staff_profiles p ON p.staff_account_id = a.id " +
      "JOIN cornhill_school.staff_employment_terms t ON t.staff_account_id = a.id " +
      "WHERE a.id = $1",
      [staff.rows[0].id]
    );
    assert(formerStaffHistory.rowCount === 1
      && formerStaffHistory.rows[0].account_status === "disabled"
      && formerStaffHistory.rows[0].staff_number === "CI-001"
      && formerStaffHistory.rows[0].job_title === "Bursar"
      && String(formerStaffHistory.rows[0].starts_on).startsWith("2026-01-01")
      && formerStaffHistory.rows[0].contract_type === "Permanent"
      && Number(formerStaffHistory.rows[0].base_salary_ugx) === 1000000,
      "A former staff account must retain its profile and employment history for authorised review.");

    await client.query("ROLLBACK");
    console.log("Local school, academic, finance, staff, attendance and payroll schemas verified: 69 tables, ten classes, fifteen subjects, seven fee items, 50 permission codes, permanent pupil codes, LIN uniqueness, class-specific subject mappings, P.7 graduation with preserved academic and enrolment history, non-overlapping learner progression, former-staff profile/employment retention, date-range integrity and attendance adjustment history preservation, attendance incident identity and audit preservation, append-only payroll audit history, and ordinary and special-session Headteacher/DOS statement and Director decision authority.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
