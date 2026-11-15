import { AuthenticationError, AuthenticationServiceError } from "./auth-service.mjs";
import { AuthorizationError, staffHasPermission } from "./authorization.mjs";
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

function send(response, status, payload, method = "GET") {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, {
    ...HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(method === "HEAD" ? undefined : body);
}

function exactHttpsOrigin(value) {
  let origin;
  try { origin = new URL(value); } catch { throw new TypeError("A valid HTTPS origin is required."); }
  if (origin.protocol !== "https:" || origin.origin !== value ||
      origin.pathname !== "/" || origin.search || origin.hash ||
      origin.username || origin.password) {
    throw new TypeError("An exact HTTPS origin is required.");
  }
  return origin;
}

export function createSchoolCatalogHttpHandler({ authService, schoolRepository, expectedOrigin } = {}) {
  if (!authService || typeof authService.authenticate !== "function") {
    throw new TypeError("An authentication service is required.");
  }
  if (!schoolRepository || typeof schoolRepository.listActiveClassesAndSubjects !== "function") {
    throw new TypeError("A school catalogue repository is required.");
  }
  const origin = exactHttpsOrigin(expectedOrigin);

  return async function handleSchoolCatalogRequest(request, response) {
    const url = new URL(request.url ?? "/", origin);
    if (url.pathname !== "/api/v1/school/catalog") return false;
    const method = String(request.method ?? "GET").toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { ...HEADERS, Allow: "GET, HEAD", "Content-Length": 0 });
      response.end();
      return true;
    }
    if (request.socket?.encrypted !== true) {
      send(response, 426, { error: "Secure HTTPS transport is required." }, method);
      return true;
    }
    if (request.headers.host !== origin.host) {
      send(response, 421, { error: "Request host is not authorised." }, method);
      return true;
    }

    try {
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method
      });
      if (principal.principalType !== "staff" ||
          !staffHasPermission({ principal, permissionCode: "learners.read" })) {
        throw new AuthorizationError();
      }
      const classes = await schoolRepository.listActiveClassesAndSubjects();
      send(response, 200, { classes }, method);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        send(response, 401, { error: "A valid staff session is required." }, method);
      } else if (error instanceof AuthorizationError) {
        send(response, 403, { error: "You are not authorised to view the school catalogue." }, method);
      } else if (error instanceof AuthenticationServiceError) {
        send(response, 503, { error: "The authentication service is temporarily unavailable." }, method);
      } else {
        send(response, 503, { error: "The school catalogue is temporarily unavailable." }, method);
      }
    }
    return true;
  };
}
