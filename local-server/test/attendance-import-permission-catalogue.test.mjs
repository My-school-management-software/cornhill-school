import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=await readFile(new URL("../migrations/008_local_staff_attendance_payroll_foundation.sql",import.meta.url),"utf8");
const authorization=await readFile(new URL("../src/security/authorization.mjs",import.meta.url),"utf8");
const updater=await readFile(new URL("../windows/Update-CORNHILL-Desktop.ps1",import.meta.url),"utf8");

test("existing staff foundation migration seeds attendance import as a high-risk staff catalogue item",()=>{
 assert.match(migration,/'staff\.attendance_import'/);
 assert.match(migration,/'staff'/);
 assert.match(migration,/high_risk\s*\)\s*VALUES[\s\S]*true/i);
 assert.match(migration,/ON CONFLICT\s*\(permission_code\)\s*DO NOTHING/i);
});

test("attendance foundation does not grant the permission to any role automatically",()=>{
 assert.doesNotMatch(migration,/INSERT INTO cornhill_auth\.staff_role_permissions/i);
 assert.doesNotMatch(migration,/GRANT .*staff\.attendance_import/i);
});

test("attendance import permission is recognised by application authorization",()=>{
 assert.match(authorization,/\"staff\.attendance_import\"/);
});

test("single-run updater includes the attendance import batch and retains explicit permission delegation",()=>{
 assert.match(updater,/Attendance Devices & Imports/);
 assert.match(updater,/staff\.attendance_import/);
});
