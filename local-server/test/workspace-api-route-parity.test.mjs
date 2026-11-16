import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [school, academics, bursar, leadership, staffOps, attendance, guardian,
  authHandler, schoolHandler, admissionsHandler, academicsHandler,
  financeHandler, financeOpsHandler, evidenceHandler, guardianAccessHandler,
  guardianPortalHandler, leadershipHandler, staffOpsHandler, leaveHandler,
  attendanceHandler, runtime] = await Promise.all([
  read("../public/school.js"),
  read("../public/academics.js"),
  read("../public/bursar.js"),
  read("../public/leadership.js"),
  read("../public/staff-operations.js"),
  read("../public/attendance-import.js"),
  read("../public/guardian.js"),
  read("../src/security/auth-http-handler.mjs"),
  read("../src/security/school-catalog-http-handler.mjs"),
  read("../src/security/admissions-http-handler.mjs"),
  read("../src/security/academics-http-handler.mjs"),
  read("../src/security/finance-http-handler.mjs"),
  read("../src/security/finance-operations-http-handler.mjs"),
  read("../src/security/evidence-http-handler.mjs"),
  read("../src/security/guardian-access-http-handler.mjs"),
  read("../src/security/guardian-portal-http-handler.mjs"),
  read("../src/security/staff-leadership-http-handler.mjs"),
  read("../src/security/staff-operations-http-handler.mjs"),
  read("../src/security/staff-leave-review-http-handler.mjs"),
  read("../src/security/attendance-import-http-handler.mjs"),
  read("../src/security/auth-runtime.mjs")
]);

test("all seven workspaces use the shared authenticated local session routes", () => {
  for (const [name, source] of Object.entries({school,academics,bursar,leadership,staffOps,attendance,guardian})) {
    assert.match(source, /\/auth\/session/, name + " must read the local session");
    assert.match(source, /\/auth\/logout/, name + " must use local logout");
  }
  assert.match(authHandler, /\/api\/v1\/auth\/session/);
  assert.match(authHandler, /\/api\/v1\/auth\/logout/);
  assert.match(authHandler, /\/api\/v1\/auth\/staff\/login/);
  assert.match(authHandler, /\/api\/v1\/auth\/guardian\/login/);
});

test("learner workspace API paths have matching catalogue and admission handlers", () => {
  assert.match(school, /\/school\/catalog/);
  assert.match(school, /\/school\/learners/);
  assert.match(school, /\/school\/admissions/);
  assert.match(schoolHandler, /\/api\/v1\/school\/catalog/);
  assert.match(schoolHandler, /\/api\/v1\/school\/learners/);
  assert.match(admissionsHandler, /\/api\/v1\/school\/admissions/);
});

test("academics workspace API paths match the academics handler routes", () => {
  for (const route of ["workspace","years","terms","assessments","marks"]) {
    assert.ok(academics.includes("/academics/" + route), "frontend route missing: " + route);
    assert.ok(academicsHandler.includes("/api/v1/academics/" + route), "backend route missing: " + route);
  }
  assert.match(academicsHandler, /assessments\/\(\[0-9a-f-\]\{36\}\)\/marks/);
});

test("staff leadership and incident decisions have matching backend handlers", () => {
  assert.match(leadership, /\/staff\/leadership\/workspace/);
  assert.match(leadership, /\/staff\/attendance\/incidents\//);
  assert.match(leadershipHandler, /\/api\/v1\/staff\/leadership\/workspace/);
  assert.match(leadershipHandler, /\/api\/v1\/staff\/attendance\/incidents/);
  assert.match(guardianAccessHandler, /\/api\/v1\/guardian\/access\/contacts/);
  assert.match(guardianAccessHandler, /\/api\/v1\/guardian\/access\/issue-pin/);
});

test("staff operations leave, attendance review and payroll actions match backend routes", () => {
  assert.match(staffOps, /\/staff\/operations\/workspace/);
  assert.match(staffOps, /\/staff\/leave\/requests/);
  assert.match(staffOps, /\/staff\/attendance\/days\//);
  assert.match(staffOps, /\/staff\/payroll\/disbursements/);
  assert.match(staffOpsHandler, /\/api\/v1\/staff\/operations\/workspace/);
  assert.match(staffOpsHandler, /\/api\/v1\/staff\/leave\/requests/);
  assert.match(staffOpsHandler, /\/api\/v1\/staff\/attendance\/days/);
  assert.match(staffOpsHandler, /\/api\/v1\/staff\/payroll\/disbursements/);
  assert.match(leaveHandler, /\/api\/v1\/staff\/leave\/requests/);
});

test("attendance import workspace device, staff, import and mapping routes match backend", () => {
  for (const route of ["devices","staff-options","imports","mappings"]) {
    assert.ok(attendance.includes("/staff/attendance/" + route), "frontend route missing: " + route);
  }
  for (const route of ["devices","staff-options","imports","mappings"]) {
    assert.ok(attendanceHandler.includes("/api/v1/staff/attendance/" + route), "backend route missing: " + route);
  }
  assert.match(attendanceHandler, /\/api\/v1\/staff\/attendance\/devices\/\(\[0-9a-f-\]\{36\}\)\/mappings/);
});

test("guardian portal learner and access routes have dedicated protected handlers", () => {
  assert.match(guardian, /\/guardian\/learners/);
  assert.match(guardianPortalHandler, /\/api\/v1\/guardian\/learners/);
  assert.match(guardianAccessHandler, /\/api\/v1\/guardian\/access\/contacts/);
  assert.match(guardianAccessHandler, /\/api\/v1\/guardian\/access\/issue-pin/);
});

test("finance workspace endpoints are routed through the enabled finance handlers", () => {
  for (const route of ["learners","payments","receipts","credits","expenses","bank-accounts","bank-transactions","expense-categories","expense-review-queue","bank-review-queue","record-archive"]) {
    assert.ok(bursar.includes("/finance/" + route), "Bursar frontend route missing: " + route);
  }
  assert.match(financeHandler, /\/api\/v1\/finance\//);
  assert.match(financeOpsHandler, /\/api\/v1\/finance\//);
  assert.match(evidenceHandler, /\/api\/v1\/finance\/evidence/);
  assert.match(runtime, /financeOperationsRouteHandler/);
  assert.match(runtime, /financeRouteHandler/);
  assert.match(runtime, /evidenceRouteHandler/);
});

test("runtime composition includes each non-finance workspace handler", () => {
  for (const name of ["schoolCatalogRouteHandler","admissionsRouteHandler","academicsRouteHandler",
    "leadershipRouteHandler","staffOperationsRouteHandler","staffLeaveReviewRouteHandler",
    "attendanceImportRouteHandler","guardianAccessRouteHandler","guardianPortalRouteHandler"]) {
    assert.match(runtime, new RegExp(name));
  }
});
