import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime=await readFile(new URL("../src/security/auth-runtime.mjs",import.meta.url),"utf8");
const authorization=await readFile(new URL("../src/security/authorization.mjs",import.meta.url),"utf8");
const handler=await readFile(new URL("../src/security/attendance-import-http-handler.mjs",import.meta.url),"utf8");
const server=await readFile(new URL("../src/https-server.mjs",import.meta.url),"utf8");
const page=await readFile(new URL("../public/attendance-import.html",import.meta.url),"utf8");
const nav=await readFile(new URL("../public/staff-operations.html",import.meta.url),"utf8");
const frontend=await readFile(new URL("../public/attendance-import.js",import.meta.url),"utf8");

test("PostgreSQL attendance import repository and protected handler are wired into both runtime route chains",()=>{
 assert.match(runtime,/createPostgresAttendanceImportRepository/);
 assert.match(runtime,/createAttendanceImportHttpHandler/);
 assert.ok((runtime.match(/attendanceImportRouteHandler\(request, response\)/g)||[]).length>=2);
});

test("attendance import permission is recognised but not automatically granted to school roles",async()=>{
 assert.match(authorization,/"staff\.attendance_import"/);
 const migrations=await readFile(new URL("../migrations/082_local_attendance_device_import_api.sql",import.meta.url),"utf8");
 assert.doesNotMatch(migrations,/INSERT INTO cornhill_auth\.staff_role_permissions/i);
});

test("attendance device routes require staff principal, explicit permission, HTTPS and same-origin mutations",()=>{
 assert.match(handler,/principal\?\.principalType!==\"staff\"/);
 assert.match(handler,/staff\.attendance_import/);
 assert.match(handler,/request\.socket\?\.encrypted!==true/);
 assert.match(handler,/request\.headers\.origin!==origin\.origin/);
 assert.match(handler,/x-cornhill-csrf/);
});

test("local HTTPS server serves the attendance import HTML, script and stylesheet explicitly",()=>{
 for(const route of ["/attendance-import","/attendance-import.html","/attendance-import.js","/attendance-import.css"])assert.ok(server.includes('[\"'+route+'\"'));
});

test("staff operations navigation links to the new attendance import workspace",()=>{
 assert.match(nav,/href=\"\/attendance-import\"/);
 assert.match(page,/Import terminal attendance CSV/);
 assert.match(page,/not fingerprint images or templates/);
});

test("frontend uses same-origin cookies, CSRF header and text-only rendering for imported data",()=>{
 assert.match(frontend,/credentials:\"same-origin\"/);
 assert.match(frontend,/X-Cornhill-CSRF/);
 assert.match(frontend,/textContent/);
 assert.doesNotMatch(frontend,/innerHTML/);
});
