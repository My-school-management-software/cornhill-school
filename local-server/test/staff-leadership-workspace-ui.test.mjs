import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const html=await readFile(new URL("../public/leadership.html",import.meta.url),"utf8");
const js=await readFile(new URL("../public/leadership.js",import.meta.url),"utf8");
const css=await readFile(new URL("../public/leadership.css",import.meta.url),"utf8");
test("Leadership workspace is a responsive local staff screen",()=>{
 assert.match(html,/Leadership & Staff Office/);assert.match(html,//leadership\.css/);assert.match(html,//leadership\.js/);assert.match(css,/@media\(max-width:760px\)/);
});
test("Leadership workspace uses the isolated local staff session and role-permission actions",()=>{
 for(const path of ["/auth/staff/login","/auth/session","/staff/leadership/workspace","/staff/attendance/incidents/"])assert.ok(js.includes(path));
 assert.match(js,/X-Cornhill-CSRF/);assert.match(js,/staff\.attendance_statement_submit/);assert.match(js,/staff\.attendance_incident_decide/);assert.match(js,/credentials: "same-origin"/);assert.doesNotMatch(js,/supabase|localStorage\.setItem|sessionStorage\.setItem/i);
});
