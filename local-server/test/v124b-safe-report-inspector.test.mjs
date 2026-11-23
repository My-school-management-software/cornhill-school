import test from "node:test";
import assert from "node:assert/strict";
import {inspectV124bReport} from "../scripts/inspect-v124b-safe-report.mjs";

function sample(){
  return {
    version:"V124B",status:"V124B_ACCEPTANCE_BLOCKED",
    full_regression:{status:"BLOCKED",total:1572,passed:1570,failed:1,skipped:1},
    independent_pg17:"PASS",synthetic_backup_restore:"PASS",
    working_backup_restore:"NOT_RUN",real_logins:"NOT_TESTED",physical_printer:"NOT_TESTED",
    production_install_approved:false,protected_source_candidate:"V124_STAGED_NOT_INSTALLED",
    v124b_merged_paths:[],email_delivery:"NOT_CONFIGURED",
    live_database_modified:false,live_source_modified:false
  };
}

test("V124B known counts report blocked, not an approved installation",()=>{
  const result=inspectV124bReport(sample());
  assert.equal(result.regression.executedPassPercent,99.94);
  assert.equal(result.safeToInstall,false);
  assert.equal(result.gates.independentPostgresql17,true);
  assert.equal(result.gates.syntheticBackupRestore,true);
  assert.equal(result.gates.directorApproval,false);
  assert.ok(result.remaining.includes("regression"));
  assert.ok(result.problems.some(problem=>/Exact test name not present/.test(problem)));
});
test("even passing regression cannot override missing Director approval",()=>{
  const r=sample();r.full_regression={status:"PASS",total:1572,passed:1572,failed:0,skipped:0};
  assert.equal(inspectV124bReport(r).safeToInstall,false);
});
test("prevents false pass when numerical totals disagree",()=>{
  const r=sample();r.full_regression.total=1571;
  assert.throws(()=>inspectV124bReport(r),/do not reconcile/);
});
test("does not accept non-V124B report or malformed counters",()=>{
  const r=sample();r.version="V124C";
  assert.throws(()=>inspectV124bReport(r),/exact V124B/);
  r.version="V124B";r.full_regression.failed=-1;
  assert.throws(()=>inspectV124bReport(r),/invalid/);
});
test("report inspection does not mutate original report",()=>{
  const r=sample(), before=JSON.stringify(r);
  inspectV124bReport(r);
  assert.equal(JSON.stringify(r),before);
});
