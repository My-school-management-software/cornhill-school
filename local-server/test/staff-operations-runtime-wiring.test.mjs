import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const runtime=await readFile(new URL("../src/security/auth-runtime.mjs",import.meta.url),"utf8");
const authorization=await readFile(new URL("../src/security/authorization.mjs",import.meta.url),"utf8");

test("Staff Operations repository and HTTP handler are wired into both local runtime route chains",()=>{
  assert.match(runtime,/createPostgresStaffOperationsRepository/);
  assert.match(runtime,/createStaffOperationsHttpHandler/);
  assert.ok((runtime.match(/staffOperationsRouteHandler\(request, response\)/g)||[]).length>=2);
});

test("attendance review and staff leave permissions are recognised without automatic role grants",async()=>{
  for(const permission of ["staff.attendance_review","staff.leave_manage","staff.leave_review","staff.leave_balance_manage"]){
    assert.ok(authorization.includes('"'+permission+'"'),"missing authorization permission "+permission);
  }
  const migration=await readFile(new URL("../migrations/081_local_staff_operations_read_api.sql",import.meta.url),"utf8");
  assert.doesNotMatch(migration,/INSERT INTO cornhill_auth\.staff_role_permissions/i);
});
