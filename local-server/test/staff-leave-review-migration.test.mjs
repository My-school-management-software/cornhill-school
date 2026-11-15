import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration=await readFile(new URL("../migrations/086_local_staff_leave_independent_review.sql",import.meta.url),"utf8");
const guard=await readFile(new URL("../migrations/065_local_staff_leave_request_transition_guard.sql",import.meta.url),"utf8");
test("migration grants only leave review columns and leaves role delegation explicit",()=>{
 assert.match(migration,/GRANT UPDATE \(status, reviewed_by_staff_id, review_note\)/);
 assert.doesNotMatch(migration,/GRANT UPDATE ON|GRANT ALL|INSERT INTO cornhill_auth\.staff_role_permissions/i);
 assert.match(guard,/NEW\.reviewed_by_staff_id = NEW\.staff_account_id/);
 assert.match(guard,/independent reviewer/);
});
