import { hashOpaqueToken } from "./session-tokens.mjs";

export const SESSION_COOKIE_NAME = "__Host-cornhill_session";
export const CSRF_COOKIE_NAME = "__Host-cornhill_csrf";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readNamedCookie(header, expectedName) {
  if (typeof header !== "string" || header.length > 8192) return null;
  const matches = [];
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (name === expectedName) matches.push(value);
  }
  if (matches.length !== 1 || !TOKEN_PATTERN.test(matches[0])) return null;
  return matches[0];
}

export function buildSessionCookie(token, maxAgeSeconds) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new TypeError("Session cookie token is invalid.");
  }
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 86_400) {
    throw new TypeError("Session cookie lifetime is invalid.");
  }
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function buildCsrfCookie(token, maxAgeSeconds) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new TypeError("CSRF cookie token is invalid.");
  }
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 86_400) {
    throw new TypeError("CSRF cookie lifetime is invalid.");
  }
  // Readable only to same-origin frontend code so it can populate the custom
  // X-Cornhill-CSRF request header after a page reload.
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; SameSite=Strict`;
}

export function buildExpiredCsrfCookie() {
  return `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}

export function readSessionTokenFromCookieHeader(header) {
  return readNamedCookie(header, SESSION_COOKIE_NAME);
}

export function readCsrfTokenFromCookieHeader(header) {
  return readNamedCookie(header, CSRF_COOKIE_NAME);
}

export function sessionTokenHashFromCookieHeader(header) {
  const token = readSessionTokenFromCookieHeader(header);
  return token ? hashOpaqueToken(token) : null;
}