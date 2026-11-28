import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";

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
const PIN = /^[0-9]{8}$/;
const CHANGE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
function send(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, { ...HEADERS, "Content-Type": "application/json; charset=utf-8", "Content-Length": body.byteLength });
  response.end(body);
}
class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
async function readBody(request) {
  if (String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new InputError("JSON content is required.", 415);
  }
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > 2048) throw new InputError("Request is too large.", 413);
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InputError("Invalid request body."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Invalid request body.");
  return body;
}
function simplePin(value) {
  if (!PIN.test(value)) return true;
  if (/^(.)\1{7}$/.test(value)) return true;
  return ["01234567", "12345678", "23456789", "98765432", "87654321", "76543210"].includes(value);
}

/**
 * Guardian-only self-service PIN change.
 * The current PIN must be verified again on the server, regardless of session.
 * The new PIN is never returned, logged, shown to staff or stored in plaintext.
 * Successful change invalidates all guardian sessions including this one.
 */
export function createGuardianPinChangeHttpHandler({ authService, repository, expectedOrigin } = {}) {
  if (!authService || typeof authService.authenticate !== "function" ||
      !repository || typeof repository.changeGuardianPin !== "function") {
    throw new TypeError("Guardian PIN change dependencies are incomplete.");
  }
  const origin = new URL(expectedOrigin);
  if (origin.protocol !== "https:" || origin.origin !== expectedOrigin ||
      origin.pathname !== "/" || origin.search || origin.hash ||
      origin.username || origin.password) {
    throw new TypeError("An exact HTTPS origin is required.");
  }
  const attempts = new Map();
  return async function handleGuardianPinChange(request, response) {
    let url;
    try { url = new URL(request.url ?? "/", origin); } catch { return false; }
    if (url.pathname !== "/api/v1/guardian/pin/change") return false;
    const method = String(request.method ?? "GET").toUpperCase();
    if (method !== "POST") {
      response.writeHead(405, { ...HEADERS, Allow: "POST", "Content-Length": 0 });
      response.end(); return true;
    }
    if (request.socket?.encrypted !== true) { send(response, 426, { error: "HTTPS is required." }); return true; }
    if (request.headers.host !== origin.host || request.headers.origin !== origin.origin) {
      send(response, 403, { error: "Request origin is not authorised." }); return true;
    }
    try {
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method,
        csrfToken: request.headers["x-cornhill-csrf"] ??
          readCsrfTokenFromCookieHeader(request.headers.cookie)
      });
      if (principal.principalType !== "guardian" || principal.accountStatus !== "active") {
        send(response, 403, { error: "Only the signed-in guardian may change their PIN." }); return true;
      }
      const now = Date.now();
      if (attempts.size > 5000) attempts.clear();
      const state = attempts.get(principal.id);
      const row = state?.expires > now ? state : { count: 0, expires: now + CHANGE_WINDOW_MS };
      row.count += 1;
      attempts.set(principal.id, row);
      if (row.count > MAX_ATTEMPTS) { send(response, 429, { error: "Too many PIN change attempts. Try again later." }); return true; }
      const body = await readBody(request);
      if (!PIN.test(body.currentPin) || !PIN.test(body.newPin) ||
          body.confirmNewPin !== body.newPin || body.currentPin === body.newPin ||
          simplePin(body.newPin)) {
        throw new InputError("Enter the current eight-digit PIN and a different, non-obvious eight-digit PIN twice.");
      }
      await repository.changeGuardianPin({
        guardianAccountId: principal.id,
        currentPin: body.currentPin,
        newPin: body.newPin
      });
      attempts.delete(principal.id);
      send(response, 200, {
        changed: true, requiresSignIn: true,
        message: "PIN updated. Sign in again using your new PIN."
      });
    } catch (error) {
      if (error instanceof InputError) send(response, error.status, { error: error.message });
      else if (error instanceof AuthenticationError) send(response, 401, { error: "Sign in again to manage your PIN." });
      else if (error instanceof CsrfValidationError) send(response, 403, { error: "The request could not be verified." });
      else if (error instanceof AuthenticationServiceError) send(response, 503, { error: "Authentication temporarily unavailable." });
      else if (error?.code === "CORNHILL_CURRENT_PIN_INVALID") send(response, 401, { error: "The current PIN could not be verified." });
      else send(response, 503, { error: "PIN change is temporarily unavailable." });
    }
    return true;
  };
}
