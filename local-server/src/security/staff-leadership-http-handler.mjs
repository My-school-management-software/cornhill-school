import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import {
  AuthorizationError, isLocalUuid, staffHasPermission
} from "./authorization.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";

const ORIGIN_HEADERS = Object.freeze({
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});
class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function send(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, { ...ORIGIN_HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length });
  response.end(body);
}
async function readJson(request) {
  const type = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new InputError("JSON content is required.", 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new InputError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InputError("Request body is not valid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("A JSON object is required.");
  return body;
}
function has(principal, permission) {
  return staffHasPermission({ principal, permissionCode: permission });
}
function requireAny(principal, permissions) {
  if (principal?.principalType !== "staff" || !permissions.some(permission => has(principal, permission))) {
    throw new AuthorizationError();
  }
}
function requiredText(value, min, max, label) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new InputError(label + " is invalid.");
  }
  return value.trim();
}
function parseStatement(body) {
  return { statement: requiredText(body.statement, 8, 1500, "Leadership statement") };
}
function parseDecision(body) {
  if (!["excused", "deduct"].includes(body.decision)) throw new InputError("Choose excused or deduct.");
  const deductionUgx = body.decision === "deduct" ? Number(body.deductionUgx) : 0;
  if (!Number.isSafeInteger(deductionUgx) || deductionUgx < 0 || deductionUgx > 100000000 ||
      (body.decision === "deduct" && deductionUgx < 1)) {
    throw new InputError("A deduction must be a whole UGX amount greater than zero.");
  }
  const reviewNote = body.reviewNote == null || body.reviewNote === ""
    ? null : requiredText(body.reviewNote, 2, 1000, "Director review note");
  return { decision: body.decision, deductionUgx, reviewNote };
}
export function createStaffLeadershipHttpHandler({ authService, repository, expectedOrigin, onError } = {}) {
  if (!authService || typeof authService.authenticate !== "function" ||
      !repository || typeof repository.getWorkspace !== "function" ||
      typeof repository.submitIncidentStatement !== "function" ||
      typeof repository.decideIncident !== "function") {
    throw new TypeError("Staff leadership API dependencies are incomplete.");
  }
  let origin;
  try { origin = new URL(expectedOrigin); } catch { throw new TypeError("An exact HTTPS origin is required."); }
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new TypeError("An exact HTTPS origin is required.");
  }
  return async function handleStaffLeadership(request, response) {
    const url = new URL(request.url ?? "/", origin);
    const statementMatch = url.pathname.match(/^\/api\/v1\/staff\/attendance\/incidents\/([0-9a-f-]{36})\/statement$/i);
    const decisionMatch = url.pathname.match(/^\/api\/v1\/staff\/attendance\/incidents\/([0-9a-f-]{36})\/decision$/i);
    const isWorkspace = url.pathname === "/api/v1/staff/leadership/workspace";
    if (!isWorkspace && !statementMatch && !decisionMatch) return false;
    const method = String(request.method ?? "GET").toUpperCase();
    const allowed = isWorkspace ? ["GET"] : ["POST"];
    if (!allowed.includes(method)) {
      response.writeHead(405, { ...ORIGIN_HEADERS, Allow: allowed.join(", "), "Content-Length": 0 });
      response.end(); return true;
    }
    if (request.socket?.encrypted !== true) { send(response, 426, { error: "Secure HTTPS transport is required." }); return true; }
    if (request.headers.host !== origin.host ||
        (method !== "GET" && request.headers.origin !== origin.origin)) {
      send(response, 421, { error: "Request origin is not authorised." }); return true;
    }
    try {
      const csrfToken = method === "GET" ? undefined :
        request.headers["x-cornhill-csrf"] ?? readCsrfTokenFromCookieHeader(request.headers.cookie);
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie), method, csrfToken
      });
      if (isWorkspace) {
        const staffPermissionList = [
          "staff.profile_manage", "staff.attendance_manage",
          "staff.attendance_statement_submit", "staff.attendance_incident_decide",
          "staff.prep_session_manage"
        ];
        requireAny(principal, staffPermissionList);
        const workspace = await repository.getWorkspace({
          includeStaff: has(principal, "staff.profile_manage"),
          includeAttendance: has(principal, "staff.attendance_manage"),
          includeIncidents: has(principal, "staff.attendance_statement_submit") ||
            has(principal, "staff.attendance_incident_decide"),
          includeSessions: has(principal, "staff.prep_session_manage")
        });
        send(response, 200, workspace); return true;
      }
      if (statementMatch) {
        requireAny(principal, ["staff.attendance_statement_submit"]);
        const input = parseStatement(await readJson(request));
        const statement = await repository.submitIncidentStatement({
          incidentId: statementMatch[1], staffId: principal.id, ...input
        });
        send(response, 201, { statement }); return true;
      }
      requireAny(principal, ["staff.attendance_incident_decide"]);
      const input = parseDecision(await readJson(request));
      const decision = await repository.decideIncident({
        incidentId: decisionMatch[1], staffId: principal.id, ...input
      });
      send(response, 200, { decision }); return true;
    } catch (error) {
      try { onError?.(error); } catch {}
      if (error instanceof InputError) send(response, error.status, { error: error.message });
      else if (error instanceof AuthenticationError) send(response, 401, { error: "A valid staff session is required." });
      else if (error instanceof AuthorizationError) send(response, 403, { error: "You are not authorised to access this staff record." });
      else if (error instanceof CsrfValidationError) send(response, 403, { error: "The request could not be verified." });
      else if (error instanceof AuthenticationServiceError) send(response, 503, { error: "Authentication is temporarily unavailable." });
      else if (error?.code === "CORNHILL_STAFF_CONFLICT" || error?.code === "23514" ||
               error?.code === "23503" || error?.code === "23505") {
        send(response, 409, { error: error.message || "The staff record conflicts with its current state." });
      } else send(response, 503, { error: "The staff leadership request could not be completed." });
    }
    return true;
  };
}
