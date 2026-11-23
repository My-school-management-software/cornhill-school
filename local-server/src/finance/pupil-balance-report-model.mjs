/**
 * V124C read-only presentation helpers.
 *
 * These functions do NOT query a database or compute authoritative debt from
 * transactions. The server must supply reconciled ledger-derived balances,
 * filtered rows, and full-result totals from one consistent snapshot.
 */
export const BALANCE_COLUMNS = Object.freeze([
  ["pupilCode", "Pupil code"], ["learnerName", "Learner"],
  ["className", "Class"], ["academicYear", "Year"], ["term", "Term"],
  ["previousTermOutstandingUgx", "Previous-term debt (UGX)"],
  ["currentTermChargesUgx", "Current charges (UGX)"],
  ["allocatedPaymentsUgx", "Allocated payments (UGX)"],
  ["approvedReliefUgx", "Approved relief (UGX)"],
  ["currentTermOutstandingUgx", "Current-term debt (UGX)"],
  ["totalOutstandingUgx", "Combined balance (UGX)"],
  ["paymentStatus", "Payment status"]
]);

export function validatePupilBalanceReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError("A server-generated balance report is required.");
  }
  if (!Array.isArray(report.rows) || !report.totals ||
      typeof report.totals !== "object" || Array.isArray(report.totals)) {
    throw new TypeError("The report must contain rows and server-calculated totals.");
  }
  if (typeof report.asOf !== "string" || !Number.isFinite(Date.parse(report.asOf))) {
    throw new TypeError("A valid report snapshot timestamp is required.");
  }
  for (const row of report.rows) {
    if (!row || typeof row !== "object") throw new TypeError("Invalid balance row.");
    for (const [key] of BALANCE_COLUMNS) {
      if (!(key in row)) throw new TypeError("Missing balance field: " + key);
    }
    for (const key of BALANCE_COLUMNS.map(([key]) => key).filter(key => key.endsWith("Ugx"))) {
      if (!Number.isSafeInteger(row[key]) || row[key] < 0) {
        throw new TypeError("Invalid UGX amount: " + key);
      }
    }
    if (row.totalOutstandingUgx !==
        row.previousTermOutstandingUgx + row.currentTermOutstandingUgx) {
      throw new TypeError("Combined amount must equal previous and current term outstanding.");
    }
  }
  for (const key of ["rowCount", "totalOutstandingUgx", "previousTermOutstandingUgx", "currentTermOutstandingUgx"]) {
    if (!Number.isSafeInteger(report.totals[key]) || report.totals[key] < 0) {
      throw new TypeError("Invalid server total: " + key);
    }
  }
  if (report.totals.totalOutstandingUgx !==
      report.totals.previousTermOutstandingUgx + report.totals.currentTermOutstandingUgx) {
    throw new TypeError("Inconsistent server totals.");
  }
  return report;
}

export function formatUgx(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError("Invalid UGX amount.");
  return "UGX " + amount.toLocaleString("en-UG");
}

/** Prevent formula injection when opened with Excel or LibreOffice. */
export function csvCell(value) {
  let s = String(value ?? "");
  // A formula may be disguised behind leading whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Export ONLY the current page; full report exports must be generated on server. */
export function previewPageCsv(report) {
  validatePupilBalanceReport(report);
  return [BALANCE_COLUMNS.map(([, heading]) => csvCell(heading)).join(","),
    ...report.rows.map(row => BALANCE_COLUMNS.map(([key]) => csvCell(row[key])).join(","))]
    .join("\r\n") + "\r\n";
}
