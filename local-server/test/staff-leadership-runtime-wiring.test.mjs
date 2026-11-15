import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const runtime=await readFile(new URL("../src/security/auth-runtime.mjs",import.meta.url),"utf8");
const authorization=await readFile(new URL("../src/security/authorization.mjs",import.meta.url),"utf8");
test("staff leadership repository and handler are wired into both local runtime configurations",()=>{
 assert.match(runtime,/createPostgresStaffLeadershipRepository/);
 assert.match(runtime,/createStaffLeadershipHttpHandler/);
 assert.ok((runtime.match(/leadershipRouteHandler\(request, response\)/g)||[]).length>=2);
});
test("staff permissions remain catalogued but are never granted automatically",async()=>{
 assert.match(authorization,/staff\.attendance_statement_submit/);
 const migration=await readFile(new URL("../migrations/079_local_staff_leadership_workspace.sql",import.meta.url),"utf8");
 assert.doesNotMatch(migration,/INSERT INTO cornhill_auth\.staff_role_permissions/i);
});
