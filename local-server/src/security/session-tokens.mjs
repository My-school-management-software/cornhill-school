import {
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeToken(randomBytes) {
  const bytes = randomBytes(32);
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
    throw new TypeError("Secure random source must return exactly 32 bytes.");
  }
  const token = Buffer.from(bytes).toString("base64url");
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("Secure random source produced an invalid token.");
  }
  return token;
}

export function createOpaqueSessionSecrets({ randomBytes = nodeRandomBytes } = {}) {
  if (typeof randomBytes !== "function") {
    throw new TypeError("A cryptographically secure random source is required.");
  }

  const sessionToken = makeToken(randomBytes);
  const csrfToken = makeToken(randomBytes);

  return Object.freeze({
    sessionToken,
    sessionTokenHash: sha256(sessionToken),
    csrfToken,
    csrfTokenHash: sha256(csrfToken)
  });
}

export function hashOpaqueToken(token) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    throw new TypeError("Opaque token has an invalid format.");
  }
  return sha256(token);
}

export function verifyOpaqueToken(token, expectedHash) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return false;
  if (typeof expectedHash !== "string" || !HASH_PATTERN.test(expectedHash)) return false;

  const actual = Buffer.from(sha256(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}