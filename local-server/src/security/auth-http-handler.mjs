import {
  AuthenticationError,
  AuthenticationRateLimitError,
  AuthenticationServiceError,
  CsrfValidationError
} from "./auth-service.mjs";
import {
  buildCsrfCookie,
  buildExpiredCsrfCookie,
  buildExpiredSessionCookie,
  buildSessionCookie,
  readSessionTokenFromCookieHeader
} from "./session-cookies.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none',
  "Strict-Transport-Security": "max-age=86400""
});

class HttpInputError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload, additionalHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...additionalHeaders
  });
  response.end(body);
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] ?? "")
    .split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpInputError(415, "JSON content is required.");
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new HttpInputError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }
  if (total === 0) throw new HttpInputError(400, "Request body is required.");

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpInputError(400, "Request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpInputError(400, "Request body must be a JSON object.");
  }
  return parsed;
}

function validateExpectedOrigin(value) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new TypeError("Authentication API origin must be a valid HTTPS origin.");
  }
  if (origin.protocol !== "https:" || origin.origin !== value ||
      origin.username || origin.password || origin.pathname !== "/" ||
      origin.search || origin.hash) {
    throw new TypeError("Authentication API origin must be an exact HTTPS origin without a path.");
  }
  return origin;
}

function mapAuthError(error) {
  if (error instanceof AuthenticationRateLimitError) {
    return { statusCode: 429, message: error.message };
  }
  if (error instanceof AuthenticationError) {
    return { statusCode: 401, message: error.message };
  }
  if (error instanceof CsrfValidationError) {
    return { statusCode: 403, message: error.message };
  }
  if (error instanceof HttpInputError) {
    return { statusCode: error.statusCode, message: error.message };
  }
  if (error instanceof AuthenticationServiceError) {
    return { statusCode: 503, message: error.message };
  }
  return { statusCode: 503, message: "The authentication service is temporarily unavailable." };
}

export function createAuthHttpHandler({
  authService,
  expectedOrigin
} = {}) {
  if (!authService || typeof authService.loginStaff !== "function" ||
      typeof authService.loginGuardian !== "function" ||
      typeof authService.authenticate !== "function" ||
      typeof authService.logout !== "function") {
    throw new TypeError("A complete local authentication service is required.");
  }
  const origin = validateExpectedOrigin(expectedOrigin);
  return async function handleAuthRequest(request, response) {
    const path = new URL(request.url ?? "/", origin).pathname;
    const method = String(request.method ?? "GET").toUpperCase();

    if (!path.startsWith("/api/v1/auth/")) return false;

    if (request.socket?.encrypted !== true) {
      sendJson(response, 426, { error: "Secure HTTPS transport is required." }, {
        Upgrade: "TLS/1.2"
      });
      return true;
    }

    if (request.headers.host !== origin.host) {
      sendJson(response, 421, { error: "Request host is not authorised." });
      return true;
    }

    try {
      if (method === "POST" &&
          (path === "/api/v1/auth/staff/login" || path === "/api/v1/auth/guardian/login" ||
           path === "/api/v1/auth/logout")) {
        if (request.headers.origin !== origin.origin) {
          sendJson(response, 403, { error: "The request origin is not authorised." });
          return true;
        }
      }

      if (path === "/api/v1/auth/staff/login" && method === "POST") {
        const body = await readJsonBody(request);
        const result = await authService.loginStaff({
          username: body.username,
          password: body.password,
          sourceAddress: request.socket?.remoteAddress ?? null
        });
        sendJson(response, 200, {
          principal: result.principal,
          expiresAt: result.expiresAt
        }, {
          "Set-Cookie": [
            buildSessionCookie(result.sessionToken, result.cookieMaxAgeSeconds),
            buildCsrfCookie(result.csrfToken, result.cookieMaxAgeSeconds)
          ]
        });
        return true;
      }

      if (path === "/api/v1/auth/guardian/login" && method === "POST") {
        const body = await readJsonBody(request);
        const result = await authService.loginGuardian({
          phone: body.phone,
          pin: body.pin,
          sourceAddress: request.socket?.remoteAddress ?? null
        });
        sendJson(response, 200, {
          principal: result.principal,
          expiresAt: result.expiresAt
        }, {
          "Set-Cookie": [
            buildSessionCookie(result.sessionToken, result.cookieMaxAgeSeconds),
            buildCsrfCookie(result.csrfToken, result.cookieMaxAgeSeconds)
          ]
        });
        return true;
      }

      if (path === "/api/v1/auth/session" && method === "GET") {
        const sessionToken = readSessionTokenFromCookieHeader(request.headers.cookie);
        const csrfHeader = request.headers["x-cornhill-csrf"];
        const principal = await authService.authenticate({
          sessionToken,
          method,
          csrfToken: typeof csrfHeader === "string" ? csrfHeader : undefined
        });
        sendJson(response, 200, { principal });
        return true;
      }

      if (path === "/api/v1/auth/logout" && method === "POST") {
        const sessionToken = readSessionTokenFromCookieHeader(request.headers.cookie);
        const csrfHeader = request.headers["x-cornhill-csrf"];
        const revoked = await authService.logout({
          sessionToken,
          csrfToken: typeof csrfHeader === "string" ? csrfHeader : undefined
        });
        if (!revoked) {
          sendJson(response, 401, { error: "The session could not be verified." });
          return true;
        }
        sendJson(response, 200, { status: "signed_out" }, {
          "Set-Cookie": [buildExpiredSessionCookie(), buildExpiredCsrfCookie()]
        });
        return true;
      }

      if (path === "/api/v1/auth/staff/login" ||
          path === "/api/v1/auth/guardian/login" ||
          path === "/api/v1/auth/session" ||
          path === "/api/v1/auth/logout") {
        response.writeHead(405, {
          ...SECURITY_HEADERS,
          Allow: path.endsWith("/session") ? "GET" : "POST",
          "Content-Length": 0
        });
        response.end();
        return true;
      }

      sendJson(response, 404, { error: "Authentication route not found." });
      return true;
    } catch (error) {
      const mapped = mapAuthError(error);
      sendJson(response, mapped.statusCode, { error: mapped.message });
      return true;
    }
  };
}