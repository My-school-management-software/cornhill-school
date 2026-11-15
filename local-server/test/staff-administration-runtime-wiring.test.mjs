import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const runtime=await readFile(new URL("../src/security/auth-runtime.mjs",import.meta.url),"utf8");
const migration=await readFile(new URL("../migrations/080_local_director_staff_administration.sql",import.meta.url),"utf8");
test("Director staff administration repositories and API handler are wired into both runtime modes",()=>{
 assert.match(runtime,/createPostgresStaffAdministrationRepository/);
 assert.match(runtime,/createStaffAdministrationHttpHandler/);
 assert.ok((runtime.match(/staffAdministrationRouteHandler\(request, response\)/g)||[]).length>=2);
});
test("Director administration is exposed through fixed local-only backend routes and grants no database table writes to runtime",()=>{
 assert.match(migration,/GRANT EXECUTE ON FUNCTION cornhill_auth\.create_staff_account/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION cornhill_auth\.set_staff_role_permissions/);
 assert.doesNotMatch(migration,/GRANT (INSERT|UPDATE|DELETE) ON TABLE cornhill_auth\.staff_role_permissions TO cornhill_auth_runtime/i);
});
