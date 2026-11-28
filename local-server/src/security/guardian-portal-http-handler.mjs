import {
  AuthenticationError,
  AuthenticationServiceError
} from "./auth-service.mjs";
import { readSessionTokenFromCookieHeader } from "./session-cookies.mjs";

const HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});

function send(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    ...HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(body);
}

const PUPIL_CODE = /^[A-Za-z0-9-]{3,30}$/;
const ENTRY_WINDOW_MS = 15 * 60 * 1000;
const ENTRY_ATTEMPT_LIMIT = 12;
function registeredPhone(value) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, "").trim();
  const normal = /^0[0-9]{9}$/.test(clean) ? "+256" + clean.slice(1) :
    /^256[0-9]{9}$/.test(clean) ? "+" + clean : clean;
  return /^\+256[0-9]{9}$/.test(normal) ? normal : null;
}
async function readEntryJson(request) {
  if (String(request.headers["content-type"] ?? "").split(";",1)[0].trim().toLowerCase() !== "application/json") {
    const error = new Error("JSON content is required."); error.status = 415; throw error;
  }
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 2048) {
      const error = new Error("Request is too large."); error.status = 413; throw error;
    }
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { const error = new Error("Invalid request."); error.status = 400; throw error; }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Invalid request."); error.status = 400; throw error;
  }
  return body;
}
export function createGuardianPortalHttpHandler({
  authService,
  repository,
  expectedOrigin
} = {}) {
  if (!authService || typeof authService.authenticate !== "function" ||
      !repository || typeof repository.listApprovedLearners !== "function") {
    throw new TypeError("Guardian portal dependencies are incomplete.");
  }
  let origin;
  try { origin = new URL(expectedOrigin); } catch {
    throw new TypeError("An exact HTTPS origin is required.");
  }
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin ||
      origin.pathname !== "/" || origin.username || origin.password ||
      origin.search || origin.hash) {
    throw new TypeError("An exact HTTPS origin is required.");
  }

  // Rate-limit relation checks per client source without retaining phone or
  // learner identifiers in memory. Credential/PIN verification remains separate.
  const entryAttempts = new Map();
  return async function handleGuardianPortal(request, response) {
    let url;
    try { url = new URL(request.url ?? "/", origin); } catch { return false; }
    const entryPath = url.pathname === "/api/v1/guardian/entry-check";
    const learnerPath = url.pathname === "/api/v1/guardian/learners";
    if (!learnerPath && !entryPath) return false;

    const method = String(request.method ?? "GET").toUpperCase();
    if ((learnerPath && method !== "GET") || (entryPath && method !== "POST")) {
      response.writeHead(405, { ...HEADERS, Allow: entryPath ? "POST" : "GET", "Content-Length": 0 });
      response.end();
      return true;
    }
    if (request.socket?.encrypted !== true) {
      send(response, 426, { error: "Secure HTTPS transport is required." });
      return true;
    }
    if (request.headers.host !== origin.host) {
      send(response, 421, { error: "Request host is not authorised." });
      return true;
    }

    if (entryPath) {
      if (request.headers.origin !== origin.origin) {
        send(response, 403, { error: "The request origin is not authorised." });
        return true;
      }
      const addr = String(request.socket?.remoteAddress ?? "unknown").slice(0, 80);
      const now = Date.now();
      // Keep a bounded in-memory window. The installation gateway must add
      // distributed rate-limiting before exposing this endpoint externally.
      if (entryAttempts.size > 2048) {
        for (const [key, row] of entryAttempts) {
          if (row.expires <= now) entryAttempts.delete(key);
        }
        if (entryAttempts.size > 2048) entryAttempts.clear();
      }
      const current = entryAttempts.get(addr);
      const attempts = current?.expires > now ? current : { count: 0, expires: now + ENTRY_WINDOW_MS };
      attempts.count += 1;
      entryAttempts.set(addr, attempts);
      if (attempts.count > ENTRY_ATTEMPT_LIMIT) {
        send(response, 429, { error: "Too many checks. Contact the school office for help." });
        return true;
      }
      try {
        const body = await readEntryJson(request);
        const pupilCode = typeof body.pupilCode === "string" ? body.pupilCode.trim().toUpperCase() : "";
        const phone = registeredPhone(body.phone);
        if (!PUPIL_CODE.test(pupilCode) || !phone) {
          send(response, 400, { error: "Enter a valid learner code and registered Ugandan phone number." });
          return true;
        }
        const verified = await repository.verifyRegisteredLearnerGuardian(pupilCode, phone);
        if (!verified) {
          send(response, 400, { error: "Those details could not be confirmed. Check the learner code and registered phone, or contact the school office." });
          return true;
        }
        // A verified contact is NOT an authenticated guardian. Never issue or
        // disclose a PIN from this unauthenticated public route.
        send(response, 200, { verified: true });
      } catch (error) {
        if (Number.isInteger(error?.status)) send(response, error.status, { error: error.message });
        else send(response, 503, { error: "Guardian details could not be checked. Contact the school office." });
      }
      return true;
    }

    try {
      const pupilCode = url.searchParams.get("pupilCode");
      if (!pupilCode || !PUPIL_CODE.test(pupilCode)) {
        send(response, 400, { error: "Enter the learner's permanent code to view their approved profile." });
        return true;
      }
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method
      });
      if (principal.principalType !== "guardian" || principal.accountStatus !== "active") {
        send(response, 403, { error: "This portal is available only to an active guardian account." });
        return true;
      }
      const learners = await repository.listApprovedLearners(principal.id, pupilCode);
      send(response, 200, { learners });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        send(response, 401, { error: "A valid guardian session is required." });
      } else if (error instanceof AuthenticationServiceError) {
        send(response, 503, { error: "Guardian access is temporarily unavailable." });
      } else {
        send(response, 503, { error: "The guardian learner list could not be loaded." });
      }
    }
    return true;
  };
}
