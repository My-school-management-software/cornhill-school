import { validatePupilBalanceReport } from "../finance/pupil-balance-report-model.mjs";
import { randomUUID } from "node:crypto";
import { staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader } from "./session-cookies.mjs";

const HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});
const REPORT_ROUTE = "/api/v1/finance/reports/pupil-balances";

function send(response, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...HEADERS, ...extra,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}
function integerFilter(value, max, name, {min = 1} = {}) {
  if (value === null || value === "") return null;
  if (!/^[0-9]+$/.test(value)) throw new RangeError(name + " must be a whole number.");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new RangeError(name + " is outside the allowed range.");
  }
  return result;
}
export function parsePupilBalanceFilters(params) {
  const year = integerFilter(params.get("year"), 2200, "Year", {min: 2000});
  const term = integerFilter(params.get("term"), 3, "Term");
  const page = integerFilter(params.get("page"), 100000, "Page") ?? 1;
  const pageSize = integerFilter(params.get("pageSize"), 100, "Page size") ?? 25;
  const className = (params.get("class") ?? "").trim();
  if (className.length > 60 || /[\x00-\x1f]/.test(className)) throw new RangeError("Invalid class filter.");
  const status = (params.get("status") ?? "").trim();
  if (!["", "all", "paid", "partly_paid", "unpaid"].includes(status)) throw new RangeError("Invalid payment status.");
  const query = (params.get("query") ?? "").trim();
  if (query.length > 80 || /[\x00-\x1f]/.test(query)) throw new RangeError("Invalid search text.");
  const allowed = new Set(["year", "term", "class", "status", "query", "page", "pageSize"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new RangeError("Invalid or duplicate report filter.");
  }
  return Object.freeze({year, term, className, status: status || "all", query, page, pageSize});
}

/**
 * Optional V124C service: NOT wired into the production runtime until a
 * corresponding Director/Bursar-authorised PostgreSQL read repository exists.
 */
export function createPupilBalancesReportHttpHandler({authService, reportRepository, expectedOrigin} = {}) {
  if (!authService || typeof authService.authenticate !== "function") throw new TypeError("Authentication service required.");
  if (!reportRepository || typeof reportRepository.getPupilBalances !== "function") throw new TypeError("Read-only reporting repository required.");
  const origin = new URL(expectedOrigin);
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin ||
      origin.pathname !== "/" || origin.search || origin.hash) throw new TypeError("Exact HTTPS origin required.");

  return async function handle(request, response) {
    let url;
    try { url = new URL(request.url ?? "/", origin); } catch { return false; }
    if (url.pathname !== REPORT_ROUTE) return false;
    const method = String(request.method ?? "GET").toUpperCase();
    if (request.socket?.encrypted !== true) { send(response, 426, {error: "HTTPS is required."}); return true; }
    if (request.headers.host !== origin.host) { send(response, 421, {error: "Host is not authorised."}); return true; }
    if (method !== "GET") { send(response, 405, {error: "Read-only report."}, {Allow: "GET"}); return true; }

    try {
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method: "GET"
      });
      if (!staffHasPermission({principal, permissionCode: "finance.reports_read"})) {
        send(response, 403, {error: "Finance reporting access denied."});
        return true;
      }
      if (!principal.roles.some(role => ["director", "bursar", "deputy_bursar"].includes(role))) {
        send(response, 403, {error: "Finance reporting access denied."});
        return true;
      }
      let filters;
      try { filters = parsePupilBalanceFilters(url.searchParams); }
      catch { send(response, 400, {error: "Invalid pupil balance report filters."}); return true; }
      const report = await reportRepository.getPupilBalances({actorStaffId: principal.id, filters});
      // Repository must return ledger-derived rows/totals from one snapshot.
      send(response, 200, {report: validatePupilBalanceReport(report)});
      return true;
    } catch (error) {
      const status = error?.statusCode === 401 ? 401 :
        error?.statusCode === 429 ? 429 :
        error?.code === "42501" ? 403 : 503;
      send(response, status, {
        error: status === 401 ? "A valid staff session is required." :
          status === 403 ? "Finance reporting access denied." :
          status === 429 ? "Too many requests." : "Finance reporting is temporarily unavailable.",
        requestId: randomUUID()
      });
      return true;
    }
  };
}
