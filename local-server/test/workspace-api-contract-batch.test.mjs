import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [
  school, academics, bursar, leadership, staffOps, attendance, guardian,
  schoolCatalog, admissions, academicsApi, leadershipApi, staffAdminApi,
  staffOperationsApi, leaveReviewApi, attendanceImportApi, guardianAccessApi,
  guardianPortalApi, financeApi, financeOperationsApi, evidenceApi, runtime
] = await Promise.all([
  read("../public/school.js"),
  read("../public/academics.js"),
  read("../public/bursar.js"),
  read("../public/leadership.js"),
  read("../public/staff-operations.js"),
  read("../public/attendance-import.js"),
  read("../public/guardian.js"),
  read("../src/security/school-catalog-http-handler.mjs"),
  read("../src/security/admissions-http-handler.mjs"),
  read("../src/security/academics-http-handler.mjs"),
  read("../src/security/staff-leadership-http-handler.mjs"),
  read("../src/security/staff-administration-http-handler.mjs"),
  read("../src/security/staff-operations-http-handler.mjs"),
  read("../src/security/staff-leave-review-http-handler.mjs"),
  read("../src/security/attendance-import-http-handler.mjs"),
  read("../src/security/guardian-access-http-handler.mjs"),
  read("../src/security/guardian-portal-http-handler.mjs"),
  read("../src/security/finance-http-handler.mjs"),
  read("../src/security/finance-operations-http-handler.mjs"),
  read("../src/security/evidence-http-handler.mjs"),
  read("../src/security/auth-runtime.mjs")
]);

function contains(source, fragment, label) {
  assert.ok(source.includes(fragment), label + " is missing: " + fragment);
}
function matches(source, pattern, label) {
  assert.match(source, pattern, label + " declaration is missing");
}

test("school catalogue UI GET requests resolve to the protected local catalogue handler", () => {
  contains(school, 'api("/school/catalog")', "class catalogue request");
  contains(school, 'api("/school/learners?', "learner roster request");
  contains(schoolCatalog, '"/api/v1/school/catalog"', "class catalogue route");
  contains(schoolCatalog, '"/api/v1/school/learners"', "learner roster route");
  contains(schoolCatalog, 'permissionCode: "learners.read"', "learner-read permission");
});

test("learner admission UI POST request resolves to the admission write handler", () => {
  matches(school, /api\("\/school\/admissions",\s*\{\s*method:\s*"POST"/, "admission POST");
  contains(admissions, '"/api/v1/school/admissions"', "admission API path");
  contains(admissions, 'method!=="POST"', "admission POST-only method guard");
  contains(admissions, 'permissionCode:"admissions.register_learner"', "admission permission guard");
});

test("academics workspace and period setup routes are declared on both sides", () => {
  for (const route of ["workspace", "years", "terms"]) {
    contains(academics, '"/academics/' + route + '"', "academics UI " + route);
    contains(academicsApi, '"/api/v1/academics/' + route + '"', "academics API " + route);
  }
});

test("assessment list and create requests have an exact backend route", () => {
  contains(academics, '"/academics/assessments"', "assessment collection UI path");
  contains(academicsApi, '"/api/v1/academics/assessments"', "assessment collection API path");
  contains(academicsApi, "if (isAssessments && method === \"POST\")", "assessment creation branch");
});

test("assessment marks lookup uses the parameterised assessment marks route", () => {
  matches(academics, /\/academics\/assessments\/.*\/marks/, "assessment marks lookup");
  contains(academicsApi, "const marksMatch = url.pathname.match(", "assessment marks route matcher");
  contains(academicsApi, "marks$/i", "assessment marks route suffix");
});

test("assessment status updates use the parameterised status route", () => {
  matches(academics, /\/academics\/assessments\/.*\/status/, "assessment status update");
  contains(academicsApi, "const statusMatch = url.pathname.match(", "assessment status route matcher");
  contains(academicsApi, "status$/i", "assessment status route suffix");
});

test("marks submission is backed by the protected academics marks collection", () => {
  contains(academics, '"/academics/marks"', "marks submission UI path");
  contains(academicsApi, '"/api/v1/academics/marks"', "marks submission API path");
});

test("leadership workspace and role-management views have matching handlers", () => {
  contains(leadership, '"/staff/leadership/workspace"', "leadership workspace UI path");
  contains(leadershipApi, '"/api/v1/staff/leadership/workspace"', "leadership workspace API path");
  contains(leadership, '"/security/role-management"', "role-management UI path");
  contains(staffAdminApi, '"/api/v1/security/role-management"', "role-management API path");
});

test("Director role-permission changes use the parameterised staff-administration route", () => {
  matches(leadership, /\/security\/roles\/.*\/permissions/, "role permission update");
  contains(staffAdminApi, "const permissionMatch=url.pathname.match(", "role permission route matcher");
  contains(staffAdminApi, "/permissions$/", "role permission route suffix");
});

test("staff-account creation is routed through the Director-controlled handler", () => {
  contains(leadership, '"/security/staff-accounts"', "staff-account UI path");
  contains(staffAdminApi, '"/api/v1/security/staff-accounts"', "staff-account API path");
  contains(staffAdminApi, "requireDirectorManager(principal)", "Director-only administration guard");
});

test("leadership attendance statements have a matching dynamic API route", () => {
  matches(leadership, /\/staff\/attendance\/incidents\/.*\/statement/, "incident statement UI path");
  contains(leadershipApi, "const statementMatch = url.pathname.match(", "incident statement route matcher");
  contains(leadershipApi, "statement$/i", "incident statement route suffix");
});

test("leadership attendance decisions have a matching dynamic API route", () => {
  matches(leadership, /\/staff\/attendance\/incidents\/.*\/decision/, "incident decision UI path");
  contains(leadershipApi, "const decisionMatch = url.pathname.match(", "incident decision route matcher");
  contains(leadershipApi, "decision$/i", "incident decision route suffix");
});

test("staff operations workspace and leave submission have backend routes", () => {
  contains(staffOps, '"/staff/operations/workspace"', "staff operations workspace UI path");
  contains(staffOperationsApi, '"/api/v1/staff/operations/workspace"', "staff operations workspace API path");
  contains(staffOps, '"/staff/leave/requests"', "leave submission UI path");
  contains(staffOperationsApi, '"/api/v1/staff/leave/requests"', "leave submission API path");
});

test("attendance-day review UI uses the dynamic review handler", () => {
  matches(staffOps, /\/staff\/attendance\/days\/.*\/review/, "attendance-day review UI path");
  contains(staffOperationsApi, "const attendanceReviewMatch=url.pathname.match(", "attendance review route matcher");
  contains(staffOperationsApi, "attendance/days/", "attendance review route prefix");
});

test("leave approval and rejection are handled by the independent review endpoint", () => {
  matches(staffOps, /\/staff\/leave\/requests\/.*\/review/, "leave review UI path");
  contains(leaveReviewApi, "/api/v1/staff/leave/requests/", "leave review API prefix");
  contains(leaveReviewApi, "/review$/", "leave review route suffix");
  contains(leaveReviewApi, 'permissionCode:"staff.leave_review"', "leave review permission");
});

test("payroll disbursement creation and verification have backend routes", () => {
  matches(staffOps, /\/staff\/payroll\/disbursements/, "payroll disbursement UI path");
  contains(staffOperationsApi, '"/api/v1/staff/payroll/disbursements"', "payroll disbursement API path");
  matches(staffOps, /\/staff\/payroll\/disbursements\/.*\/verify/, "payroll verification UI path");
  contains(staffOperationsApi, "const payrollVerifyMatch=url.pathname.match(", "payroll verification route matcher");
});

test("attendance device registry, staff lookup and import collection have exact routes", () => {
  for (const route of ["devices", "staff-options", "imports"]) {
    contains(attendance, '"/staff/attendance/' + route + '"', "attendance UI " + route);
    contains(attendanceImportApi, '"/api/v1/staff/attendance/' + route + '"', "attendance API " + route);
  }
});

test("attendance device status changes use the parameterised device route", () => {
  matches(attendance, /\/staff\/attendance\/devices\/.*\/status/, "device status UI path");
  contains(attendanceImportApi, "const deviceStatus=path.match(", "device status route matcher");
  contains(attendanceImportApi, "status$/i", "device status route suffix");
});

test("attendance device mappings support list and create operations", () => {
  matches(attendance, /\/staff\/attendance\/devices\/.*\/mappings/, "device mappings UI path");
  contains(attendanceImportApi, "const deviceMappings=path.match(", "device mappings route matcher");
  contains(attendanceImportApi, "mappings$/i", "device mappings route suffix");
  contains(attendanceImportApi, "if(deviceMappings&&method==="GET")", "mapping list branch");
  contains(attendanceImportApi, "if(deviceMappings&&method==="POST")", "mapping creation branch");
});

test("attendance device mapping history can be closed without deleting the mapping", () => {
  matches(attendance, /\/staff\/attendance\/mappings\/.*\/close/, "mapping close UI path");
  contains(attendanceImportApi, "const closeMapping=path.match(", "mapping close route matcher");
  contains(attendanceImportApi, "mappings\\/([0-9a-f-]{36})\\/close", "mapping close route suffix");
});

test("attendance import rejection evidence has a matching batch-specific route", () => {
  matches(attendance, /\/staff\/attendance\/imports\/.*\/rejections/, "import rejection UI path");
  contains(attendanceImportApi, "const rejectionList=path.match(", "rejection list route matcher");
  contains(attendanceImportApi, "rejections$/i", "rejection list route suffix");
});

test("guardian portal learner reads are isolated to the guardian principal", () => {
  contains(guardian, 'api("/guardian/learners")', "guardian learner UI path");
  contains(guardianPortalApi, '"/api/v1/guardian/learners"', "guardian learner API path");
  contains(guardianPortalApi, 'principal.principalType!=="guardian"', "guardian-only principal check");
});

test("guardian contact directory and PIN issuance use staff approval handlers", () => {
  contains(leadership, '"/guardian/access/contacts"', "guardian contacts UI path");
  contains(leadership, '"/guardian/access/issue-pin"', "guardian PIN issuance UI path");
  contains(guardianAccessApi, '"/api/v1/guardian/access/contacts"', "guardian contacts API path");
  contains(guardianAccessApi, '"/api/v1/guardian/access/issue-pin"', "guardian PIN API path");
});

test("finance learner search and account details use protected finance routes", () => {
  contains(bursar, '"/finance/learners?search=', "finance learner search UI path");
  contains(financeApi, '"/api/v1/finance/learners"', "finance learner search API path");
  contains(financeApi, "const accountMatch = path.match(", "finance learner account matcher");
  contains(financeApi, "/account$/i", "finance learner account suffix");
});

test("finance payment posting and idempotency recovery have matching routes", () => {
  contains(bursar, '"/finance/payments"', "payment posting UI path");
  contains(financeApi, '"/api/v1/finance/payments"', "payment posting API path");
  contains(financeApi, "const paymentStatusMatch = path.match(", "payment recovery matcher");
  contains(financeApi, "/requests/", "payment recovery route segment");
});

test("finance receipt reprints and retained-credit allocation have matching routes", () => {
  contains(bursar, '"/finance/receipts/"', "receipt reprint UI path");
  contains(financeApi, "const receiptReprintMatch = path.match(", "receipt reprint matcher");
  contains(bursar, '"/finance/credits/allocate"', "credit allocation UI path");
  contains(financeApi, '"/api/v1/finance/credits/allocate"', "credit allocation API path");
  contains(financeApi, "const creditStatusMatch = path.match(", "credit allocation recovery matcher");
});

test("finance expenses and banking operations have route-table coverage", () => {
  for (const route of [
    "expense-categories", "expense-review-queue", "bank-review-queue", "bank-accounts",
    "expenses/limit-staff", "expenses/limits", "expenses", "bank-transactions", "record-archive"
  ]) {
    contains(bursar, '"/finance/' + route, "Bursar UI route " + route);
    contains(financeOperationsApi, "/finance/" + route, "finance operations route " + route);
  }
  contains(financeOperationsApi, "const routeTable=[", "finance operations route table");
});

test("private evidence requests are matched by the dedicated evidence handler", () => {
  contains(bursar, '"/finance/evidence/requests?', "Bursar evidence request UI path");
  contains(evidenceApi, 'base="/api/v1/finance/evidence"', "evidence API base path");
  contains(evidenceApi, 'const listMatch=path===base+"/requests"&&method==="GET"', "evidence request listing branch");
  contains(runtime, "evidenceRouteHandler", "evidence runtime composition");
});

test("all frontend contract handlers are included in the local authenticated runtime", () => {
  for (const name of [
    "schoolCatalogRouteHandler", "admissionsRouteHandler", "academicsRouteHandler",
    "leadershipRouteHandler", "staffAdministrationRouteHandler", "staffOperationsRouteHandler",
    "staffLeaveReviewRouteHandler", "attendanceImportRouteHandler", "guardianAccessRouteHandler",
    "guardianPortalRouteHandler", "financeOperationsRouteHandler", "financeRouteHandler",
    "evidenceRouteHandler"
  ]) {
    contains(runtime, name, "runtime handler " + name);
  }
});
