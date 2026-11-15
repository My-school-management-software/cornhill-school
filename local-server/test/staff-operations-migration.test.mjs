import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../migrations/081_local_staff_operations_read_api.sql",import.meta.url),"utf8");

test("Staff Operations migration exposes only intended attendance, leave and payroll read models",()=>{
  for(const view of [
    "attendance_monthly_summary","attendance_day_review_queue",
    "staff_leave_review_queue","staff_leave_balance_summary","payroll_disbursement_summary"
  ]) assert.ok(sql.includes("cornhill_school."+view),"missing view grant for "+view);
});

test("leave request submission is limited to its required columns and status transition",()=>{
  assert.ok(sql.includes("GRANT INSERT (") && sql.includes("staff_account_id, leave_type, starts_on, ends_on, requested_days,") && sql.includes("reason, requested_by_staff_id, created_by_staff_id") && sql.includes("ON cornhill_school.staff_leave_requests TO cornhill_auth_runtime;"));
  assert.match(sql,/GRANT UPDATE \(status\)\s*ON cornhill_school\.staff_leave_requests/);
  assert.doesNotMatch(sql,/GRANT (?:ALL|INSERT, UPDATE|UPDATE, INSERT)[\s\S]{0,120}staff_leave_requests/i);
});

test("attendance review view receives the minimal underlying columns it needs",()=>{
  assert.match(sql,/GRANT SELECT \(id, staff_account_id, work_date\)\s*ON cornhill_school\.attendance_days/);
  assert.match(sql,/ON cornhill_school\.attendance_day_review_events TO cornhill_auth_runtime/);
});

test("staff-wide payroll and leave reads use explicit column grants, not blanket schema access",()=>{
  assert.match(sql,/GRANT SELECT \([\s\S]*net_pay_ugx[\s\S]*\)\s*ON cornhill_school\.payroll_lines/);
  assert.match(sql,/GRANT SELECT \([\s\S]*disbursement_status[\s\S]*\)\s*ON cornhill_school\.payroll_disbursements/);
  assert.doesNotMatch(sql,/GRANT ALL ON ALL TABLES|GRANT ALL PRIVILEGES|INSERT INTO cornhill_auth\.staff_role_permissions/i);
});

test("migration is additive and contains no data deletion or table recreation",()=>{
  assert.match(sql,/BEGIN;/);
  assert.match(sql,/COMMIT;/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM|DROP DATABASE/i);
});
