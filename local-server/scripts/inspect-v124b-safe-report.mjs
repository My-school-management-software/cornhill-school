// CORNHILL V124B acceptance gate: read-only report inspection.
// Never treats a high pass percentage as approval to install.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function inspectV124bReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError("V124B report must be a JSON object.");
  }
  if (report.version !== "V124B") throw new TypeError("Expected an exact V124B safe report.");
  const regression = report.full_regression;
  if (!regression || !["total","passed","failed","skipped"].every(
    key => Number.isSafeInteger(regression[key]) && regression[key] >= 0
  )) throw new TypeError("Report regression counts are missing or invalid.");
  if (regression.total !== regression.passed + regression.failed + regression.skipped) {
    throw new TypeError("Regression counts do not reconcile.");
  }
  const observedTests = regression.passed + regression.failed;
  const passedPercent = observedTests ? Number((100 * regression.passed / observedTests).toFixed(2)) : 0;
  const gates = {
    regression: regression.status === "PASS" && regression.failed === 0,
    independentPostgresql17: report.independent_pg17 === "PASS",
    syntheticBackupRestore: report.synthetic_backup_restore === "PASS",
    workingBackupRestore: report.working_backup_restore === "PASS",
    realLogins: report.real_logins === "PASS",
    physicalPrinter: report.physical_printer === "PASS",
    directorApproval: report.production_install_approved === true,
    sourceInstalled: report.protected_source_candidate === "V124_INSTALLED"
  };
  const remaining = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
  const problems = [];
  if (regression.failed) problems.push(regression.failed + " regression test(s) failed. Exact test name not present in summary JSON.");
  if (regression.skipped) problems.push(regression.skipped + " test(s) skipped; review the waiver and coverage.");
  if (report.v124b_merged_paths?.length === 0) {
    problems.push("Source merge paths were zero; do not claim newer Windows source was fully integrated.");
  }
  if (report.email_delivery === "NOT_CONFIGURED") {
    problems.push("Bursar email delivery is not configured; do not activate it.");
  }
  if (report.live_database_modified !== false || report.live_source_modified !== false) {
    problems.push("Reported live-system safety state is not confirmed unchanged.");
  }
  return Object.freeze({
    version: report.version,
    reportedStatus: report.status,
    regression: Object.freeze({...regression, executedPassPercent: passedPercent}),
    gates,
    remaining,
    problems,
    safeToInstall: remaining.length === 0 && problems.length === 0 &&
      report.status === "V124B_ACCEPTANCE_PASSED",
    requiresDirectorApproval: !gates.directorApproval
  });
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("Usage: node inspect-v124b-safe-report.mjs <V124B-SAFE-REPORT.json>");
    process.exitCode = 2; return;
  }
  try {
    const report = JSON.parse(await readFile(process.argv[2], "utf8"));
    const result = inspectV124bReport(report);
    console.log(JSON.stringify(result, null, 2));
    if (!result.safeToInstall) process.exitCode = 1;
  } catch {
    console.error("BLOCKED: V124B safe report could not be validated. No installation permitted.");
    process.exitCode = 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
