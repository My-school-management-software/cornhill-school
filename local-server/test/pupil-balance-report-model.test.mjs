import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_COLUMNS, csvCell, formatUgx, previewPageCsv, validatePupilBalanceReport } from "../src/finance/pupil-balance-report-model.mjs";

const row = () => ({
  pupilCode: "CH20F0001AB", learnerName: "Synthetic Learner",
  className: "P.4", academicYear: 2026, term: 3,
  previousTermOutstandingUgx: 20000,
  currentTermChargesUgx: 100000, allocatedPaymentsUgx: 40000,
  approvedReliefUgx: 10000, currentTermOutstandingUgx: 50000,
  totalOutstandingUgx: 70000, paymentStatus: "Partly paid"
});
const report = () => ({
  asOf: "2026-11-23T11:00:00.000Z",
  rows: [row()],
  totals: {rowCount: 1, previousTermOutstandingUgx: 20000, currentTermOutstandingUgx: 50000, totalOutstandingUgx: 70000}
});

test("pupil balance model accepts a consistent server report", () => {
  assert.equal(validatePupilBalanceReport(report()).rows[0].totalOutstandingUgx, 70000);
  assert.equal(BALANCE_COLUMNS.length, 12);
  assert.match(formatUgx(70000), /^UGX 70,000$/);
});
test("report is rejected if server totals do not reconcile", () => {
  const r = report(); r.totals.totalOutstandingUgx++;
  assert.throws(() => validatePupilBalanceReport(r), /Inconsistent server totals/);
});
test("row combined previous/current debt must reconcile", () => {
  const r = report(); r.rows[0].totalOutstandingUgx++;
  assert.throws(() => validatePupilBalanceReport(r), /Combined amount/);
});
test("rejects unsafe and imprecise money", () => {
  for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    const r = report(); r.rows[0].allocatedPaymentsUgx = bad;
    assert.throws(() => validatePupilBalanceReport(r), /Invalid UGX/);
  }
});
test("CSV preview never trusts a pupil name as spreadsheet formula", () => {
  const r = report(); r.rows[0].learnerName = "  =HYPERLINK(\"https://invalid.example\",\"test\")";
  const csv = previewPageCsv(r);
  assert.match(csv, /"'  =HYPERLINK/);
  assert.equal(csv.split("\r\n").filter(Boolean).length, 2);
  assert.equal(csvCell("@SUM(1,2)"), "\"'@SUM(1,2)\"");
});
test("no financial source mutation occurs during display preparation", () => {
  const r = report(); const before = JSON.stringify(r);
  previewPageCsv(r); validatePupilBalanceReport(r);
  assert.equal(JSON.stringify(r), before);
});
