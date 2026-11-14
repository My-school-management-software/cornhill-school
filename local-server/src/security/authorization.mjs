const STAFF_ROLE_CODES = new Set([
  "director", "headteacher", "deputy_headteacher", "director_of_studies",
  "bursar", "deputy_bursar", "teacher", "class_teacher",
  "upper_primary_teacher", "lower_primary_teacher", "nursery_head",
  "matron", "patron", "senior_woman", "senior_man", "store_manager", "cook"
]);

const PERMISSION_CODES = new Set([
  "learners.read", "learners.manage", "learners.guardians_manage", "learners.lin_manage",
  "admissions.enquiries_read", "admissions.register_learner", "admissions.archive_learner",
  "academics.terms_manage", "academics.subjects_manage", "academics.assessments_manage",
  "academics.marks_enter", "academics.results_view", "academics.results_publish",
  "finance.payments_record", "finance.payments_reverse", "finance.reports_read",
  "finance.fees_manage", "finance.bursary_manage", "finance.receipts_reprint",
  "finance.expenses_manage", "finance.expenses_request", "finance.expenses_review", "finance.expenses_post",\n  "finance.banking_manage", "finance.banking_review", "finance.banking_verify", "finance.credit_allocate",
  "finance.evidence_manage", "finance.evidence_review",
  "staff.attendance_manage", "staff.payroll_read", "staff.payroll_manage",
  "staff.profile_manage", "staff.attendance_import", "staff.attendance_adjust", "staff.payroll_approve",
  "staff.accounts_manage", "guardians.access_approve",
  "system.roles_manage", "system.backups_manage"
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AuthorizationError extends Error {
  constructor() {
    super("Access denied.");
    this.name = "AuthorizationError";
    this.statusCode = 403;
  }
}

export function isLocalUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasLiveSession(principal, principalType, nowMs) {
  if (!principal || principal.principalType !== principalType) return false;
  if (!isLocalUuid(principal.id) || principal.accountStatus !== "active") return false;
  const session = principal.session;
  if (!session || session.revokedAt != null) return false;
  const expiresAt = typeof session.expiresAt === "number"
    ? session.expiresAt
    : Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

export function sessionMatchesPrincipal(session) {
  if (!session || !["staff", "guardian"].includes(session.principalType)) return false;
  if (!/^[a-f0-9]{64}$/i.test(session.tokenHash ?? "")) return false;

  if (session.principalType === "staff") {
    return isLocalUuid(session.staffAccountId) && session.guardianAccountId == null;
  }
  return isLocalUuid(session.guardianAccountId) && session.staffAccountId == null;
}

export function staffHasPermission({
  principal,
  permissionCode,
  rolePermissions = principal?.rolePermissions,
  nowMs = Date.now()
}) {
  if (!hasLiveSession(principal, "staff", nowMs)) return false;
  if (!PERMISSION_CODES.has(permissionCode)) return false;
  if (!Array.isArray(principal.roles)) return false;
  if (!rolePermissions || typeof rolePermissions !== "object" || Array.isArray(rolePermissions)) return false;

  return principal.roles.some(roleCode => {
    if (!STAFF_ROLE_CODES.has(roleCode) || !Object.hasOwn(rolePermissions, roleCode)) return false;
    const permissions = rolePermissions[roleCode];
    return Array.isArray(permissions) && permissions.includes(permissionCode);
  });
}

export function requireStaffPermission(options) {
  if (!staffHasPermission(options)) throw new AuthorizationError();
  return true;
}

export function staffHasClassAssignment({ principal, classId, nowMs = Date.now() }) {
  if (!hasLiveSession(principal, "staff", nowMs) || !isLocalUuid(classId)) return false;
  if (!Array.isArray(principal.classIds)) return false;
  return principal.classIds.some(assignedClassId =>
    isLocalUuid(assignedClassId) && assignedClassId.toLowerCase() === classId.toLowerCase()
  );
}

export function requireStaffClassAssignment(options) {
  if (!staffHasClassAssignment(options)) throw new AuthorizationError();
  return true;
}

export async function guardianHasLearnerAccess({
  principal,
  learnerId,
  accessRepository,
  nowMs = Date.now()
}) {
  if (!hasLiveSession(principal, "guardian", nowMs) || !isLocalUuid(learnerId)) return false;
  if (!accessRepository || typeof accessRepository.hasApprovedLearnerAccess !== "function") return false;

  // Re-check the approved relationship for every learner-specific request.
  // Never trust a learner code or a client-provided learner list as authority.
  const approved = await accessRepository.hasApprovedLearnerAccess({
    guardianAccountId: principal.id,
    learnerId
  });
  return approved === true;
}

export async function requireGuardianLearnerAccess(options) {
  if (!(await guardianHasLearnerAccess(options))) throw new AuthorizationError();
  return true;
}

export const LOCAL_AUTHORIZATION_CATALOG = Object.freeze({
  staffRoles: Object.freeze([...STAFF_ROLE_CODES].sort()),
  permissions: Object.freeze([...PERMISSION_CODES].sort())
});