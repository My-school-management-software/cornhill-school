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

  return async function handleGuardianPortal(request, response) {
    let url;
    try { url = new URL(request.url ?? "/", origin); } catch { return false; }
    if (url.pathname !== "/api/v1/guardian/learners") return false;

    const method = String(request.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      response.writeHead(405, { ...HEADERS, Allow: "GET", "Content-Length": 0 });
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

    try {
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method
      });
      if (principal.principalType !== "guardian" || principal.accountStatus !== "active") {
        send(response, 403, { error: "This portal is available only to an active guardian account." });
        return true;
      }
      const learners = await repository.listApprovedLearners(principal.id);
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
