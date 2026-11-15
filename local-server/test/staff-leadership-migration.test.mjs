import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql=await readFile(new URL("../migrations/079_local_staff_leadership_workspace.sql",import.meta.url),"utf8");
test("leadership migration grants no staff permissions automatically",()=>{
 assert.match(sql,/staff\.attendance_statement_submit/);
 assert.match(sql,/GRANT UPDATE \(headteacher_statement, headteacher_statement_by, headteacher_statement_at\)/);
 assert.match(sql,/GRANT UPDATE \(director_decision, director_decision_by, director_decision_at/);
 assert.match(sql,/ON cornhill_school\.staff_attendance_incidents TO cornhill_auth_runtime/);
 assert.match(sql,/GRANT SELECT \(staff_account_id, daily_rate_ugx, effective_from, effective_to, is_active, created_at\)/);
 assert.doesNotMatch(sql,/INSERT INTO cornhill_auth\.staff_role_permissions/i);
 assert.doesNotMatch(sql,/GRANT .* TO PUBLIC/i);
});
