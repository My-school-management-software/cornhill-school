// CORNHILL V21: authenticated READ-ONLY local draft eligibility preview.
// This endpoint NEVER saves a mark, queues a draft, or contacts the cloud.
// It is disabled by default and requires migration 096 + an explicit local feature flag.
import {
  AuthenticationError, AuthenticationRateLimitError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import {
  AuthorizationError, staffHasClassAssignment, staffHasPermission
} from "./authorization.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";

const PATH = "/api/v1/academics/offline-drafts/eligibility";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELD_NAMES = ["learnerSourceId", "assessmentSourceId", "subjectSourceId"];
const HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});
class InvalidInput extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function send(response, status, data = {}) {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  response.writeHead(status, {
    ...HEADERS, "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(body);
}
function exactOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError("Exact HTTPS origin required"); }
  if (parsed.origin !== value || parsed.pathname !== "/" ||
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash) throw new TypeError("Exact HTTPS origin required");
  return parsed;
}
async function readInput(request) {
  const kind = String(request.headers["content-type"] || "").split(";",1)[0].trim().toLowerCase();
  if (kind !== "application/json") throw new InvalidInput("JSON request is required", 415);
  let bytes = 0;
  const parts = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1024) throw new InvalidInput("Eligibility request is too large", 413);
    parts.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new InvalidInput("Malformed JSON request"); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      (Object.getPrototypeOf(body) !== Object.prototype && Object.getPrototypeOf(body) !== null) ||
      Object.keys(body).length !== FIELD_NAMES.length ||
      Object.keys(body).some(key => !FIELD_NAMES.includes(key))) {
    throw new InvalidInput("Only academic draft identifiers are accepted");
  }
  for (const name of FIELD_NAMES) {
    if (typeof body[name] !== "string" || !UUID.test(body[name])) {
      throw new InvalidInput("Invalid academic draft identifier");
    }
  }
  return Object.fromEntries(FIELD_NAMES.map(name => [name, body[name]]));
}

export function createAcademicDraftEligibilityHttpHandler({
  authService, recordVerifier, expectedOrigin, onError
} = {}) {
  if (!authService || typeof authService.authenticate !== "function" ||
      !recordVerifier || typeof recordVerifier.verifyDraftSourceMapping !== "function") {
    throw new TypeError("Authentication service and trusted read-only mapper are required");
  }
  const origin = exactOrigin(expectedOrigin);
  return async function handleEligibility(request, response) {
    const url = new URL(request.url ?? "/", origin);
    if (url.pathname !== PATH) return false;
    // Reject altered path, query parameters or fragments, including private UUIDs in URLs.
    if (url.search || url.hash) {
      send(response, 400, { error: "Eligibility request path is invalid" });
      return true;
    }
    const method = String(request.method ?? "GET").toUpperCase();
    if (method !== "POST") {
      response.writeHead(405, { ...HEADERS, Allow: "POST", "Content-Length": 0 });
      response.end();
      return true;
    }
    if (request.socket?.encrypted !== true) {
      send(response, 426, { error: "Secure HTTPS transport required" });
      return true;
    }
    if (request.headers.host !== origin.host || request.headers.origin !== origin.origin) {
      send(response, 421, { error: "Untrusted origin" });
      return true;
    }
    try {
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method: "POST",
        csrfToken: request.headers["x-cornhill-csrf"] ??
          readCsrfTokenFromCookieHeader(request.headers.cookie)
      });
      if (principal.principalType !== "staff" ||
          !staffHasPermission({ principal, permissionCode: "academics.marks_enter" })) {
        throw new AuthorizationError();
      }
      const fields = await readInput(request);
      // The verified row is fetched through the restricted local DB, not from a client claim.
      const verified = await recordVerifier.verifyDraftSourceMapping(fields);
      if (!verified || verified.mappingVerified !== true ||
          verified.recordStatus !== "Open" ||
          !staffHasClassAssignment({ principal, classId: verified.classId })) {
        throw new AuthorizationError();
      }
      // An eligibility preview NEVER means anything was saved or synchronized.
      send(response, 200, {
        eligibleForLocalDraftReview: true,
        recordSaved: false, draftQueued: false,
        cloudSyncEnabled: false, automaticReplayEnabled: false
      });
    } catch (error) {
      try { onError?.(error); } catch { /* do not leak logger errors */ }
      if (error instanceof AuthenticationRateLimitError) {
        send(response, 429, { error: "Too many sign-in attempts" });
      } else if (error instanceof InvalidInput) {
        send(response, error.status, { error: error.message });
      } else if (error instanceof AuthenticationError) {
        send(response, 401, { error: "A valid staff session is required" });
      } else if (error instanceof CsrfValidationError ||
                 error instanceof AuthorizationError ||
                 error?.code === "42501") {
        send(response, 403, { error: "Access to this academic draft is not authorised" });
      } else if (error instanceof AuthenticationServiceError) {
        send(response, 503, { error: "Staff authentication is unavailable" });
      } else {
        send(response, 503, { error: "Academic draft eligibility is unavailable" });
      }
    }
    return true;
  };
}
