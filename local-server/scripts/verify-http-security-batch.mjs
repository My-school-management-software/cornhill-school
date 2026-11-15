import assert from "node:assert/strict";

const baseUrl = (process.env.CORNHILL_BASE_URL ?? "https://localhost:4174").replace(/\/$/, "");
const origin = new URL(baseUrl).origin;

const cases = [
  ["GET", "/api/v1/academics/workspace"],
  ["POST", "/api/v1/academics/years"],
  ["POST", "/api/v1/academics/terms"],
  ["GET", "/api/v1/academics/assessments"],
  ["POST", "/api/v1/academics/marks"],
  ["POST", "/api/v1/security/staff-accounts"],
  ["GET", "/api/v1/security/role-management"],
  ["POST", "/api/v1/school/admissions"],
  ["GET", "/api/v1/finance/learners"],
  ["POST", "/api/v1/finance/payments"],
  ["POST", "/api/v1/finance/credits/allocate"],
  ["POST", "/api/v1/guardian/access/issue-pin"],
  ["GET", "/api/v1/guardian/learners"],
  ["GET", "/api/v1/staff/attendance/devices"],
  ["GET", "/api/v1/staff/attendance/staff-options"],
  ["GET", "/api/v1/staff/attendance/imports"],
  ["POST", "/api/v1/staff/leave/requests"],
  ["POST", "/api/v1/staff/payroll/disbursements"],
  ["GET", "/api/v1/staff/leadership/workspace"],
  ["GET", "/api/v1/staff/operations/workspace"]
];

let passed = 0;
const failures = [];

for (const [method, path] of cases) {
  try {
    const response = await fetch(baseUrl + path, {
      method,
      headers: method === "POST"
        ? { "Content-Type": "application/json", Origin: origin }
        : {},
      ...(method === "POST" ? { body: "{}" } : {})
    });
    const body = (await response.text()).slice(0, 180);
    const ok = [401, 403].includes(response.status);
    if (ok) {
      passed++;
      console.log(`PASS ${method} ${path} -> ${response.status}`);
    } else {
      failures.push(`${method} ${path}: unexpected HTTP ${response.status} ${body}`);
      console.log(`FAIL ${method} ${path} -> ${response.status}`);
    }
  } catch (error) {
    failures.push(`${method} ${path}: ${error.message}`);
    console.log(`ERROR ${method} ${path}: ${error.message}`);
  }
}

const originCases = [
  "/api/v1/academics/years",
  "/api/v1/security/staff-accounts",
  "/api/v1/staff/leave/requests",
  "/api/v1/staff/payroll/disbursements",
  "/api/v1/guardian/access/issue-pin",
  "/api/v1/staff/attendance/devices"
];

for (const path of originCases) {
  try {
    const response = await fetch(baseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example"
      },
      body: "{}"
    });
    const body = (await response.text()).slice(0, 180);
    const ok = [403, 421].includes(response.status);
    if (ok) {
      passed++;
      console.log(`PASS ORIGIN POST ${path} -> ${response.status}`);
    } else {
      failures.push(`ORIGIN POST ${path}: unexpected HTTP ${response.status} ${body}`);
      console.log(`FAIL ORIGIN POST ${path} -> ${response.status}`);
    }
  } catch (error) {
    failures.push(`ORIGIN POST ${path}: ${error.message}`);
    console.log(`ERROR ORIGIN POST ${path}: ${error.message}`);
  }
}

console.log(`\\nHTTP SECURITY BATCH: ${passed}/${cases.length + originCases.length} passed; ${failures.length} failed.`);
if (failures.length) {
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
}
