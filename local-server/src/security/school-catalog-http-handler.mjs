import { AuthenticationError, AuthenticationServiceError } from "./auth-service.mjs";
import { AuthorizationError, isLocalUuid, staffHasClassAssignment, staffHasPermission } from "./authorization.mjs";
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
    const isCatalog = url.pathname === "/api/v1/school/catalog";
    const isLearnerList = url.pathname === "/api/v1/school/learners";
    if (!isCatalog && !isLearnerList) return false;
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
      if (isCatalog) {
        const classes = await schoolRepository.listActiveClassesAndSubjects();
        send(response, 200, { classes }, method);
      } else {
        const classId = url.searchParams.get("classId") || null;
        const rawSearch = url.searchParams.get("search");
        const search = rawSearch === null ? null : rawSearch.trim();
        if (classId && !isLocalUuid(classId)) {
          send(response, 400, { error: "The class identifier is invalid." }, method);
          return true;
        }
        if (search !== null && (search.length < 2 || search.length > 80)) {
          send(response, 400, { error: "Search must contain between 2 and 80 characters." }, method);
          return true;
        }
        const classScopedRoles = new Set(["teacher", "class_teacher", "upper_primary_teacher", "lower_primary_teacher", "nursery_head"]);
        const isClassScoped = principal.roles.some(role => classScopedRoles.has(role));
        if (isClassScoped && (!classId || !staffHasClassAssignment({ principal, classId }))) {
          throw new AuthorizationError();
        }
        const learners = await schoolRepository.listLearners({ classId, search });
        send(response, 200, { learners }, method);
      }
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
