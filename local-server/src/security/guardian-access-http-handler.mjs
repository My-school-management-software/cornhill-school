import { randomInt } from "node:crypto";
import {
  AuthenticationError,
  AuthenticationServiceError,
  CsrfValidationError
} from "./auth-service.mjs";
import { AuthorizationError, isLocalUuid, staffHasPermission } from "./authorization.mjs";
import {
  readCsrfTokenFromCookieHeader,
  readSessionTokenFromCookieHeader
} from "./session-cookies.mjs";

const MAX_BODY_BYTES = 8 * 1024;
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

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function send(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    ...HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(body);
}
async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new InputError("JSON content is required.", 415);
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new InputError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  if (total === 0) throw new InputError("Request body is required.");
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new InputError("Request body is not valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Request body must be a JSON object.");
  }
  return value;
}

export function createGuardianAccessHttpHandler({
  authService,
  repository,
  passwordHasher,
  expectedOrigin
} = {}) {
  if (!authService || typeof authService.authenticate !== "function" ||
      !repository || typeof repository.listContacts !== "function" ||
      typeof repository.issuePin !== "function" ||
      !passwordHasher || typeof passwordHasher.hash !== "function" ||
      typeof passwordHasher.isArgon2idHash !== "function") {
    throw new TypeError("Guardian access API dependencies are incomplete.");
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

  return async function handleGuardianAccess(request, response) {
    let url;
    try { url = new URL(request.url ?? "/", origin); } catch { return false; }
    const contactsPath = url.pathname === "/api/v1/guardian/access/contacts";
    const issuePath = url.pathname === "/api/v1/guardian/access/issue-pin";
    if (!contactsPath && !issuePath) return false;

    const method = String(request.method ?? "GET").toUpperCase();
    if ((contactsPath && method !== "GET") || (issuePath && method !== "POST")) {
      response.writeHead(405, {
        ...HEADERS,
        Allow: contactsPath ? "GET" : "POST",
        "Content-Length": 0
      });
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
    if (method === "POST" && request.headers.origin !== origin.origin) {
      send(response, 403, { error: "The request origin is not authorised." });
      return true;
    }

    try {
      const principal = await authService.authenticate({
        sessionToken: readSessionTokenFromCookieHeader(request.headers.cookie),
        method,
        csrfToken: request.headers["x-cornhill-csrf"] ?? readCsrfTokenFromCookieHeader(request.headers.cookie)
      });
      if (principal.principalType !== "staff" ||
          !staffHasPermission({ principal, permissionCode: "guardians.access_approve" })) {
        throw new AuthorizationError();
      }
      if (contactsPath) {
        const contacts = await repository.listContacts();
        send(response, 200, { contacts });
        return true;
      }

      const body = await readJsonBody(request);
      if (!isLocalUuid(body.contactId)) throw new InputError("Choose a valid guardian contact.");
      if (body.replaceExisting != null && typeof body.replaceExisting !== "boolean") {
        throw new InputError("The PIN replacement confirmation is invalid.");
      }
      const pin = String(randomInt(0, 100_000_000)).padStart(8, "0");
      const pinHash = await passwordHasher.hash(pin);
      if (!passwordHasher.isArgon2idHash(pinHash)) {
        throw new Error("The guardian PIN did not meet the Argon2id policy.");
      }
      const issued = await repository.issuePin({
        contactId: body.contactId,
        actorStaffId: principal.id,
        pinHash,
        replaceExisting: body.replaceExisting === true
      });
      send(response, 201, { ...issued, pin });
    } catch (error) {
      if (error instanceof InputError) send(response, error.status, { error: error.message });
      else if (error instanceof AuthenticationError) send(response, 401, { error: "A valid staff session is required." });
      else if (error instanceof AuthorizationError || error instanceof CsrfValidationError) {
        send(response, 403, { error: "You are not authorised to manage guardian access." });
      } else if (error instanceof AuthenticationServiceError) {
        send(response, 503, { error: "Authentication is temporarily unavailable." });
      } else if (error?.code === "CORNHILL_GUARDIAN_CONFLICT") {
        send(response, 409, { error: error.message });
      } else if (error?.code === "CORNHILL_GUARDIAN_NOT_FOUND") {
        send(response, 404, { error: "The active guardian contact could not be found." });
      } else {
        send(response, 503, { error: "Guardian access could not be updated." });
      }
    }
    return true;
  };
}
