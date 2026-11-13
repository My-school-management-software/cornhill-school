import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

export const SESSION_COOKIE_NAME = "__Host-cornhill_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

const STAFF_ROLE_PERMISSIONS = Object.freeze({
  director: ["*"],
  headteacher: [
    "learners:read", "learners:write", "academics:read", "academics:write",
    "staff:read", "attendance:read", "attendance:write", "finance:read",
    "finance:approve", "reports:read", "reports:publish", "guardians:approve"
  ],
  deputy_headteacher: [
    "learners:read", "academics:read", "academics:write", "staff:read",
    "attendance:read", "attendance:write", "reports:read"
  ],
  director_of_studies: [
    "learners:read", "academics:read", "academics:write", "reports:read", "reports:publish"
  ],
  bursar: ["learners:read", "finance:read", "finance:write", "finance:approve", "reports:read"],
  deputy_bursar: ["learners:read", "finance:read", "finance:write", "reports:read"],
  teacher: ["learners:read", "academics:read", "academics:write", "reports:read"],
  class_teacher: ["learners:read", "academics:read", "academics:write", "reports:read"],
  upper_primary_teacher: ["learners:read", "academics:read", "academics:write", "reports:read"],
  lower_primary_teacher: ["learners:read", "academics:read", "academics:write", "reports:read"],
  nursery_head: ["learners:read", "academics:read", "academics:write", "reports:read"],
  matron: ["learners:read", "attendance:read"],
  patron: ["learners:read"],
  senior_woman: ["learners:read"],
  senior_man: ["learners:read"],
  store_manager: ["inventory:read", "inventory:write"],
  cook: ["inventory:read"]
});

export function createOpaqueToken(byteLength = 32) {
  if (!Number.isInteger(byteLength) || byteLength < 32 || byteLength > 128) {
    throw new TypeError("Opaque tokens must contain between 32 and 128 random bytes.");
  }
  return randomBytes(byteLength).toString("base64url");
}

export function sha256Hex(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("A non-empty string is required.");
  }
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacFingerprint(value, secret) {
  if (typeof value !== "string" || value.length === 0 ||
      typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new TypeError("A value and an HMAC secret of at least 32 bytes are required.");
  }
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function constantTimeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" ||
      !/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function buildSessionCookie(token, { secure = true, maxAge = SESSION_MAX_AGE_SECONDS } = {}) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,180}$/.test(token)) {
    throw new TypeError("A valid opaque session token is required.");
  }
  if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > SESSION_MAX_AGE_SECONDS) {
    throw new TypeError("Session cookie maxAge is outside the permitted range.");
  }
  if (secure !== true) {
    throw new TypeError("The __Host- session cookie must always be Secure.");
  }
  return SESSION_COOKIE_NAME + "=" + token +
    "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

export function buildClearedSessionCookie() {
  return SESSION_COOKIE_NAME + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

export function parseSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== "string" || cookieHeader.length > 8192) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{40,180}$/.test(value) ? value : null;
  }
  return null;
}

export function hasStaffPermission(roleCodes, permission) {
  if (!Array.isArray(roleCodes) || typeof permission !== "string" || permission.length === 0) {
    return false;
  }
  return roleCodes.some(roleCode => {
    const permissions = STAFF_ROLE_PERMISSIONS[roleCode];
    return Array.isArray(permissions) && (permissions.includes("*") || permissions.includes(permission));
  });
}

export function hasApprovedGuardianLearnerAccess(guardianAccount, learnerId, approvedLinks) {
  if (!guardianAccount || guardianAccount.account_status !== "active" ||
      typeof guardianAccount.id !== "string" || typeof learnerId !== "string" ||
      !Array.isArray(approvedLinks)) return false;

  return approvedLinks.some(link =>
    link.guardian_account_id === guardianAccount.id &&
    link.learner_id === learnerId &&
    link.access_status === "approved"
  );
}

export function redactSensitiveFields(value) {
  const blocked = /password|passwd|pin|token|authorization|cookie|secret|otp|credential/i;
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = blocked.test(key) ? "[REDACTED]" : redactSensitiveFields(item);
  }
  return output;
}
