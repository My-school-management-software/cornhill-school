import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const html=await readFile(new URL("../public/leadership.html",import.meta.url),"utf8");
const js=await readFile(new URL("../public/leadership.js",import.meta.url),"utf8");
const css=await readFile(new URL("../public/leadership.css",import.meta.url),"utf8");
test("Leadership workspace is responsive and contains Director-only staff administration",()=>{
 assert.ok(html.includes("Leadership & Staff Office"));
 assert.ok(html.includes('id="admin-panel"'));
 assert.ok(html.includes('id="staff-account-form"'));
 assert.ok(html.includes('id="permission-list"'));
 assert.ok(js.includes("/security/role-management"));
 assert.ok(js.includes("/security/staff-accounts"));
 assert.ok(js.includes("/security/roles/"));
 assert.ok(js.includes('principal.roles?.includes("director")&&can("system.roles_manage")'));
 assert.ok(css.includes(".admin-grid"));
});
test("Director controls never request or store credentials in browser storage",()=>{
 assert.ok(js.includes("X-Cornhill-CSRF"));
 assert.ok(js.includes('credentials: "same-origin"'));
 assert.doesNotMatch(js,/localStorage|sessionStorage|supabase/i);
});
