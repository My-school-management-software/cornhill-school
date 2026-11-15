import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const html=await readFile(new URL("../public/leadership.html",import.meta.url),"utf8");
const js=await readFile(new URL("../public/leadership.js",import.meta.url),"utf8");
const css=await readFile(new URL("../public/leadership.css",import.meta.url),"utf8");
test("Leadership workspace is a responsive local staff screen",()=>{
 assert.ok(html.includes("Leadership & Staff Office"));
 assert.ok(html.includes("/leadership.css"));
 assert.ok(html.includes("/leadership.js"));
 assert.ok(css.includes("@media(max-width:760px)"));
});
test("Leadership workspace uses local staff session and separate role-permission actions",()=>{
 for(const path of ["/auth/staff/login","/auth/session","/staff/leadership/workspace","/staff/attendance/incidents/"])assert.ok(js.includes(path));
 assert.ok(js.includes("X-Cornhill-CSRF"));
 assert.ok(js.includes("staff.attendance_statement_submit"));
 assert.ok(js.includes("staff.attendance_incident_decide"));
 assert.ok(js.includes('credentials: "same-origin"'));
 assert.doesNotMatch(js,/supabase|localStorage\.setItem|sessionStorage\.setItem/i);
});
