import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root=new URL("../migrations/",import.meta.url);
const names=[
"064_local_staff_leave_request_foundation.sql","065_local_staff_leave_request_transition_guard.sql",
"066_local_staff_leave_overlap_guard.sql","067_local_staff_leave_balance_ledger.sql",
"068_local_attendance_day_review_events.sql","069_local_attendance_day_review_guard.sql",
"070_local_staff_attendance_leave_reporting_views.sql","071_local_payroll_disbursement_foundation.sql",
"072_local_payroll_disbursement_validation.sql","073_local_payroll_disbursement_finality.sql"
];
const sql=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(new URL(name,root),"utf8")])));
test("ten staff leave, attendance review and payroll disbursement migrations are transactional",()=>{
 assert.equal(names.length,10);
 for(const [name,source] of Object.entries(sql)){
  assert.match(source,/\bBEGIN;/,name);
  assert.match(source,/COMMIT;\s*$/,name);
  assert.doesNotMatch(source,/\bDROP\s+(TABLE|SCHEMA|COLUMN)\b|\bTRUNCATE\b/i,name);
 }
});
test("leave requests have controlled transitions, independent review and overlap protection",()=>{
 assert.match(sql[names[0]],/CREATE TABLE cornhill_school\.staff_leave_requests/);
 assert.match(sql[names[1]],/Staff leave request status transition is invalid/);
 assert.match(sql[names[1]],/Submitted leave request details are immutable/);
 assert.match(sql[names[1]],/active staff reviewer/);
 assert.match(sql[names[2]],/pg_advisory_xact_lock/);
 assert.match(sql[names[2]],/daterange\(existing\.starts_on,existing\.ends_on,'\[\]'\)/);
});
test("leave balance ledger is append-only, approved and cannot go negative",()=>{
 assert.match(sql[names[3]],/Staff leave balance ledger is append-only/);
 assert.match(sql[names[3]],/Staff leave balance entries require independent approval/);
 assert.match(sql[names[3]],/Staff leave balance cannot become negative/);
 assert.match(sql[names[3]],/request_status IS DISTINCT FROM 'Approved'/);
 assert.match(sql[names[3]],/staff_leave_usage_single_entry/);
});
test("attendance review events retain source identity and reviewer separation",()=>{
 assert.match(sql[names[4]],/CREATE TABLE cornhill_school\.attendance_day_review_events/);
 assert.match(sql[names[5]],/Attendance review identity must match its source attendance day/);
 assert.match(sql[names[5]],/Staff cannot independently review their own attendance/);
 assert.match(sql[names[5]],/Daily attendance review events are append-only/);
});
test("attendance and leave reports use security-invoker views",()=>{
 for(const view of ["attendance_monthly_summary","staff_leave_review_queue","staff_leave_balance_summary","attendance_day_review_queue"])
  assert.match(sql[names[6]],new RegExp("CREATE VIEW cornhill_school\\."+view+"\\s+WITH \\(security_invoker=true\\)"));
});
test("payroll disbursements require posted payroll, independent verification and net-pay limits",()=>{
 assert.match(sql[names[7]],/CREATE TABLE cornhill_school\.payroll_disbursements/);
 assert.match(sql[names[8]],/Payroll disbursements can only be recorded against a posted payroll run/);
 assert.match(sql[names[8]],/Payroll disbursement amount exceeds the remaining net pay/);
 assert.match(sql[names[8]],/independent verification decision/);
 assert.match(sql[names[8]],/beneficiary_staff_id/);
 assert.match(sql[names[9]],/Payroll disbursement evidence cannot be deleted/);
 assert.match(sql[names[9]],/Verified or rejected payroll disbursement evidence is immutable/);
 assert.match(sql[names[9]],/payroll_disbursement_summary/);
});
